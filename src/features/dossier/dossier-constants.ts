import type { Location } from 'react-router-dom';

export type OngletDossier =
  | 'apercu' | 'documents' | 'assurance' | 'facturation' | 'historique';

export const ONGLETS: { cle: OngletDossier; label: string }[] = [
  { cle: 'apercu', label: "Vue d'ensemble" },
  { cle: 'documents', label: 'Documents' },
  { cle: 'assurance', label: 'Assurance' },
  { cle: 'facturation', label: 'Facturation' },
  { cle: 'historique', label: 'Historique' },
];

/**
 * Etat de navigation transmis a l'ouverture de la fiche.
 *
 * `background` memorise la page d'ou l'on vient pour continuer a la rendre
 * derriere : l'arbre React reste monte, donc filtres, recherche, scroll et
 * selection survivent sans qu'on ait a les sauvegarder.
 */
/**
 * Page de fond, reduite a son adresse.
 *
 * On ne stocke **pas** l'objet `location` complet : il porte son propre
 * `state`, donc son propre `background`. Ouvrir une intervention depuis une
 * fiche client, puis le client depuis cette intervention, imbriquait un
 * niveau a chaque fois -- l'etat d'historique grossissait exponentiellement,
 * et le navigateur devait le serialiser a chaque navigation, fermeture
 * comprise. C'est ce qui figeait l'interface.
 *
 * `state: null` coupe la chaine : le fond n'a jamais de fond.
 */
export interface FondOuverture {
  pathname: string;
  search: string;
  hash: string;
  state: null;
  key: string;
}

export function fondDepuis(location: Location): FondOuverture {
  return {
    pathname: location.pathname,
    search: location.search,
    hash: location.hash,
    state: null,
    key: 'fond',
  };
}

export interface EtatOuvertureDossier {
  background?: FondOuverture;
  /** Identifiants de la liste filtree, pour enchainer les dossiers. */
  liste?: string[];
  /** Affiche les actions de traitement de relance. */
  mode?: 'relance';
}
