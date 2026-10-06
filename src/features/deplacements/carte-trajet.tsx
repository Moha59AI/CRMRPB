// Le tracé réel d'un déplacement
//
// Même cartographie que la carte des interventions : Leaflet sur le fond IGN
// de la Géoplateforme, cohérent avec la Base Adresse Nationale qui place les
// points. Rien de nouveau n'est introduit ici.
//
// Le trait suit la géométrie renvoyée par OpenRouteService. Une ligne droite
// entre départ et arrivée serait un mensonge : elle traverserait la Deûle, et
// un trajet de 18 km apparaîtrait comme 11.

import { useEffect, useMemo } from 'react';
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const FOND_IGN =
  'https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile' +
  '&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM' +
  '&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/png';

export interface CarteTrajetProps {
  depart: { latitude: number; longitude: number; label?: string | null };
  arrivee: { latitude: number; longitude: number; label?: string | null };
  /** Tracé OpenRouteService, en [longitude, latitude]. */
  geometrie: [number, number][] | null;
  className?: string;
}

/**
 * Pastille dessinée en HTML.
 *
 * L'icône par défaut de Leaflet charge deux PNG par chemin relatif, que le
 * bundler ne résout pas — même raison que sur la carte des interventions.
 */
function pastille(couleur: string, lettre: string): L.DivIcon {
  return L.divIcon({
    className: '',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    html: `<span style="
      display:flex;align-items:center;justify-content:center;
      width:26px;height:26px;border-radius:9999px;
      background:${couleur};color:#fff;
      border:2.5px solid #fff;
      box-shadow:0 1px 4px rgba(0,0,0,.35);
      font:600 11px/1 Inter,system-ui,sans-serif;
    ">${lettre}</span>`,
  });
}

const DEPART = pastille('#0f172a', 'D');
const ARRIVEE = pastille('#16a34a', 'C');

/**
 * Cadre sur l'ensemble du parcours.
 *
 * Les bornes suivent le tracé quand il existe, pas seulement les deux points :
 * un itinéraire qui contourne une agglomération sort du rectangle formé par
 * ses extrémités, et une moitié du trait passerait hors champ.
 */
function Recadrer({ points }: { points: [number, number][] }) {
  const carte = useMap();

  useEffect(() => {
    if (points.length === 0) return;

    const cadrer = () => {
      // Leaflet mesure son conteneur à la création. Ici la carte naît dans un
      // encart dont la hauteur se fixe après coup : sans remesure, elle croit
      // tenir sur quelques pixels, ne charge les tuiles que pour cette
      // surface-là et laisse le reste gris.
      carte.invalidateSize({ animate: false });

      if (points.length === 1) {
        carte.setView(points[0], 14, { animate: false });
        return;
      }
      carte.fitBounds(L.latLngBounds(points), {
        padding: [34, 34], maxZoom: 15, animate: false,
      });
    };

    cadrer();
    // Et une fois encore quand la place change. Un premier cadrage calculé sur
    // une largeur provisoire laisse le parcours décalé hors champ : c'est le
    // cas d'un encart qui s'ouvre, ou d'une fenêtre qu'on redimensionne.
    carte.on('resize', cadrer);
    return () => { carte.off('resize', cadrer); };
  }, [points, carte]);

  return null;
}

export function CarteTrajet({ depart, arrivee, geometrie, className }: CarteTrajetProps) {
  const depuis: [number, number] = [depart.latitude, depart.longitude];
  const vers: [number, number] = [arrivee.latitude, arrivee.longitude];

  // OpenRouteService rend du GeoJSON, donc [longitude, latitude] ; Leaflet
  // attend l'inverse. Confondre les deux place le trajet en mer.
  const trace = useMemo<[number, number][]>(
    () => (geometrie ?? []).map(([lon, lat]) => [lat, lon]),
    [geometrie],
  );
  // Référence stable : le cadrage se réabonne à l'événement de redimension,
  // et un tableau recréé à chaque rendu le ferait en boucle.
  const cadre = useMemo<[number, number][]>(
    () => (trace.length > 1 ? trace : [depuis, vers]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trace, depart.latitude, depart.longitude, arrivee.latitude, arrivee.longitude],
  );

  return (
    <div className={className}>
      <MapContainer
        center={depuis}
        zoom={11}
        scrollWheelZoom={false}
        className="h-full w-full"
        maxZoom={19}
      >
        <TileLayer
          url={FOND_IGN}
          attribution='&copy; <a href="https://www.ign.fr/">IGN</a> — Géoplateforme'
          maxZoom={19}
        />

        {/* Deux traits superposés : un liseré blanc dessous pour que le vert
            reste lisible au-dessus d'une zone urbaine dense. */}
        {trace.length > 1 && (
          <>
            <Polyline positions={trace} pathOptions={{ color: '#ffffff', weight: 7, opacity: 0.9 }} />
            <Polyline positions={trace} pathOptions={{ color: '#16a34a', weight: 4, opacity: 1 }} />
          </>
        )}

        <Marker position={depuis} icon={DEPART}>
          <Tooltip direction="top">{depart.label || 'Départ'}</Tooltip>
        </Marker>
        <Marker position={vers} icon={ARRIVEE}>
          <Tooltip direction="top">{arrivee.label || 'Client'}</Tooltip>
        </Marker>

        <Recadrer points={cadre} />
      </MapContainer>
    </div>
  );
}
