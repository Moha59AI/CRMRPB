// Le vocabulaire des statuts de rendez-vous
//
// Extrait de la page Agenda pour que l'ecran des interventions dise les
// memes mots avec les memes couleurs. Deux listes separees auraient derive :
// « Terminé » d'un cote, « Réalisé » de l'autre, pour le meme etat.

import type { AppointmentStatus } from '@/types';

export const LIBELLE_STATUT_RDV: Record<AppointmentStatus, string> = {
  scheduled: 'Planifié',
  confirmed: 'Confirmé',
  completed: 'Terminé',
  cancelled: 'Annulé',
  no_show: 'Absent',
};

/** Pastille pleine, sur fond teinte. */
export const PASTILLE_STATUT_RDV: Record<AppointmentStatus, string> = {
  scheduled: 'bg-upcoming-soft/80 text-upcoming',
  confirmed: 'bg-done-soft/80 text-done',
  completed: 'bg-muted/80 text-muted-foreground',
  cancelled: 'bg-urgent-soft/80 text-urgent line-through',
  no_show: 'bg-due-soft/80 text-due',
};
