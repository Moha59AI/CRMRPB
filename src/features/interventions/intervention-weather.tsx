import { useQuery } from '@tanstack/react-query';
import {
  CircleCheckBig, Clock3, Cloud, CloudFog, CloudLightning, CloudRain, CloudSnow,
  CloudSun, Droplets, Sun, TriangleAlert, Wind,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  cleMeteoIntervention,
  fetchMeteoIntervention,
  type DemandeMeteoIntervention,
  type MeteoIntervention,
} from '@/services/intervention-weather-service';

interface InterventionWeatherProps extends DemandeMeteoIntervention {
  compact?: boolean;
}
const NEUF_JOURS = 9 * 24 * 60 * 60 * 1000;
type NiveauMeteo = 'favorable' | 'vigilance' | 'difficile';

function presentation(symbole: string) {
  const code = symbole.toLocaleLowerCase('en-US');
  if (code.includes('thunder')) return { Icone: CloudLightning, libelle: 'Orages' };
  if (code.includes('snow') || code.includes('sleet')) return { Icone: CloudSnow, libelle: 'Neige' };
  if (code.includes('rain') || code.includes('shower')) return { Icone: CloudRain, libelle: 'Pluie' };
  if (code.includes('fog')) return { Icone: CloudFog, libelle: 'Brouillard' };
  if (code.includes('partlycloudy') || code.includes('fair')) return { Icone: CloudSun, libelle: 'Éclaircies' };
  if (code.includes('cloudy')) return { Icone: Cloud, libelle: 'Nuageux' };
  return { Icone: Sun, libelle: 'Dégagé' };
}

