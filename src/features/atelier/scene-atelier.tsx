// La scène 3D de l'atelier
//
// Vue isométrique : caméra orthographique de trois quarts, comme sur une
// maquette. Une perspective ferait varier la taille des véhicules selon leur
// place dans l'atelier, ce qui gênerait la comparaison d'un poste à l'autre.
//
// Tout le texte reste en HTML, au-dessus du canvas. Rien d'écrit dans la
// scène : un libellé en 3D se lit mal de biais, ne se sélectionne pas, et
// n'arrive pas aux lecteurs d'écran.

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Matrix4, Vector3, type OrthographicCamera } from 'three';
import type { Intervention } from '@/services/interventions-service';
import { DecorAtelier } from './decor-atelier';
import { Vehicule3D } from './vehicule-3d';
import {
  EMPRISE, ZONES, couleurCarrosserie, placerVehicules, type PlaceVehicule,
} from './zones-atelier';

export interface SceneAtelierProps {
  interventions: Intervention[];
  selection: string | null;
  onSelectionner: (id: string | null) => void;
  /** Recalculé à chaque rendu du parent : fige l'heure pour toute la scène. */
  maintenant: Date;
}

export function SceneAtelier({
  interventions, selection, onSelectionner, maintenant,
}: SceneAtelierProps) {
  const places = useMemo(
    () => placerVehicules(interventions, maintenant),
    [interventions, maintenant],
  );
  const [contextePerdu, setContextePerdu] = useState(false);
  const [etiquettes, setEtiquettes] = useState<PositionEtiquette[]>([]);

  // Au-delà de douze étiquettes, une vue de garage devient une liste posée
  // par-dessus une image. La sélection reste toujours prioritaire.
  const placesEtiquetees = useMemo(() => {
    const triees = selection
      ? [...places].sort((a, b) => Number(b.intervention.id === selection) - Number(a.intervention.id === selection))
      : places;
    return triees.slice(0, 12);
  }, [places, selection]);

  const projeter = useCallback((suivantes: PositionEtiquette[]) => {
    setEtiquettes((precedentes) => positionsEgales(precedentes, suivantes) ? precedentes : suivantes);
  }, []);

  /*
    Le contexte WebGL peut disparaître sans prévenir : onglet mis en veille,
    mémoire graphique reprise par le système, pilote qui redémarre. Sans
    cela, la scène se figeait sur une image grise sans rien dire, et on
    croyait l'atelier vide.
  */
  if (contextePerdu) {
    return (
      <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm font-medium text-foreground">La vue 3D s’est interrompue</p>
        <p className="max-w-xs text-xs text-muted-foreground">
          Le navigateur a rendu la mémoire graphique. Les interventions
          restent consultables en vue liste.
        </p>
        <button
          type="button"
          onClick={() => setContextePerdu(false)}
          className="min-h-11 rounded-full border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-surface"
        >
          Relancer la vue 3D
        </button>
      </div>
    );
  }

  return (
    <div className="atelier-3d relative h-full min-h-[320px] overflow-hidden bg-[#edf1ee]">
      <Canvas
        className="atelier-3d"
        shadows
        orthographic
        camera={{ position: [20, 18, 21], zoom: 36, near: 0.1, far: 160 }}
        // `dpr` borné : au-delà de 2, le gain visuel est nul et le coût réel
        // sur un téléphone.
        dpr={[1, 2]}
        // Les déplacements des véhicules et les étiquettes projetées suivent
        // la caméra. Le rendu reste borné en résolution ci-dessus.
        frameloop="always"
        onPointerMissed={() => onSelectionner(null)}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener('webglcontextlost', (evenement) => {
            // Sans `preventDefault`, le navigateur ne tentera jamais de
            // restaurer le contexte.
            evenement.preventDefault();
            setContextePerdu(true);
          });
          gl.setClearColor('#edf1ee');
        }}
      >
        <color attach="background" args={['#edf1ee']} />
        <fog attach="fog" args={['#edf1ee', 31, 58]} />

        <ambientLight intensity={0.58} />
        <hemisphereLight args={['#f6fff8', '#819087', 0.88]} />
        <directionalLight
          position={[10, 20, 12]}
          intensity={1.65}
          castShadow
          shadow-mapSize={[1536, 1536]}
          shadow-camera-left={-18}
          shadow-camera-right={18}
          shadow-camera-top={18}
          shadow-camera-bottom={-18}
          shadow-bias={-0.00025}
        />
        <pointLight position={[-5, 5.8, -2]} color="#effff2" intensity={18} distance={16} decay={2} />
        <pointLight position={[6, 5.8, -2]} color="#effff2" intensity={18} distance={16} decay={2} />

        <CadrageAutomatique />
        <DecorAtelier places={places} />
        {ZONES.map((zone) => (
          <MarquageZone key={zone.cle} zone={zone} />
        ))}

        <Suspense fallback={null}>
          {places.map((place) => (
            <VehiculeInteractif
              key={place.intervention.id}
              place={place}
              selectionne={place.intervention.id === selection}
              onSelectionner={() => onSelectionner(place.intervention.id)}
            />
          ))}
        </Suspense>

        <ProjecteurEtiquettes places={placesEtiquetees} onProjection={projeter} />

        <OrbitControls
          makeDefault
          target={[0, 1.1, -0.4]}
          enablePan={false}
          // On regarde un atelier, pas son plafond ni son sous-sol.
          minPolarAngle={Math.PI / 5.5}
          maxPolarAngle={Math.PI / 2.5}
          minAzimuthAngle={-Math.PI / 3.5}
          maxAzimuthAngle={Math.PI / 2.6}
          minZoom={20}
          maxZoom={92}
          enableDamping
          dampingFactor={0.1}
        />
      </Canvas>

      {/* Les libellés restent de vrais boutons HTML : nets à toute taille,
          accessibles au clavier et toujours alignés grâce à la projection
          de la caméra. */}
      <div className="pointer-events-none absolute inset-0 z-10" aria-label="Repères des véhicules">
        {etiquettes.map((etiquette) => {
          if (!etiquette.visible) return null;
          const place = places.find((p) => p.intervention.id === etiquette.id);
          if (!place) return null;
          const i = place.intervention;
          const active = i.id === selection;
          return (
            <button
              key={i.id}
              type="button"
              className={`pointer-events-auto absolute min-w-[92px] -translate-x-1/2 -translate-y-full rounded-lg border px-2 py-1 text-left shadow-lg backdrop-blur-sm transition ${active ? 'block' : 'hidden sm:block'} ${
                active
                  ? 'border-emerald-500 bg-emerald-600 text-white ring-2 ring-emerald-200/80'
                  : 'border-white/80 bg-white/95 text-slate-800 hover:border-emerald-400 hover:bg-white'
              }`}
              style={{ left: etiquette.x, top: etiquette.y }}
              onClick={() => onSelectionner(i.id)}
              aria-pressed={active}
              aria-label={`Sélectionner ${i.vehicule || i.client || i.titre}`}
            >
              <span className="flex items-center gap-1.5 text-[10px] font-bold leading-tight">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: active ? '#ffffff' : place.zone === 'en_cours' ? '#16a34a' : '#64748b' }}
                  aria-hidden
                />
                {i.immatriculation || `RDV ${heureCourte(i.debut)}`}
              </span>
              <span className={`mt-0.5 block max-w-[132px] truncate text-[9px] leading-tight ${active ? 'text-white/85' : 'text-slate-500'}`}>
                {i.vehicule || i.client || 'Véhicule à renseigner'}
              </span>
            </button>
          );
        })}
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 hidden items-center gap-2 rounded-full border border-white/80 bg-white/85 px-3 py-1.5 text-[10px] font-medium text-slate-600 shadow-sm backdrop-blur sm:flex">
        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">↻</span>
        Glisser pour tourner · Molette pour zoomer
      </div>
    </div>
  );
}

