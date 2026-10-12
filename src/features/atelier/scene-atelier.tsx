// La scène 3D de l'atelier
//
// Vue isométrique : caméra orthographique de trois quarts, comme sur une
// maquette. Une perspective ferait varier la taille des véhicules selon leur
// place dans l'atelier, ce qui gênerait la comparaison d'un poste à l'autre.
//
// Tout le texte reste en HTML, au-dessus du canvas. Rien d'écrit dans la
// scène : un libellé en 3D se lit mal de biais, ne se sélectionne pas, et
// n'arrive pas aux lecteurs d'écran.

import { Suspense, useEffect, useMemo, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Matrix4, Vector3, type OrthographicCamera } from 'three';
import type { Intervention } from '@/services/interventions-service';
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
    <Canvas
      shadows
      orthographic
      camera={{ position: [17, 15, 17], zoom: 36, near: 0.1, far: 140 }}
      // `dpr` borné : au-delà de 2, le gain visuel est nul et le coût réel
      // sur un téléphone.
      dpr={[1, 2]}
      // La scène ne s'anime qu'en réponse à une action : inutile de redessiner
      // soixante fois par seconde un atelier immobile.
      frameloop="always"
      onPointerMissed={() => onSelectionner(null)}
      // Le doigt pilote la caméra, pas le défilement de la page. La règle
      // est dans `index.css` : OrbitControls repose `touch-action` en style
      // en ligne, qu'un style en ligne concurrent ne peut pas battre.
      className="atelier-3d"
      onCreated={({ gl }) => {
        gl.domElement.addEventListener('webglcontextlost', (evenement) => {
          // Sans `preventDefault`, le navigateur ne tentera jamais de
          // restaurer le contexte.
          evenement.preventDefault();
          setContextePerdu(true);
        });
      }}
    >
      <color attach="background" args={['#eef2ee']} />

      <ambientLight intensity={0.55} />
      <hemisphereLight args={['#f4f8f4', '#9aa89c', 0.65]} />
      <directionalLight
        position={[12, 18, 8]}
        intensity={1.5}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-18}
        shadow-camera-right={18}
        shadow-camera-top={18}
        shadow-camera-bottom={-18}
      />

      <CadrageAutomatique />
      <Sol />
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

      <OrbitControls
        makeDefault
        enablePan={false}
        // On regarde un atelier, pas son plafond ni son sous-sol.
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 2.4}
        minZoom={22}
        maxZoom={95}
        enableDamping
        dampingFactor={0.12}
      />
    </Canvas>
  );
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
const OEIL = new Vector3(17, 15, 17);
const CIBLE = new Vector3(0, 0, 0);
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

    const demiLargeur = EMPRISE.largeur / 2;
    const demiProfondeur = EMPRISE.profondeur / 2;
    // Un véhicule monte à 1,55 m ; la marge laisse passer le halo de survol.
    const hauteur = 1.8;

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
    ) * 0.94;

    camera.zoom = Math.max(14, zoom);
    camera.updateProjectionMatrix();
  }, [camera, taille.width, taille.height]);

  return null;
}

function Sol() {
  // Juste assez pour recevoir les ombres sous les postes : un sol plus large
  // n'ajoute qu'une bordure grise autour de l'atelier.
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
      <planeGeometry args={[EMPRISE.largeur + 6, EMPRISE.profondeur + 6]} />
      <meshStandardMaterial color="#dfe6df" roughness={0.95} />
    </mesh>
  );
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
    </group>
  );
}
