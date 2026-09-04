import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Navigation, Loader2, CircleAlert, X, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { lienItineraire } from '@/services/adresse-service';
import type { InterventionCarte } from '@/services/interventions-carte-service';

/**
 * Carte des interventions planifiées.
 *
 * Ce qui se place ici, ce sont les rendez-vous où quelqu'un doit se rendre —
 * pas le carnet de clients. Un lead « à rappeler » n'a pas de lieu
 * d'intervention : l'afficher noierait les déplacements réels dans le bruit.
 *
 * Fond de plan IGN (Géoplateforme) : service public, sans clé ni quota
 * commercial, et cohérent avec la Base Adresse Nationale utilisée pour
 * géocoder. Les tuiles OpenStreetMap grand public interdisent cet usage.
 *
 * Deux principes tenus :
 *
 * - **Un point approximatif ne se présente pas comme exact.** Une
 *   intervention localisée au centre de sa commune est dessinée en creux et
 *   n'offre pas d'itinéraire : y envoyer un technicien le mènerait devant la
 *   mairie.
 *
 * - **Rien ne disparaît en silence.** Les interventions sans coordonnées sont
 *   comptées et listables. Une carte qui masque la moitié de la tournée sans
 *   le dire est pire qu'une absence de carte.
 */

const CENTRE_FRANCE: [number, number] = [46.6, 2.4];

const FOND_IGN =
  'https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile' +
  '&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM' +
  '&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/png';

const COULEUR_STATUT: Record<string, string> = {
  scheduled: '#3b82f6',
  confirmed: '#10b981',
  completed: '#94a3b8',
  cancelled: '#ef4444',
  no_show: '#ef4444',
};

const LIBELLE_STATUT: Record<string, string> = {
  scheduled: 'Planifié',
  confirmed: 'Confirmé',
  completed: 'Réalisé',
  cancelled: 'Annulé',
  no_show: 'Absent',
};

interface InterventionLocalisee extends InterventionCarte {
  latitude: number;
  longitude: number;
}

function estLocalisee(i: InterventionCarte): i is InterventionLocalisee {
  return i.latitude != null && i.longitude != null;
}