function heureRendezVous(startTime: string) {
  const date = new Date(startTime);
  if (Number.isNaN(date.getTime())) return 'heure inconnue';
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function diagnostic(data: MeteoIntervention): {
  niveau: NiveauMeteo;
  titre: string;
  conseil: string;
} {
  const symbole = data.symbole.toLocaleLowerCase('en-US');
  const orage = symbole.includes('thunder');
  const pluieForte = data.precipitationMm >= 2.5;
  const ventDifficile = data.ventKmh >= 45 || data.rafaleKmh >= 60;

  if (orage || pluieForte || ventDifficile) {
    return {
      niveau: 'difficile',
      titre: 'Conditions difficiles au rendez-vous',
      conseil: 'Privilégier un endroit abrité ou envisager un autre créneau.',
    };
  }

  const risquePluie = data.precipitationMm >= 0.2
    || (data.probabilitePluie != null && data.probabilitePluie >= 50);
  const ventMarque = data.ventKmh >= 30 || data.rafaleKmh >= 45;
  if (risquePluie || ventMarque) {
    return {
      niveau: 'vigilance',
      titre: 'Vigilance météo au rendez-vous',
      conseil: risquePluie
        ? 'Prévoir une protection contre la pluie pour le véhicule et la zone de collage.'
        : 'Sécuriser le vitrage et privilégier un emplacement protégé des rafales.',
    };
  }

  return {
    niveau: 'favorable',
    titre: 'Conditions favorables au rendez-vous',
    conseil: 'Pas de pluie significative ni de vent fort prévus pendant le créneau.',
  };
}

const COULEURS: Record<NiveauMeteo, { compact: string; detail: string; icone: string }> = {
  favorable: {
    compact: 'border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100',
    detail: 'border-emerald-300 bg-emerald-50/80 dark:border-emerald-800 dark:bg-emerald-950/30',
    icone: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200',
  },
  vigilance: {
    compact: 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100',
    detail: 'border-amber-300 bg-amber-50/80 dark:border-amber-800 dark:bg-amber-950/30',
    icone: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-200',
  },
  difficile: {
    compact: 'border-red-300 bg-red-50 text-red-950 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100',
    detail: 'border-red-300 bg-red-50/80 dark:border-red-800 dark:bg-red-950/30',
    icone: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200',
  },
};

export function InterventionWeather({ compact = false, ...demande }: InterventionWeatherProps) {
  const echeance = new Date(demande.startTime).getTime();
  const maintenant = Date.now();
  const aUneLocalisation = Boolean(
    demande.citycode || demande.codePostal || demande.ville
      || (demande.latitude != null && demande.longitude != null),
  );
  const estPassee = !Number.isFinite(echeance) || echeance < maintenant - 60 * 60 * 1000;
  const estTropLointaine = echeance > maintenant + NEUF_JOURS;

  const meteo = useQuery({
    queryKey: cleMeteoIntervention(demande),
    queryFn: () => fetchMeteoIntervention(demande),
    enabled: aUneLocalisation && !estPassee && !estTropLointaine,
    staleTime: 30 * 60 * 1000,
    gcTime: 12 * 60 * 60 * 1000,
    retry: 1,
  });

  if (!aUneLocalisation || estPassee) return null;

  if (estTropLointaine) {
    return compact ? null : (
      <p className="text-xs text-muted-foreground">
        Prévision météo disponible neuf jours avant l’intervention.
      </p>
    );
  }

  if (meteo.isLoading) {
    return (
      <span className={cn(
        'inline-flex animate-pulse rounded-full bg-muted',
        compact ? 'h-5 w-24' : 'h-9 w-full',
      )} aria-label="Chargement de la météo" />
    );
  }

  if (meteo.isError || !meteo.data) {
    return compact ? null : (
      <p className="text-xs text-muted-foreground">Météo momentanément indisponible.</p>
    );
  }

  const { Icone, libelle } = presentation(meteo.data.symbole);
  const etat = diagnostic(meteo.data);
  const couleurs = COULEURS[etat.niveau];
  const heure = heureRendezVous(demande.startTime);
  const pluie = meteo.data.precipitationMm > 0
    ? `${meteo.data.precipitationMm.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} mm`
    : '0 mm';
  const probabilite = meteo.data.probabilitePluie != null
    ? `${meteo.data.probabilitePluie} %`
    : null;

  if (compact) {
    return (
      <span
        className={cn(
          'mt-1.5 flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-2 py-1.5 text-[11px] font-semibold',
          couleurs.compact,
        )}
        title={`${etat.titre} à ${heure}. Pluie ${pluie}, vent ${meteo.data.ventKmh} km/h, rafales ${meteo.data.rafaleKmh} km/h.`}
        aria-label={`${etat.titre} à ${heure}`}
      >
        <Icone className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>Au RDV {heure}</span>
        <span className="inline-flex items-center gap-1">
          <Droplets className="h-3 w-3" aria-hidden />
          Pluie {pluie}{probabilite ? ` · ${probabilite}` : ''}
        </span>
        <span className="inline-flex items-center gap-1">
          <Wind className="h-3 w-3" aria-hidden />
          {meteo.data.ventKmh} km/h · raf. {meteo.data.rafaleKmh}
        </span>
      </span>
    );
  }

  return (
    <div className={cn('rounded-xl border p-3', couleurs.detail)}>
      <div className="flex items-start gap-3">
        <span className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-full shadow-sm',
          couleurs.icone,
        )}>
          {etat.niveau === 'favorable'
            ? <CircleCheckBig className="h-5 w-5" aria-hidden />
            : <TriangleAlert className="h-5 w-5" aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <div>
              <p className="font-semibold text-foreground">{etat.titre}</p>
              <p className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-foreground">
                <Clock3 className="h-3.5 w-3.5" aria-hidden /> Au RDV à {heure}
              </p>
            </div>
            <p className="text-lg font-semibold tabular text-foreground">
              {Math.round(meteo.data.temperature)} °C
            </p>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">{libelle} · {meteo.data.lieu}</p>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-current/10 bg-white/70 p-2 dark:bg-black/10">
              <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <Droplets className="h-3.5 w-3.5" aria-hidden /> Pluie pendant l’heure
              </p>
              <p className="mt-1 text-sm font-bold text-foreground">
                {pluie}{probabilite ? ` · risque ${probabilite}` : ''}
              </p>
            </div>
            <div className="rounded-lg border border-current/10 bg-white/70 p-2 dark:bg-black/10">
              <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <Wind className="h-3.5 w-3.5" aria-hidden /> Vent et rafales
              </p>
              <p className="mt-1 text-sm font-bold text-foreground">
                {meteo.data.ventKmh} km/h · Rafales {meteo.data.rafaleKmh} km/h
              </p>
            </div>
          </div>
          <p className="mt-2 text-xs font-medium text-foreground">{etat.conseil}</p>
        </div>
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">
        Données météo :{' '}
        <a
          href="https://api.met.no/weatherapi/locationforecast/2.0/documentation"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2"
        >
          MET Norway
        </a>
      </p>
    </div>
  );
}
