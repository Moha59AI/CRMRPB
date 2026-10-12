// Le décor de l'atelier 3D
//
// Il reste volontairement procédural : aucun modèle externe à télécharger,
// aucune licence à suivre et aucune panne réseau qui laisserait l'atelier
// vide. Les volumes sont légers mais assez détaillés pour donner les repères
// d'un vrai centre de vitrage : porte sectionnelle, rack à pare-brise,
// établi, outillage, accueil et techniciens autour du véhicule en cours.

import { Html, RoundedBox } from '@react-three/drei';
import type { PlaceVehicule } from './zones-atelier';

const VERT = '#18a957';
const VERT_FONCE = '#0f7a3d';
const ANTHRACITE = '#20282b';
const BETON = '#d9dedb';

export function DecorAtelier({ places }: { places: PlaceVehicule[] }) {
  const enCours = places.filter((place) => place.zone === 'en_cours').slice(0, 3);

  return (
    <group>
      <Architecture />
      <PorteSectionnelle />
      <RackPareBrise />
      <EspaceOutillage />
      <CoinAccueil />
      <Accessoires />

      {enCours.map((place, index) => (
        <PosteEnIntervention
          key={place.intervention.id}
          position={place.position}
          rotation={place.rotation}
          variante={index}
        />
      ))}
    </group>
  );
}

