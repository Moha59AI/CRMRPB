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
  /** Fiche precedente, sans la conserver montee sous la fiche courante. */
  retour?: FondOuverture;
  /** Identifiants de la liste filtree, pour enchainer les dossiers. */
  liste?: string[];
  /** Affiche les actions de traitement de relance. */
  mode?: 'relance';
}

/**
 * Etat utilise pour passer d'une fiche a une autre.
 *
 * Le fond reste la liste d'origine. La fiche courante devient seulement une
 * adresse de retour : elle est demontee pendant la navigation, ce qui evite
 * d'empiler deux arbres lourds et leurs requetes sous le meme ecran.
 */
export function etatVersFiche(location: Location): EtatOuvertureDossier {
  const courant = (location.state ?? {}) as EtatOuvertureDossier;

  return {
    ...(courant.background ? { background: courant.background } : {}),
    ...(courant.liste ? { liste: courant.liste } : {}),
    ...(courant.mode ? { mode: courant.mode } : {}),
    retour: fondDepuis(location),
  };
}

/** Etat restaure sur la fiche precedente, sans recreer une chaine de retours. */
export function etatApresRetour(etat: EtatOuvertureDossier): EtatOuvertureDossier {
  return {
    ...(etat.background ? { background: etat.background } : {}),
    ...(etat.liste ? { liste: etat.liste } : {}),
    ...(etat.mode ? { mode: etat.mode } : {}),
  };
}
