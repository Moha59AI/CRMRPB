import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Navigation, Loader2, CircleAlert, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { lienItineraire } from '@/services/adresse-service';
import { statusLabels } from './lead-shared';
import type { Lead } from '@/types';

/**
 * Carte des interventions.
 *
 * Fond de plan IGN (Géoplateforme) : service public, sans clé ni quota
 * commercial, et cohérent avec la Base Adresse Nationale utilisée pour
 * géocoder. Les tuiles OpenStreetMap grand public interdisent cet usage.
 *
 * Deux principes tenus ici :
 *
 * - **Un point approximatif ne se présente pas comme exact.** Un lead
 *   localisé au centre de sa commune est dessiné en creux, et aucun
 *   itinéraire n'est proposé : y envoyer un technicien le mènerait devant la
 *   mairie.
 *
 * - **Rien ne disparaît en silence.** Les leads sans coordonnées sont
 *   comptés et listables. Une carte qui masque la moitié des dossiers sans
 *   le dire est pire qu'une absence de carte.
 */

// Centre de la France metropolitaine, quand il n'y a encore rien a montrer.
const CENTRE_FRANCE: [number, number] = [46.6, 2.4];

const FOND_IGN =
  'https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile' +
  '&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM' +
  '&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/png';

const COULEUR_STATUT: Record<string, string> = {
  new: '#10b981',
  to_call: '#f59e0b',
  calling: '#0ea5e9',
  nrp: '#ef4444',
  interested: '#f59e0b',
  documents_requested: '#94a3b8',
  documents_received: '#94a3b8',
  appointment_scheduled: '#3b82f6',
  lost: '#ef4444',
  converted: '#10b981',
};

interface LeadLocalise extends Lead {
  latitude: number;
  longitude: number;
}

function estLocalise(l: Lead): l is LeadLocalise {
  return l.latitude != null && l.longitude != null;
}

/**
 * Marqueur dessiné en HTML plutôt qu'avec l'icône par défaut de Leaflet :
 * celle-ci charge deux PNG par chemin relatif, que le bundler ne résout pas.
 */
function marqueur(lead: LeadLocalise): L.DivIcon {
  const couleur = COULEUR_STATUT[lead.status] ?? '#94a3b8';
  const approximatif = lead.geo_precision === 'approximatif';

  return L.divIcon({
    className: '',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -10],
    html: `<span style="
      display:block;width:18px;height:18px;border-radius:9999px;
      background:${approximatif ? 'transparent' : couleur};
      border:3px solid ${couleur};
      box-shadow:0 0 0 2px rgba(255,255,255,.9);
    "></span>`,
  });
}

/** Recadre la carte sur les points dès qu'ils changent. */
function Recadrer({ points }: { points: LeadLocalise[] }) {
  const carte = useMap();

  useEffect(() => {
    if (points.length === 0) return;

    const bornes = L.latLngBounds(points.map((p) => [p.latitude, p.longitude]));
    // Un point unique donne des bornes de surface nulle : Leaflet zoomerait
    // au maximum, sur un ecran de tuiles grises.
    if (points.length === 1) {
      carte.setView([points[0].latitude, points[0].longitude], 14);
    } else {
      carte.fitBounds(bornes, { padding: [48, 48], maxZoom: 15 });
    }
  }, [points, carte]);

  return null;
}

interface CarteInterventionsProps {
  leads: Lead[];
  onOuvrirLead: (lead: Lead) => void;
  /** Nombre de leads localisables mais pas encore localisés. */
  nonLocalises?: number;
  onLocaliser?: () => void;
  localisationEnCours?: boolean;
  avancement?: { traites: number; total: number } | null;
}

