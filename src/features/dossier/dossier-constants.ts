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
export interface EtatOuvertureDossier {
  background?: Location;
  /** Identifiants de la liste filtree, pour enchainer les dossiers. */
  liste?: string[];
  /** Affiche les actions de traitement de relance. */
  mode?: 'relance';
}
