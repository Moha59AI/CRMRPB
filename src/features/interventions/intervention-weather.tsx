import { useQuery } from '@tanstack/react-query';
import {
  Cloud, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Sun, Wind,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  cleMeteoIntervention,
  fetchMeteoIntervention,
  type DemandeMeteoIntervention,
} from '@/services/intervention-weather-service';

interface InterventionWeatherProps extends DemandeMeteoIntervention {
  compact?: boolean;
}
const NEUF_JOURS = 9 * 24 * 60 * 60 * 1000;

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
  const pluie = meteo.data.precipitationMm > 0
    ? `${meteo.data.precipitationMm.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} mm`
    : 'sec';

  if (compact) {
    return (
      <span
        className="mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-medium text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100"
        title={`Prévision ${libelle.toLocaleLowerCase('fr-FR')} à ${meteo.data.lieu}, vent ${meteo.data.ventKmh} km/h`}
      >
        <Icone className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>{Math.round(meteo.data.temperature)} °C</span>
        <span className="text-sky-700 dark:text-sky-300">· {pluie}</span>
      </span>
    );
  }

  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-3 dark:border-sky-900 dark:bg-sky-950/30">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/80 text-sky-700 shadow-sm dark:bg-sky-950 dark:text-sky-200">
          <Icone className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-medium text-foreground">{libelle}</p>
            <p className="text-lg font-semibold tabular text-foreground">
              {Math.round(meteo.data.temperature)} °C
            </p>
          </div>
          <p className="truncate text-xs text-muted-foreground">{meteo.data.lieu}</p>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>{meteo.data.precipitationMm > 0 ? `Précipitations ${pluie}` : 'Pas de pluie prévue'}</span>
            <span className="inline-flex items-center gap-1">
              <Wind className="h-3 w-3" aria-hidden /> {meteo.data.ventKmh} km/h
            </span>
          </div>
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