export function CarteInterventions({
  leads, onOuvrirLead, nonLocalises = 0,
  onLocaliser, localisationEnCours, avancement,
}: CarteInterventionsProps) {
  const [listeOuverte, setListeOuverte] = useState(false);

  const localises = useMemo(() => leads.filter(estLocalise), [leads]);
  const sansPoint = useMemo(() => leads.filter((l) => !estLocalise(l)), [leads]);
  const approximatifs = localises.filter((l) => l.geo_precision === 'approximatif').length;

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={CENTRE_FRANCE}
        zoom={6}
        scrollWheelZoom
        className="h-full w-full"
        // Le fond IGN est lisible jusqu'au 19 ; au-dela les tuiles manquent.
        maxZoom={19}
      >
        <TileLayer
          url={FOND_IGN}
          attribution='&copy; <a href="https://www.ign.fr/">IGN</a> — Géoplateforme'
          maxZoom={19}
        />

        <Recadrer points={localises} />

        {localises.map((lead) => (
          <Marker
            key={lead.id}
            position={[lead.latitude, lead.longitude]}
            icon={marqueur(lead)}
          >
            <Popup>
              <PopupLead lead={lead} onOuvrir={() => onOuvrirLead(lead)} />
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Bandeau de synthèse : ce que la carte montre, et ce qu'elle ne
          montre pas. */}
      <div className="pointer-events-none absolute left-4 top-4 z-[400] flex flex-col gap-2">
        <div className="pointer-events-auto rounded-xl border border-border bg-card/95 px-3 py-2 shadow-sm backdrop-blur">
          <p className="text-sm font-semibold tabular-nums text-foreground">
            {localises.length} interventio{localises.length > 1 ? 'ns' : 'n'} sur la carte
          </p>
          {approximatifs > 0 && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              dont {approximatifs} au centre de commune
            </p>
          )}
        </div>

        {sansPoint.length > 0 && (
          <div className="pointer-events-auto max-w-xs rounded-xl border border-due/30 bg-due-soft/95 px-3 py-2 shadow-sm backdrop-blur">
            <p className="flex items-center gap-1.5 text-xs font-medium text-due">
              <CircleAlert className="h-3.5 w-3.5 shrink-0" />
              {sansPoint.length} non localisé{sansPoint.length > 1 ? 's' : ''}
            </p>

            {nonLocalises > 0 && onLocaliser && (
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
              Voir lesquels
            </button>
          </div>
        )}
      </div>

      {/* Légende */}
      <div className="pointer-events-none absolute bottom-6 left-4 z-[400] rounded-xl border border-border bg-card/95 px-3 py-2 text-xs shadow-sm backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full border-[3px] border-muted-foreground bg-muted-foreground" />
          <span className="text-muted-foreground">Adresse exacte</span>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className="h-3 w-3 rounded-full border-[3px] border-muted-foreground bg-transparent" />
          <span className="text-muted-foreground">Centre de commune</span>
        </div>
      </div>

      {listeOuverte && (
        <ListeNonLocalises
          leads={sansPoint}
          onOuvrirLead={onOuvrirLead}
          onFermer={() => setListeOuverte(false)}
        />
      )}
    </div>
  );
}

function PopupLead({ lead, onOuvrir }: { lead: LeadLocalise; onOuvrir: () => void }) {
  const nom = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Sans nom';
  const exact = lead.geo_precision === 'exact';
  const itineraire = exact ? lienItineraire(lead) : null;

  return (
    <div className="min-w-[200px] space-y-2">
      <div>
        <p className="text-sm font-semibold text-foreground">{nom}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {[lead.address, lead.postal_code, lead.city].filter(Boolean).join(' ') || 'Adresse inconnue'}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="outline" className="rounded-full text-[10px] font-normal">
          {statusLabels[lead.status] ?? lead.status}
        </Badge>
        {lead.vehicle_registration && (
          <Badge variant="outline" className="rounded-full text-[10px] font-normal tabular">
            {lead.vehicle_registration}
          </Badge>
        )}
      </div>

      {!exact && (
        <p className="rounded-lg bg-due-soft px-2 py-1 text-[11px] leading-snug text-due">
          Position approximative : centre de la commune, pas l'adresse.
        </p>
      )}

      <div className="flex gap-1.5">
        <Button size="sm" className="h-7 flex-1 rounded-full text-xs" onClick={onOuvrir}>
          Ouvrir
        </Button>
        {itineraire && (
          <a href={itineraire} target="_blank" rel="noopener noreferrer" className="flex-1">
            <Button size="sm" variant="outline" className="h-7 w-full rounded-full text-xs">
              <Navigation className="mr-1 h-3 w-3" />
              Itinéraire
            </Button>
          </a>
        )}
      </div>
    </div>
  );
}

function ListeNonLocalises({
  leads, onOuvrirLead, onFermer,
}: { leads: Lead[]; onOuvrirLead: (l: Lead) => void; onFermer: () => void }) {
  const panneau = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const auClavier = (e: KeyboardEvent) => e.key === 'Escape' && onFermer();
    document.addEventListener('keydown', auClavier);
    return () => document.removeEventListener('keydown', auClavier);
  }, [onFermer]);

  return (
    <div
      ref={panneau}
      className={cn(
        'absolute right-0 top-0 z-[500] flex h-full w-80 flex-col',
        'border-l border-border bg-card shadow-lg',
      )}
    >
      <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Non localisés</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Sans adresse exploitable, ou adresse introuvable dans le référentiel.
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
        {leads.map((lead) => {
          const nom = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Sans nom';
          return (
            <button
              key={lead.id}
              type="button"
              onClick={() => onOuvrirLead(lead)}
              className="flex w-full items-start gap-2 px-4 py-2.5 text-left hover:bg-muted/40"
            >
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0">
                <span className="block truncate text-sm text-foreground">{nom}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {[lead.address, lead.city].filter(Boolean).join(' ') || 'Aucune adresse'}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