function heure(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function jourEtHeure(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    weekday: 'short', day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Marqueur dessiné en HTML plutôt qu'avec l'icône par défaut de Leaflet :
 * celle-ci charge deux PNG par chemin relatif, que le bundler ne résout pas.
 *
 * Le numéro d'ordre est l'information la plus utile sur une tournée : il dit
 * dans quel sens enchaîner les rendez-vous.
 */
function marqueur(i: InterventionLocalisee, ordre: number): L.DivIcon {
  const couleur = COULEUR_STATUT[i.statut] ?? '#94a3b8';
  const approximatif = i.geo_precision !== 'exact';

  return L.divIcon({
    className: '',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -14],
    html: `<span style="
      display:flex;align-items:center;justify-content:center;
      width:24px;height:24px;border-radius:9999px;
      background:${approximatif ? 'rgba(255,255,255,.92)' : couleur};
      color:${approximatif ? couleur : '#fff'};
      border:2.5px solid ${couleur};
      box-shadow:0 0 0 2px rgba(255,255,255,.9);
      font:600 11px/1 Inter,system-ui,sans-serif;
    ">${ordre}</span>`,
  });
}

function Recadrer({ points }: { points: InterventionLocalisee[] }) {
  const carte = useMap();

  useEffect(() => {
    if (points.length === 0) return;

    if (points.length === 1) {
      carte.setView([points[0].latitude, points[0].longitude], 14);
    } else {
      // Des bornes de surface nulle feraient zoomer au maximum, sur un ecran
      // de tuiles grises.
      const bornes = L.latLngBounds(points.map((p) => [p.latitude, p.longitude]));
      carte.fitBounds(bornes, { padding: [48, 48], maxZoom: 15 });
    }
  }, [points, carte]);

  return null;
}

interface CarteInterventionsProps {
  interventions: InterventionCarte[];
  onOuvrirLead: (leadId: string) => void;
  /** Interventions localisables mais pas encore localisées. */
  nonLocalisees?: number;
  onLocaliser?: () => void;
  localisationEnCours?: boolean;
  avancement?: { traites: number; total: number } | null;
  /**
   * La période dépasse le plafond de chargement. Se dit, plutôt que de
   * laisser croire que la tournée affichée est complète.
   */
  tronque?: boolean;
}

export function CarteInterventions({
  interventions, onOuvrirLead, nonLocalisees = 0,
  onLocaliser, localisationEnCours, avancement, tronque = false,
}: CarteInterventionsProps) {
  const [listeOuverte, setListeOuverte] = useState(false);

  const localisees = useMemo(() => interventions.filter(estLocalisee), [interventions]);
  const sansPoint = useMemo(() => interventions.filter((i) => !estLocalisee(i)), [interventions]);
  const approximatives = localisees.filter((i) => i.geo_precision !== 'exact').length;

  if (interventions.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-12 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-muted/50">
          <MapPin className="h-7 w-7 text-muted-foreground" strokeWidth={1.5} />
        </div>
        <h3 className="text-sm font-semibold text-foreground">Aucune intervention sur la période</h3>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          La carte affiche les rendez-vous d'intervention. Changez de période, ou
          planifiez un rendez-vous depuis une fiche.
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={CENTRE_FRANCE}
        zoom={6}
        scrollWheelZoom
        className="h-full w-full"
        maxZoom={19}
      >
        <TileLayer
          url={FOND_IGN}
          attribution='&copy; <a href="https://www.ign.fr/">IGN</a> — Géoplateforme'
          maxZoom={19}
        />

        <Recadrer points={localisees} />

        {localisees.map((i, index) => (
          <Marker
            key={i.appointment_id}
            position={[i.latitude, i.longitude]}
            icon={marqueur(i, index + 1)}
          >
            <Popup>
              <PopupIntervention
                intervention={i}
                ordre={index + 1}
                onOuvrir={() => i.lead_id && onOuvrirLead(i.lead_id)}
              />
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      <div className="pointer-events-none absolute left-4 top-4 z-[400] flex flex-col gap-2">
        <div className="pointer-events-auto rounded-xl border border-border bg-card/95 px-3 py-2 shadow-sm backdrop-blur">
          <p className="text-sm font-semibold tabular-nums text-foreground">
            {localisees.length} intervention{localisees.length > 1 ? 's' : ''} sur la carte
          </p>
          {approximatives > 0 && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              dont {approximatives} au centre de commune
            </p>
          )}
        </div>

        {tronque && (
          <div className="pointer-events-auto max-w-xs rounded-xl border border-due/30 bg-due-soft/95 px-3 py-2 shadow-sm backdrop-blur">
            <p className="flex items-start gap-1.5 text-xs font-medium text-due">
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Période trop large : seules les {interventions.length} premières
                interventions sont chargées. Resserrez la période pour voir la suite.
              </span>
            </p>
          </div>
        )}

        {sansPoint.length > 0 && (
          <div className="pointer-events-auto max-w-xs rounded-xl border border-due/30 bg-due-soft/95 px-3 py-2 shadow-sm backdrop-blur">
            <p className="flex items-center gap-1.5 text-xs font-medium text-due">
              <CircleAlert className="h-3.5 w-3.5 shrink-0" />
              {sansPoint.length} non localisée{sansPoint.length > 1 ? 's' : ''}
            </p>

            {nonLocalisees > 0 && onLocaliser && (
              <Button
                size="sm"
                variant="outline"
                className="mt-2 h-7 w-full rounded-full bg-card text-xs"
                onClick={onLocaliser}
                disabled={localisationEnCours}
              >
                {localisationEnCours ? (
                  <>
                    <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                    {avancement ? `${avancement.traites}/${avancement.total}` : 'En cours…'}
                  </>
                ) : (
                  'Les localiser'
                )}
              </Button>
            )}

            <button
              type="button"
              className="mt-1.5 text-xs text-due underline-offset-2 hover:underline"
              onClick={() => setListeOuverte(true)}
            >
              Voir lesquelles
            </button>
          </div>
        )}
      </div>

      <div className="pointer-events-none absolute bottom-6 left-4 z-[400] rounded-xl border border-border bg-card/95 px-3 py-2 text-xs shadow-sm backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="flex h-4 w-4 items-center justify-center rounded-full border-2 border-muted-foreground bg-muted-foreground text-[9px] font-semibold text-background">
            1
          </span>
          <span className="text-muted-foreground">Adresse exacte</span>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className="flex h-4 w-4 items-center justify-center rounded-full border-2 border-muted-foreground bg-card text-[9px] font-semibold text-muted-foreground">
            1
          </span>
          <span className="text-muted-foreground">Centre de commune</span>
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Numérotées dans l'ordre des rendez-vous.
        </p>
      </div>

      {listeOuverte && (
        <ListeNonLocalisees
          interventions={sansPoint}
          onOuvrirLead={onOuvrirLead}
          onFermer={() => setListeOuverte(false)}
        />
      )}
    </div>
  );
}

function PopupIntervention({
  intervention, ordre, onOuvrir,
}: { intervention: InterventionLocalisee; ordre: number; onOuvrir: () => void }) {
  const exact = intervention.geo_precision === 'exact';
  const itineraire = exact ? lienItineraire({
    address: intervention.adresse,
    postal_code: intervention.code_postal,
    city: intervention.ville,
    latitude: intervention.latitude,
    longitude: intervention.longitude,
  }) : null;

  return (
    <div className="min-w-[210px] space-y-2">
      <div>
        <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
            {ordre}
          </span>
          {intervention.client ?? intervention.titre}
        </p>
        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {jourEtHeure(intervention.debut)} – {heure(intervention.fin)}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {[intervention.adresse, intervention.code_postal, intervention.ville]
            .filter(Boolean).join(' ') || 'Adresse inconnue'}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="outline" className="rounded-full text-[10px] font-normal">
          {LIBELLE_STATUT[intervention.statut] ?? intervention.statut}
        </Badge>
        {intervention.immatriculation && (
          <Badge variant="outline" className="rounded-full text-[10px] font-normal tabular">
            {intervention.immatriculation}
          </Badge>
        )}
      </div>

      {!exact && (
        <p className="rounded-lg bg-due-soft px-2 py-1 text-[11px] leading-snug text-due">
          Position approximative : centre de la commune, pas l'adresse.
        </p>
      )}

      <div className="flex gap-1.5">
        {intervention.telephone && (
          <a href={`tel:${intervention.telephone}`} className="flex-1">
            <Button size="sm" variant="outline" className="h-7 w-full rounded-full text-xs">
              Appeler
            </Button>
          </a>
        )}
        {itineraire && (
          <a href={itineraire} target="_blank" rel="noopener noreferrer" className="flex-1">
            <Button size="sm" className="h-7 w-full rounded-full text-xs">
              <Navigation className="mr-1 h-3 w-3" />
              Itinéraire
            </Button>
          </a>
        )}
      </div>

      {intervention.lead_id && (
        <button
          type="button"
          onClick={onOuvrir}
          className="w-full text-xs font-medium text-primary hover:underline"
        >
          Ouvrir la fiche
        </button>
      )}
    </div>
  );
}

function ListeNonLocalisees({
  interventions, onOuvrirLead, onFermer,
}: {
  interventions: InterventionCarte[];
  onOuvrirLead: (leadId: string) => void;
  onFermer: () => void;
}) {
  useEffect(() => {
    const auClavier = (e: KeyboardEvent) => e.key === 'Escape' && onFermer();
    document.addEventListener('keydown', auClavier);
    return () => document.removeEventListener('keydown', auClavier);
  }, [onFermer]);

  return (
    <div
      className={cn(
        'absolute right-0 top-0 z-[500] flex h-full w-80 flex-col',
        'border-l border-border bg-card shadow-lg',
      )}
    >
      <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Non localisées</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Sans adresse exploitable, ou adresse introuvable dans le référentiel.
            Une adresse propre au rendez-vous n'emprunte jamais la position du
            client : elle désigne un autre lieu.
          </p>
        </div>
        <Button
          variant="ghost" size="sm"
          className="h-7 w-7 shrink-0 rounded-full p-0"
          onClick={onFermer}
          aria-label="Fermer"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 divide-y divide-border overflow-y-auto">
        {interventions.map((i) => (
          <button
            key={i.appointment_id}
            type="button"
            onClick={() => i.lead_id && onOuvrirLead(i.lead_id)}
            disabled={!i.lead_id}
            className="flex w-full items-start gap-2 px-4 py-2.5 text-left hover:bg-muted/40 disabled:opacity-60"
          >
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0">
              <span className="block truncate text-sm text-foreground">
                {i.client ?? i.titre}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {jourEtHeure(i.debut)} · {i.adresse ?? 'Aucune adresse'}
              </span>
              {i.lieu_propre && (
                <span className="mt-0.5 block text-[11px] text-due">
                  Adresse propre au rendez-vous, à localiser
                </span>
              )}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