interface PositionEtiquette {
  id: string;
  x: number;
  y: number;
  visible: boolean;
}

function positionsEgales(a: PositionEtiquette[], b: PositionEtiquette[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((position, index) => (
    position.id === b[index]?.id
    && position.visible === b[index]?.visible
    && Math.abs(position.x - (b[index]?.x ?? 0)) < 0.75
    && Math.abs(position.y - (b[index]?.y ?? 0)) < 0.75
  ));
}

function ProjecteurEtiquettes({ places, onProjection }: {
  places: PlaceVehicule[];
  onProjection: (positions: PositionEtiquette[]) => void;
}) {
  const attente = useRef(0);
  const premiereProjection = useRef(true);

  useFrame(({ camera, size }, delta) => {
    attente.current += delta;
    if (!premiereProjection.current && attente.current < 0.08) return;
    premiereProjection.current = false;
    attente.current = 0;

    const positions = places.map((place) => {
      const point = new Vector3(place.position[0], 2.7, place.position[1]).project(camera);
      return {
        id: place.intervention.id,
        x: (point.x + 1) * size.width / 2,
        y: (1 - point.y) * size.height / 2,
        visible: point.z > -1 && point.z < 1 && point.x > -1.08 && point.x < 1.08 && point.y > -1.08 && point.y < 1.08,
      };
    });
    onProjection(positions);
  });

  return null;
}

function heureCourte(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function VehiculeInteractif({ place, selectionne, onSelectionner }: {
  place: PlaceVehicule;
  selectionne: boolean;
  onSelectionner: () => void;
}) {
  const [survole, setSurvole] = useState(false);

  return (
    <Vehicule3D
      position={place.position}
      rotation={place.rotation}
      couleur={couleurCarrosserie(place.intervention.id)}
      selectionne={selectionne}
      survole={survole}
      onSelectionner={onSelectionner}
      onSurvol={setSurvole}
    />
  );
}

/** Point de vue de référence, celui que la caméra prend au départ. */
const OEIL = new Vector3(20, 18, 21);
const CIBLE = new Vector3(0, 1.1, -0.4);
const HAUT = new Vector3(0, 1, 0);

/**
 * Cadre l'atelier sur la place disponible.
 *
 * Un zoom fixe ne peut pas convenir : la même scène s'affiche dans un
 * panneau de bureau large de 900 px et sur un téléphone de 360.
 *
 * Le facteur ne s'estime pas, il se projette. Les huit coins de l'emprise
 * passent dans le repère de la caméra, et le zoom découle des deux rayons
 * obtenus. Approximer l'étalement de la projection isométrique donnait soit
 * des postes coupés, soit un atelier perdu au milieu du vide.
 *
 * Le calcul part du point de vue initial, pas de la caméra vivante : sinon
 * un simple redimensionnement annulerait la rotation que l'utilisateur vient
 * de faire.
 */
function CadrageAutomatique() {
  const camera = useThree((etat) => etat.camera) as OrthographicCamera;
  const taille = useThree((etat) => etat.size);

  useEffect(() => {
    const versVue = new Matrix4()
      .lookAt(OEIL, CIBLE, HAUT)
      .setPosition(OEIL)
      .invert();

    // Le décor dépasse les postes : les murs et le coin accueil doivent
    // rester entiers, même si une seule voiture est affichée.
    const demiLargeur = Math.max(EMPRISE.largeur, 22.6) / 2;
    const demiProfondeur = Math.max(EMPRISE.profondeur, 17.6) / 2;
    const hauteur = 6.2;

    let rayonX = 0;
    let rayonY = 0;
    for (const x of [-demiLargeur, demiLargeur]) {
      for (const y of [0, hauteur]) {
        for (const z of [-demiProfondeur, demiProfondeur]) {
          const point = new Vector3(x, y, z).applyMatrix4(versVue);
          rayonX = Math.max(rayonX, Math.abs(point.x));
          rayonY = Math.max(rayonY, Math.abs(point.y));
        }
      }
    }

    const zoom = Math.min(
      taille.width / (2 * rayonX),
      taille.height / (2 * rayonY),
    ) * 1.08;

    camera.zoom = Math.max(14, zoom);
    camera.updateProjectionMatrix();
  }, [camera, taille.width, taille.height]);

  return null;
}

/**
 * Le marquage au sol d'un poste.
 *
 * Un cadre plutôt qu'un aplat : une zone pleine sous les voitures se lirait
 * comme une ombre, et trois aplats côte à côte feraient un damier. Le trait
 * dit la limite sans peindre le sol.
 */
function MarquageZone({ zone }: { zone: (typeof ZONES)[number] }) {
  const [largeur, profondeur] = zone.taille;
  const [x, z] = zone.centre;
  const trait = 0.1;

  const barres: [number, number, number, number][] = [
    [x, z - profondeur / 2, largeur, trait],
    [x, z + profondeur / 2, largeur, trait],
    [x - largeur / 2, z, trait, profondeur],
    [x + largeur / 2, z, trait, profondeur],
  ];

  return (
    <group>
      {barres.map(([bx, bz, bl, bp], index) => (
        <mesh
          key={index}
          position={[bx, 0.008, bz]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[bl, bp]} />
          <meshBasicMaterial color={zone.couleur} transparent opacity={0.62} />
        </mesh>
      ))}
      <mesh position={[x, 0.009, z]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[largeur - 0.22, profondeur - 0.22]} />
        <meshBasicMaterial color={zone.couleur} transparent opacity={zone.cle === 'en_cours' ? 0.075 : 0.025} depthWrite={false} />
      </mesh>
    </group>
  );
}
