// Un véhicule dans l'atelier
//
// Volumes simples pour cette première version : le but est de vérifier les
// interactions — viser, toucher, sélectionner, suivre un déplacement — avant
// d'y mettre des modèles lourds. Un GLB mal cadré masquerait un défaut de
// sélection ; une boîte, non.
//
// La silhouette reste lisible de trois quarts : capot, pavillon vitré,
// quatre roues. C'est assez pour reconnaître une voiture d'un coup d'œil et
// pour distinguer son orientation.

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';

export interface Vehicule3DProps {
  position: [number, number];
  rotation: number;
  couleur: string;
  selectionne: boolean;
  survole: boolean;
  onSelectionner: () => void;
  onSurvol: (survole: boolean) => void;
}

/** Vitesse de rattrapage, par seconde. Court, pour ne pas faire attendre. */
const SOUPLESSE = 6;

export function Vehicule3D({
  position, rotation, couleur, selectionne, survole, onSelectionner, onSurvol,
}: Vehicule3DProps) {
  const groupe = useRef<Group>(null);
  const pose = useRef({ x: position[0], z: position[1], r: rotation, prete: false });

  /*
    Le véhicule rejoint sa place au lieu d'y apparaître.

    Changer un statut le fait changer de zone : sans transition, la voiture
    disparaîtrait d'un poste pour réapparaître dans un autre, et on ne
    saurait pas laquelle a bougé. Le rattrapage est exponentiel et borné par
    le temps écoulé, donc indépendant de la fréquence d'affichage.
  */
  useFrame((_, delta) => {
    const g = groupe.current;
    if (!g) return;

    if (!pose.current.prete) {
      // Premier rendu : se poser directement, sans glisser depuis l'origine.
      g.position.set(position[0], 0, position[1]);
      g.rotation.y = rotation;
      pose.current.prete = true;
      return;
    }

    const k = 1 - Math.exp(-SOUPLESSE * delta);
    g.position.x += (position[0] - g.position.x) * k;
    g.position.z += (position[1] - g.position.z) * k;
    g.rotation.y += (rotation - g.rotation.y) * k;

    // Le véhicule sélectionné se soulève de quelques centimètres : un repère
    // qui survit à la rotation de la caméra, contrairement à un contour.
    const hauteur = selectionne ? 0.22 : 0;
    g.position.y += (hauteur - g.position.y) * k;
  });

  const teinte = selectionne ? '#16a34a' : couleur;
  const vitres = '#1e3a4a';

  return (
    <group
      ref={groupe}
      onPointerDown={(evenement) => {
        evenement.stopPropagation();
        onSelectionner();
      }}
      onPointerOver={(evenement) => {
        evenement.stopPropagation();
        onSurvol(true);
      }}
      onPointerOut={() => onSurvol(false)}
    >
      {/* Cible de pointage volontairement plus large que la carrosserie :
          au doigt, viser un pare-brise de deux mètres sur un écran de
          téléphone est illusoire. Invisible, mais cliquable. */}
      <mesh position={[0, 0.8, 0]} visible={false}>
        <boxGeometry args={[2.4, 1.8, 4.9]} />
        <meshBasicMaterial />
      </mesh>

      {/* Bas de caisse */}
      <mesh position={[0, 0.52, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.84, 0.62, 4.3]} />
        <meshStandardMaterial color={teinte} metalness={0.35} roughness={0.42} />
      </mesh>

      {/* Capot et coffre, légèrement plus bas que l'habitacle */}
      <mesh position={[0, 0.86, -1.52]} castShadow>
        <boxGeometry args={[1.76, 0.22, 1.3]} />
        <meshStandardMaterial color={teinte} metalness={0.35} roughness={0.42} />
      </mesh>
      <mesh position={[0, 0.86, 1.62]} castShadow>
        <boxGeometry args={[1.76, 0.22, 1.1]} />
        <meshStandardMaterial color={teinte} metalness={0.35} roughness={0.42} />
      </mesh>

      {/* Habitacle vitré : c'est lui qui donne la silhouette d'une voiture */}
      <mesh position={[0, 1.12, 0.05]} castShadow>
        <boxGeometry args={[1.62, 0.66, 2.3]} />
        <meshStandardMaterial color={vitres} metalness={0.2} roughness={0.12} />
      </mesh>
      {/* Pavillon, de la couleur de la carrosserie */}
      <mesh position={[0, 1.47, 0.05]} castShadow>
        <boxGeometry args={[1.58, 0.08, 2.1]} />
        <meshStandardMaterial color={teinte} metalness={0.35} roughness={0.42} />
      </mesh>

      {/* Roues */}
      {([[-0.88, -1.36], [0.88, -1.36], [-0.88, 1.42], [0.88, 1.42]] as const).map(
        ([x, z]) => (
          <mesh
            key={`${x}:${z}`}
            position={[x, 0.33, z]}
            rotation={[0, 0, Math.PI / 2]}
            castShadow
          >
            <cylinderGeometry args={[0.33, 0.33, 0.2, 16]} />
            <meshStandardMaterial color="#111827" roughness={0.9} />
          </mesh>
        ),
      )}

      {/* Le survol s'annonce par un halo au sol : il ne déforme pas le
          véhicule et reste visible sous n'importe quel angle. */}
      {(survole || selectionne) && (
        <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.5, 1.78, 40]} />
          <meshBasicMaterial color={selectionne ? '#16a34a' : '#64748b'} transparent opacity={0.85} />
        </mesh>
      )}
    </group>
  );
}
