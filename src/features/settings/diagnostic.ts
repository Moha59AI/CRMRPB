// Diagnostic de l'etat du systeme
//
// Traduit les compteurs bruts en constat lisible. Ce fichier existe separement
// de l'affichage parce que c'est la seule partie qui contient un raisonnement :
// « 28 en attente » ne veut rien dire, « 28 leads bloques depuis hier, le
// traitement ne tourne pas » indique quoi faire.

import type { EtatCron, EtatMeta, EtatSysteme } from '@/services/admin-service';

export type NiveauSante = 'ok' | 'attention' | 'probleme' | 'inactif';

export interface Constat {
  niveau: NiveauSante;
  titre: string;
  detail: string;
  /** Ce qu'il faut faire. Absent quand il n'y a rien a faire. */
  action?: string;
}

const MINUTE = 60_000;
const HEURE = 60 * MINUTE;

function anciennete(iso: string | null | undefined, maintenant: number): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : maintenant - t;
}

export function formaterDuree(ms: number): string {
  if (ms < MINUTE) return "à l'instant";
  const minutes = Math.floor(ms / MINUTE);
  if (minutes < 60) return `il y a ${minutes} min`;
  const heures = Math.floor(ms / HEURE);
  if (heures < 24) return `il y a ${heures} h`;
  const jours = Math.floor(heures / 24);
  return jours === 1 ? 'hier' : `il y a ${jours} jours`;
}

/**
 * Etat de la file Meta.
 *
 * L'ordre des tests suit la gravite : une file qui stagne est plus urgent
 * qu'un lead en erreur, lui-meme plus urgent qu'une absence de reception.
 */
export function diagnostiquerMeta(
  meta: EtatMeta | undefined,
  cron: EtatCron | undefined,
  maintenant: number = Date.now(),
): Constat {
  const enAttente = meta?.en_attente ?? 0;
  const enErreur = meta?.en_erreur ?? 0;
  const traites = meta?.traites ?? 0;
  const ageRecu = anciennete(meta?.dernier_recu, maintenant);

  if (enAttente === 0 && enErreur === 0 && traites === 0 && ageRecu === null) {
    return {
      niveau: 'inactif',
      titre: 'Aucun lead Meta reçu',
      detail:
        "Aucun événement n'est jamais arrivé. Soit l'abonnement au webhook n'est pas actif, soit aucune publicité ne tourne.",
      action: 'Vérifier la configuration Meta Ads',
    };
  }

  // Une file qui stagne : Meta livre, mais le traitement ne suit pas.
  if (enAttente > 0) {
    const cronCasse =
      cron?.planifie === null ||
      (cron?.echecs_recents ?? 0) > 0 ||
      (cron?.dernier_statut != null && cron.dernier_statut !== 'succeeded');

    return {
      niveau: 'probleme',
      titre: `${enAttente} lead${enAttente > 1 ? 's' : ''} en attente`,
      detail: cronCasse
        ? "Meta livre bien, mais le traitement de la file échoue. Ces leads sont reçus et conservés — ils ne sont pas perdus, seulement pas encore créés."
        : "Ces leads sont reçus et attendent leur traitement. S'ils ne passent pas dans les prochaines minutes, le traitement est bloqué.",
      action: cronCasse ? 'Vérifier le traitement automatique' : undefined,
    };
  }

  if (enErreur > 0) {
    return {
      niveau: 'attention',
      titre: `${enErreur} lead${enErreur > 1 ? 's' : ''} en échec`,
      detail:
        "Le nombre de tentatives est épuisé. En général : jeton Meta expiré, ou formulaire supprimé côté Meta.",
      action: 'Consulter le détail des erreurs',
    };
  }

  // Plus rien depuis longtemps, alors qu'il y a un historique.
  if (ageRecu !== null && ageRecu > 7 * 24 * HEURE) {
    return {
      niveau: 'attention',
      titre: 'Aucune réception récente',
      detail: `Le dernier lead Meta est arrivé ${formaterDuree(ageRecu)}. C'est normal si aucune campagne ne tourne.`,
    };
  }

  return {
    niveau: 'ok',
    titre: 'Réception opérationnelle',
    detail:
      ageRecu !== null
        ? `${traites} lead${traites > 1 ? 's' : ''} traité${traites > 1 ? 's' : ''} au total. Dernière réception ${formaterDuree(ageRecu)}.`
        : `${traites} lead${traites > 1 ? 's' : ''} traité${traites > 1 ? 's' : ''}.`,
  };
}

/** Etat du traitement automatique (pg_cron + Edge Function). */
export function diagnostiquerCron(
  cron: EtatCron | undefined,
  maintenant: number = Date.now(),
): Constat {
  if (!cron || cron.planifie === null) {
    return {
      niveau: 'probleme',
      titre: 'Traitement automatique absent',
      detail:
        "Aucune tâche planifiée n'a été trouvée. Sans elle, les leads reçus restent en file indéfiniment.",
      action: 'Planifier le traitement',
    };
  }

  const age = anciennete(cron.derniere_execution, maintenant);

  if (age === null) {
    return {
      niveau: 'attention',
      titre: 'Jamais exécuté',
      detail: "La tâche est planifiée mais ne s'est encore jamais déclenchée.",
    };
  }

  if (cron.dernier_statut && cron.dernier_statut !== 'succeeded') {
    return {
      niveau: 'probleme',
      titre: 'Le traitement échoue',
      detail:
        cron.dernier_message?.trim() ||
        `Dernière exécution ${formaterDuree(age)}, en échec, sans message.`,
      action: 'Corriger la configuration',
    };
  }

  // Planifie a la minute : au-dela de 15 minutes, quelque chose s'est arrete.
  if (age > 15 * MINUTE) {
    return {
      niveau: 'attention',
      titre: 'Traitement au ralenti',
      detail: `Dernière exécution ${formaterDuree(age)}, alors qu'elle est prévue chaque minute.`,
    };
  }

  return {
    niveau: 'ok',
    titre: 'Traitement actif',
    detail: `Dernière exécution ${formaterDuree(age)}${
      (cron.echecs_recents ?? 0) > 0 ? `, ${cron.echecs_recents} échec(s) dans l'heure` : ''
    }.`,
  };
}

/** Le constat le plus grave de l'ensemble, pour le bandeau de tete. */
export function niveauGlobal(
  etat: EtatSysteme | undefined,
  maintenant: number = Date.now(),
): NiveauSante {
  if (!etat) return 'inactif';

  const constats = [
    diagnostiquerMeta(etat.meta, etat.cron, maintenant),
    diagnostiquerCron(etat.cron, maintenant),
  ];

  if (etat.integrations.some((i) => i.statut === 'error')) return 'probleme';
  if (constats.some((c) => c.niveau === 'probleme')) return 'probleme';
  if (constats.some((c) => c.niveau === 'attention')) return 'attention';
  if (constats.every((c) => c.niveau === 'inactif')) return 'inactif';
  return 'ok';
}
