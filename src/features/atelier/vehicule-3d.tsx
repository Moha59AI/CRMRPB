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
import { RoundedBox } from '@react-three/drei';
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

  // La sélection ne repeint pas le véhicule. Dans l'atelier de référence,
  // le vert appartient au poste, au halo et au dossier actif ; la carrosserie
  // conserve sa couleur réelle afin de rester identifiable.
  const teinte = couleur;
  const vitres = '#244a58';
  const metal = '#b9c1c4';

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

      {/* Une ombre de contact supplémentaire ancre la carrosserie dans la
          dalle, y compris sur les appareils où les ombres WebGL sont
          réduites. */}
      <mesh position={[0, 0.025, 0.12]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.18, 2.28, 1]}>
        <circleGeometry args={[1, 36]} />
        <meshBasicMaterial color="#1f2925" transparent opacity={0.2} depthWrite={false} />
      </mesh>

      {/* Bas de caisse arrondi. Les volumes restent procéduraux afin de ne
          pas charger un lourd modèle GLB pour chaque rendez-vous. */}
      <RoundedBox position={[0, 0.58, 0.08]} args={[1.88, 0.65, 4.18]} radius={0.24} smoothness={5} castShadow receiveShadow>
        <meshStandardMaterial color={teinte} metalness={0.42} roughness={0.34} />
      </RoundedBox>

      {/* Capot et coffre, légèrement inclinés par rapport à la ceinture. */}
      <RoundedBox position={[0, 0.88, -1.48]} rotation={[0.055, 0, 0]} args={[1.78, 0.28, 1.28]} radius={0.18} smoothness={4} castShadow>
        <meshStandardMaterial color={teinte} metalness={0.42} roughness={0.34} />
      </RoundedBox>
      <RoundedBox position={[0, 0.87, 1.62]} rotation={[-0.04, 0, 0]} args={[1.77, 0.27, 1.05]} radius={0.17} smoothness={4} castShadow>
        <meshStandardMaterial color={teinte} metalness={0.42} roughness={0.34} />
      </RoundedBox>

      {/* Habitacle en deux couches : vitrage transparent puis pavillon. */}
      <RoundedBox position={[0, 1.18, 0.04]} args={[1.58, 0.72, 2.22]} radius={0.27} smoothness={5} castShadow>
        <meshPhysicalMaterial
          color={vitres}
          roughness={0.1}
          metalness={0.18}
          transmission={0.12}
          transparent
          opacity={0.9}
        />
      </RoundedBox>
      <RoundedBox position={[0, 1.54, 0.08]} args={[1.42, 0.12, 1.86]} radius={0.09} smoothness={4} castShadow>
        <meshStandardMaterial color={teinte} metalness={0.42} roughness={0.34} />
      </RoundedBox>

      {/* Montants et séparation des vitres. */}
      {[-0.82, 0.82].map((x) => (
        <group key={`vitrage-${x}`} position={[x, 1.2, 0.05]}>
          <mesh position={[0, 0, -0.72]} rotation={[0, 0, x > 0 ? -0.18 : 0.18]}>
            <boxGeometry args={[0.045, 0.62, 0.07]} />
            <meshStandardMaterial color={teinte} metalness={0.38} />
          </mesh>
          <mesh position={[0, 0, 0.18]}>
            <boxGeometry args={[0.045, 0.64, 0.07]} />
            <meshStandardMaterial color={teinte} metalness={0.38} />
          </mesh>
        </group>
      ))}

      {/* Pare-chocs, calandre et optiques : ces petits contrastes rendent la
          silhouette immédiatement automobile, même dézoomée. */}
      <RoundedBox position={[0, 0.53, -2.09]} args={[1.7, 0.29, 0.16]} radius={0.07} smoothness={3} castShadow>
        <meshStandardMaterial color={teinte} metalness={0.36} roughness={0.42} />
      </RoundedBox>
      <mesh position={[0, 0.61, -2.19]}>
        <boxGeometry args={[0.72, 0.22, 0.035]} />
        <meshStandardMaterial color="#172025" roughness={0.58} />
      </mesh>
      {[-0.64, 0.64].map((x) => (
        <mesh key={`phare-${x}`} position={[x, 0.82, -2.16]}>
          <boxGeometry args={[0.46, 0.16, 0.045]} />
          <meshStandardMaterial color="#f5f7df" emissive="#f7f9d6" emissiveIntensity={0.45} />
        </mesh>
      ))}
      {[-0.64, 0.64].map((x) => (
        <mesh key={`feu-${x}`} position={[x, 0.78, 2.18]}>
          <boxGeometry args={[0.44, 0.17, 0.045]} />
          <meshStandardMaterial color="#b91c1c" emissive="#7f1d1d" emissiveIntensity={0.2} />
        </mesh>
      ))}

      {/* Plaques neutres, sans texte illisible dans le canvas. */}
      <mesh position={[0, 0.46, -2.23]}>
        <boxGeometry args={[0.65, 0.13, 0.035]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.72} />
      </mesh>

      {/* Roues */}
      {([[-0.91, -1.36], [0.91, -1.36], [-0.91, 1.44], [0.91, 1.44]] as const).map(
        ([x, z]) => (
          <group key={`${x}:${z}`} position={[x, 0.36, z]} rotation={[0, 0, Math.PI / 2]}>
            <mesh castShadow>
              <cylinderGeometry args={[0.36, 0.36, 0.22, 22]} />
              <meshStandardMaterial color="#101719" roughness={0.88} />
            </mesh>
            <mesh position={[0, 0.12, 0]}>
              <cylinderGeometry args={[0.2, 0.2, 0.225, 12]} />
              <meshStandardMaterial color={metal} metalness={0.72} roughness={0.28} />
            </mesh>
          </group>
        ),
      )}

      {/* Le survol s'annonce par un halo au sol : il ne déforme pas le
          véhicule et reste visible sous n'importe quel angle. */}
      {(survole || selectionne) && (
        <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.52, 1.78, 40]} />
          <meshBasicMaterial color={selectionne ? '#19aa58' : '#64748b'} transparent opacity={0.9} />
        </mesh>
      )}
    </group>
  );
}