function Architecture() {
  return (
    <group>
      {/* Semelle sombre puis dalle claire : le léger débord crée une vraie
          tranche de bâtiment dans la vue isométrique. */}
      <mesh position={[0, -0.17, 0]} receiveShadow>
        <boxGeometry args={[22.6, 0.24, 17.6]} />
        <meshStandardMaterial color="#55615b" roughness={1} />
      </mesh>
      <mesh position={[0, -0.03, 0]} receiveShadow>
        <boxGeometry args={[22.1, 0.18, 17.1]} />
        <meshStandardMaterial color={BETON} roughness={0.92} />
      </mesh>

      {/* Joints de dilatation. */}
      {[-5.5, 0, 5.5].map((x) => (
        <mesh key={`joint-x-${x}`} position={[x, 0.065, 0]} receiveShadow>
          <boxGeometry args={[0.025, 0.012, 16.7]} />
          <meshStandardMaterial color="#aeb7b2" roughness={1} />
        </mesh>
      ))}
      {[-4.1, 0.1, 4.3].map((z) => (
        <mesh key={`joint-z-${z}`} position={[0, 0.066, z]} receiveShadow>
          <boxGeometry args={[21.7, 0.012, 0.025]} />
          <meshStandardMaterial color="#aeb7b2" roughness={1} />
        </mesh>
      ))}

      {/* Mur gauche, visible comme sur une maquette ouverte. */}
      <mesh position={[-10.9, 2.7, -0.2]} castShadow receiveShadow>
        <boxGeometry args={[0.28, 5.4, 17.2]} />
        <meshStandardMaterial color="#f4f5f3" roughness={0.88} />
      </mesh>
      <mesh position={[-10.72, 0.65, -0.2]}>
        <boxGeometry args={[0.05, 1.3, 17]} />
        <meshStandardMaterial color="#e4e9e5" roughness={0.9} />
      </mesh>

      {/* Mur du fond construit autour de la grande porte. */}
      <mesh position={[-5.45, 2.7, -8.38]} castShadow receiveShadow>
        <boxGeometry args={[10.7, 5.4, 0.28]} />
        <meshStandardMaterial color="#f7f8f6" roughness={0.88} />
      </mesh>
      <mesh position={[4.95, 5.02, -8.38]} castShadow receiveShadow>
        <boxGeometry args={[10.1, 0.76, 0.28]} />
        <meshStandardMaterial color="#f7f8f6" roughness={0.88} />
      </mesh>
      <mesh position={[10.25, 2.7, -8.38]} castShadow receiveShadow>
        <boxGeometry args={[0.55, 5.4, 0.28]} />
        <meshStandardMaterial color="#f7f8f6" roughness={0.88} />
      </mesh>

      {/* Plaque physique et marque en HTML transformé : elle reste nette dans
          une vue isométrique, contrairement à une texture de texte. */}
      <group position={[-5.8, 3.65, -8.18]}>
        <RoundedBox args={[4.9, 1.15, 0.12]} radius={0.16} smoothness={4}>
          <meshStandardMaterial color="#ffffff" roughness={0.65} />
        </RoundedBox>
        <Html
          transform
          center
          position={[0, 0, 0.09]}
          distanceFactor={8.2}
          zIndexRange={[1, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <div className="flex w-[230px] items-center justify-center gap-3 rounded-xl bg-white px-4 py-2 text-slate-900 shadow-sm">
            <span className="rounded-lg bg-emerald-600 px-2 py-1 text-lg font-black tracking-[-0.08em] text-white">
              RPB
            </span>
            <span className="leading-none">
              <strong className="block text-[12px] font-black tracking-wide">RELAIS</strong>
              <span className="mt-1 block text-[8px] font-bold tracking-[0.18em] text-emerald-700">
                PARE-BRISE
              </span>
            </span>
          </div>
        </Html>
      </group>

      {/* Plafonniers suspendus, sans toit afin de garder la lecture
          isométrique ouverte. */}
      {[-6, 0, 6].map((x) => (
        <group key={`lum-${x}`} position={[x, 5.75, -0.6]}>
          <mesh position={[0, -0.48, 0]}>
            <cylinderGeometry args={[0.018, 0.018, 0.95, 8]} />
            <meshStandardMaterial color="#4b5563" />
          </mesh>
          <mesh position={[0, -0.97, 0]}>
            <boxGeometry args={[3.1, 0.07, 0.32]} />
            <meshStandardMaterial color="#f8fafc" emissive="#f2fff5" emissiveIntensity={1.1} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function PorteSectionnelle() {
  const largeur = 9.7;
  const hauteur = 4.55;
  return (
    <group position={[5.05, 2.35, -8.2]}>
      <mesh receiveShadow>
        <boxGeometry args={[largeur, hauteur, 0.16]} />
        <meshPhysicalMaterial
          color="#b9d3d4"
          roughness={0.18}
          metalness={0.12}
          transmission={0.28}
          transparent
          opacity={0.78}
        />
      </mesh>
      {[-3.64, -2.43, -1.21, 0, 1.21, 2.43, 3.64].map((x) => (
        <mesh key={`porte-v-${x}`} position={[x, 0, 0.1]}>
          <boxGeometry args={[0.075, hauteur, 0.08]} />
          <meshStandardMaterial color="#6b7476" metalness={0.62} roughness={0.35} />
        </mesh>
      ))}
      {[-1.71, -0.57, 0.57, 1.71].map((y) => (
        <mesh key={`porte-h-${y}`} position={[0, y, 0.1]}>
          <boxGeometry args={[largeur, 0.075, 0.08]} />
          <meshStandardMaterial color="#6b7476" metalness={0.62} roughness={0.35} />
        </mesh>
      ))}
      <mesh position={[-largeur / 2 - 0.08, 0, 0.08]}>
        <boxGeometry args={[0.2, hauteur + 0.2, 0.18]} />
        <meshStandardMaterial color="#343d40" metalness={0.65} />
      </mesh>
      <mesh position={[largeur / 2 + 0.08, 0, 0.08]}>
        <boxGeometry args={[0.2, hauteur + 0.2, 0.18]} />
        <meshStandardMaterial color="#343d40" metalness={0.65} />
      </mesh>
    </group>
  );
}

function RackPareBrise() {
  return (
    <group position={[-7.5, 0, -5.6]}>
      <mesh position={[0, 0.18, 0]} castShadow>
        <boxGeometry args={[5.6, 0.24, 1.35]} />
        <meshStandardMaterial color="#25352d" roughness={0.72} />
      </mesh>
      {[-2.65, -1.75, -0.85, 0.05, 0.95, 1.85, 2.65].map((x) => (
        <group key={`rack-${x}`} position={[x, 1.55, 0]} rotation={[0, 0, -0.12]}>
          <mesh castShadow>
            <boxGeometry args={[0.09, 3, 1.2]} />
            <meshStandardMaterial color={VERT_FONCE} metalness={0.38} roughness={0.5} />
          </mesh>
          {x < 2.65 && (
            <mesh position={[0.4, 0.1, 0]} castShadow>
              <boxGeometry args={[0.68, 2.35, 0.08]} />
              <meshPhysicalMaterial
                color="#8db6bd"
                transmission={0.48}
                transparent
                opacity={0.58}
                roughness={0.08}
                thickness={0.08}
              />
            </mesh>
          )}
        </group>
      ))}
      <mesh position={[0, 3.1, 0]}>
        <boxGeometry args={[5.8, 0.12, 1.35]} />
        <meshStandardMaterial color={VERT} metalness={0.28} />
      </mesh>
    </group>
  );
}

function EspaceOutillage() {
  return (
    <group position={[-0.7, 0, -7.55]}>
      {/* Meubles bas. */}
      {[-2.1, -0.7, 0.7, 2.1].map((x, index) => (
        <group key={`meuble-${x}`} position={[x, 0, 0]}>
          <RoundedBox position={[0, 0.55, 0]} args={[1.26, 1.05, 0.72]} radius={0.08} smoothness={3} castShadow>
            <meshStandardMaterial color={index === 1 ? VERT_FONCE : ANTHRACITE} roughness={0.58} />
          </RoundedBox>
          {[0.28, 0.56, 0.84].map((y) => (
            <mesh key={y} position={[0, y, 0.38]}>
              <boxGeometry args={[1.03, 0.025, 0.03]} />
              <meshStandardMaterial color="#8b9497" metalness={0.65} />
            </mesh>
          ))}
        </group>
      ))}
      <mesh position={[0, 1.18, 0]} castShadow>
        <boxGeometry args={[5.7, 0.15, 0.82]} />
        <meshStandardMaterial color="#c9b18d" roughness={0.65} />
      </mesh>

      {/* Panneau perforé et silhouettes d'outils. */}
      <mesh position={[0, 2.45, -0.27]} receiveShadow>
        <boxGeometry args={[5.7, 2.25, 0.1]} />
        <meshStandardMaterial color="#4a5555" roughness={0.72} />
      </mesh>
      {[-2, -1.25, -0.5, 0.25, 1, 1.75].map((x, index) => (
        <group key={`outil-${x}`} position={[x, 2.45, -0.18]} rotation={[0, 0, index % 2 ? 0.35 : -0.25]}>
          <mesh position={[0, 0.25, 0]}>
            <boxGeometry args={[0.1, 0.78, 0.08]} />
            <meshStandardMaterial color={index % 3 === 0 ? VERT : '#d9e1dc'} metalness={0.55} />
          </mesh>
          <mesh position={[0, -0.23, 0]}>
            <boxGeometry args={[0.28, 0.2, 0.08]} />
            <meshStandardMaterial color="#171d1f" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function CoinAccueil() {
  return (
    <group position={[-7.7, 0, 5.25]}>
      {/* Petit tapis et comptoir d'accueil. */}
      <mesh position={[0, 0.04, 0]} receiveShadow>
        <boxGeometry args={[5.25, 0.06, 3.35]} />
        <meshStandardMaterial color="#bcc8c0" roughness={0.95} />
      </mesh>
      <RoundedBox position={[-1.42, 0.72, -0.58]} args={[2.05, 1.35, 0.82]} radius={0.16} smoothness={3} castShadow>
        <meshStandardMaterial color="#21352a" roughness={0.62} />
      </RoundedBox>
      <mesh position={[-1.42, 1.43, -0.58]} castShadow>
        <boxGeometry args={[2.25, 0.11, 0.95]} />
        <meshStandardMaterial color="#d7bb8b" roughness={0.62} />
      </mesh>
      <mesh position={[-1.42, 1.78, -0.52]} rotation={[-0.18, 0, 0]}>
        <boxGeometry args={[0.88, 0.58, 0.08]} />
        <meshStandardMaterial color="#20282b" roughness={0.28} />
      </mesh>

      <TableBasse position={[1.05, 0, 0.35]} />
      <Fauteuil position={[2.0, 0, -0.75]} rotation={-0.6} couleur="#eff2ef" />
      <Fauteuil position={[0.22, 0, 1.05]} rotation={2.35} couleur="#2b4938" />
      <Plante position={[-2.35, 0, 1.05]} />
    </group>
  );
}

function TableBasse({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.58, 0]} castShadow>
        <cylinderGeometry args={[0.76, 0.76, 0.09, 28]} />
        <meshStandardMaterial color="#d4b27d" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.29, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.22, 0.56, 16]} />
        <meshStandardMaterial color="#2f3939" metalness={0.35} />
      </mesh>
    </group>
  );
}

function Fauteuil({ position, rotation, couleur }: {
  position: [number, number, number]; rotation: number; couleur: string;
}) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <RoundedBox position={[0, 0.48, 0]} args={[1.15, 0.38, 1.05]} radius={0.18} smoothness={3} castShadow>
        <meshStandardMaterial color={couleur} roughness={0.82} />
      </RoundedBox>
      <RoundedBox position={[0, 0.94, 0.42]} args={[1.15, 0.75, 0.25]} radius={0.12} smoothness={3} castShadow>
        <meshStandardMaterial color={couleur} roughness={0.82} />
      </RoundedBox>
    </group>
  );
}

function Plante({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.28, 0]} castShadow>
        <cylinderGeometry args={[0.34, 0.25, 0.55, 20]} />
        <meshStandardMaterial color="#d4b28a" roughness={0.88} />
      </mesh>
      {[-0.35, 0, 0.35, 0.7, 1.05].map((rotation, index) => (
        <mesh key={rotation} position={[Math.sin(rotation) * 0.2, 0.72 + index * 0.08, Math.cos(rotation) * 0.17]} rotation={[0.25, rotation, 0.2]} castShadow>
          <sphereGeometry args={[0.22, 12, 8]} />
          <meshStandardMaterial color={index % 2 ? '#2c7a4a' : '#39a25f'} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

function Accessoires() {
  return (
    <group>
      <Borne position={[-9.5, 0, -2.2]} />
      <Borne position={[9.15, 0, -5.8]} />
      <Cone position={[8.7, 0, 5.9]} />
      <Cone position={[9.55, 0, 5.25]} />
      <Poubelle position={[-9.55, 0, 2.45]} />
    </group>
  );
}

function Borne({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <RoundedBox position={[0, 0.64, 0]} args={[0.6, 1.25, 0.46]} radius={0.09} smoothness={3} castShadow>
        <meshStandardMaterial color="#273235" roughness={0.55} />
      </RoundedBox>
      <mesh position={[0, 0.9, 0.24]}>
        <boxGeometry args={[0.36, 0.24, 0.03]} />
        <meshStandardMaterial color={VERT} emissive={VERT} emissiveIntensity={0.5} />
      </mesh>
    </group>
  );
}

function Cone({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.04, 0]} castShadow>
        <boxGeometry args={[0.52, 0.08, 0.52]} />
        <meshStandardMaterial color="#2d3436" />
      </mesh>
      <mesh position={[0, 0.42, 0]} castShadow>
        <coneGeometry args={[0.23, 0.72, 20]} />
        <meshStandardMaterial color={VERT} roughness={0.75} />
      </mesh>
      <mesh position={[0, 0.43, 0]}>
        <cylinderGeometry args={[0.15, 0.18, 0.12, 20]} />
        <meshStandardMaterial color="#f8fafc" />
      </mesh>
    </group>
  );
}

function Poubelle({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.48, 0]} castShadow>
        <cylinderGeometry args={[0.42, 0.36, 0.92, 20]} />
        <meshStandardMaterial color="#42534a" roughness={0.82} />
      </mesh>
      <mesh position={[0, 0.98, 0]}>
        <cylinderGeometry args={[0.45, 0.45, 0.12, 20]} />
        <meshStandardMaterial color="#26322c" />
      </mesh>
    </group>
  );
}

function PosteEnIntervention({ position, rotation, variante }: {
  position: [number, number]; rotation: number; variante: number;
}) {
  const decalage = variante % 2 ? -1 : 1;
  return (
    <group position={[position[0], 0, position[1]]} rotation={[0, rotation, 0]}>
      {/* Deux rails et quatre bras matérialisent le vrai poste de pose. Le
          vert encadre le véhicule actif sans peindre toute la dalle. */}
      {[-0.78, 0.78].map((x) => (
        <RoundedBox
          key={`rail-${x}`}
          position={[x, 0.1, 0]}
          args={[0.22, 0.16, 4.85]}
          radius={0.07}
          smoothness={3}
          castShadow
        >
          <meshStandardMaterial color="#18a957" metalness={0.38} roughness={0.42} />
        </RoundedBox>
      ))}
      {[-1.48, 1.48].flatMap((z) => [-1, 1].map((sens) => (
        <group key={`bras-${z}-${sens}`} position={[0.95 * sens, 0.16, z]} rotation={[0, 0.52 * sens, 0]}>
          <RoundedBox args={[1.1, 0.12, 0.17]} radius={0.05} smoothness={3} castShadow>
            <meshStandardMaterial color="#2f3b3a" metalness={0.48} roughness={0.4} />
          </RoundedBox>
          <mesh position={[0.58 * sens, 0.02, 0]}>
            <cylinderGeometry args={[0.13, 0.13, 0.12, 16]} />
            <meshStandardMaterial color="#111827" roughness={0.74} />
          </mesh>
        </group>
      )))}
      <Technicien position={[1.45 * decalage, 0, -0.35]} rotation={decalage > 0 ? -1.25 : 1.25} couleur="#1f6f49" />
      <Technicien position={[-1.35 * decalage, 0, 0.75]} rotation={decalage > 0 ? 1.35 : -1.35} couleur="#263238" />
      <Chariot position={[2.05 * decalage, 0, 1.55]} />
      <mesh position={[0, 0.035, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 4]} receiveShadow>
        <ringGeometry args={[2.55, 2.66, 4]} />
        <meshBasicMaterial color={VERT} transparent opacity={0.9} />
      </mesh>
    </group>
  );
}

function Technicien({ position, rotation, couleur }: {
  position: [number, number, number]; rotation: number; couleur: string;
}) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 1.7, 0]} castShadow>
        <sphereGeometry args={[0.23, 18, 12]} />
        <meshStandardMaterial color="#bf875f" roughness={0.82} />
      </mesh>
      <mesh position={[0, 1.12, 0]} castShadow>
        <capsuleGeometry args={[0.28, 0.7, 8, 16]} />
        <meshStandardMaterial color={couleur} roughness={0.72} />
      </mesh>
      <mesh position={[-0.16, 0.45, 0]} castShadow>
        <capsuleGeometry args={[0.09, 0.55, 6, 12]} />
        <meshStandardMaterial color="#252b2c" />
      </mesh>
      <mesh position={[0.16, 0.45, 0]} castShadow>
        <capsuleGeometry args={[0.09, 0.55, 6, 12]} />
        <meshStandardMaterial color="#252b2c" />
      </mesh>
      <mesh position={[-0.36, 1.15, -0.08]} rotation={[0.2, 0, 0.55]} castShadow>
        <capsuleGeometry args={[0.075, 0.52, 6, 12]} />
        <meshStandardMaterial color={couleur} />
      </mesh>
      <mesh position={[0.36, 1.15, -0.08]} rotation={[0.2, 0, -0.55]} castShadow>
        <capsuleGeometry args={[0.075, 0.52, 6, 12]} />
        <meshStandardMaterial color={couleur} />
      </mesh>
    </group>
  );
}

function Chariot({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <RoundedBox position={[0, 0.62, 0]} args={[0.88, 1.12, 0.62]} radius={0.08} smoothness={3} castShadow>
        <meshStandardMaterial color="#273134" roughness={0.5} />
      </RoundedBox>
      {[0.37, 0.64, 0.91].map((y) => (
        <mesh key={y} position={[0, y, 0.33]}>
          <boxGeometry args={[0.65, 0.03, 0.025]} />
          <meshStandardMaterial color={VERT} />
        </mesh>
      ))}
      {[-0.29, 0.29].flatMap((x) => [-0.2, 0.2].map((z) => (
        <mesh key={`${x}-${z}`} position={[x, 0.12, z]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.11, 0.11, 0.08, 12]} />
          <meshStandardMaterial color="#111827" />
        </mesh>
      )))}
    </group>
  );
}
