/**
 * Traduction des erreurs PostgREST en messages exploitables.
 *
 * Les messages bruts de Postgres sont exacts mais muets sur la conduite a
 * tenir. Deux cas reviennent assez souvent pour meriter d'etre nommes :
 * une migration non appliquee, et un refus de politique RLS. Les confondre
 * fait chercher un probleme de droits la ou il manque une colonne.
 */

/** Colonne absente : la migration correspondante n'a pas ete jouee. */
const COLONNE_ABSENTE = /column\s+"?([\w.]+)"?\s+.*does not exist/i;
const SCHEMA_INCONNU = /Could not find the '([\w]+)' column|PGRST204/i;

/** Refus de politique RLS, ou droit manquant. */
const REFUS_RLS = /row-level security|violates row-level security|permission denied|42501/i;

/** Contrainte CHECK : la valeur envoyee n'est pas dans le vocabulaire accepte. */
const CONTRAINTE = /violates check constraint "([\w]+)"/i;

export function messageErreurBase(brut: string): string {
  const colonne = brut.match(COLONNE_ABSENTE) ?? brut.match(SCHEMA_INCONNU);
  if (colonne) {
    const nom = colonne[1] ?? 'inconnue';
    return `La colonne « ${nom} » n'existe pas encore en base. Une migration reste à appliquer dans le SQL Editor de Supabase.`;
  }

  if (REFUS_RLS.test(brut)) {
    return "Votre rôle ne permet pas cette modification.";
  }

  const contrainte = brut.match(CONTRAINTE);
  if (contrainte) {
    return `Valeur refusée par la contrainte « ${contrainte[1]} ».`;
  }

  return brut;
}
