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
  /*
   * PostgREST et PostgreSQL ne disent pas la meme chose.
   *
   * « column X does not exist » vient de PostgreSQL : la colonne manque
   * vraiment, une migration reste a appliquer.
   *
   * « Could not find the X column in the schema cache » (PGRST204) vient de
   * PostgREST : la colonne existe le plus souvent, mais son cache de schema
   * date d'avant la migration. Les confondre fait rejouer une migration deja
   * appliquee au lieu de recharger le cache.
   */
  const cache = brut.match(SCHEMA_INCONNU);
  if (cache) {
    const nom = cache[1] ?? 'inconnue';
    return `La colonne « ${nom} » est introuvable côté API. Si la migration a bien été appliquée, le cache de schéma est périmé : exécutez « notify pgrst, 'reload schema'; » dans le SQL Editor.`;
  }

  const colonne = brut.match(COLONNE_ABSENTE);
  if (colonne) {
    const nom = colonne[1] ?? 'inconnue';
    return `La colonne « ${nom} » n'existe pas en base. Une migration reste à appliquer dans le SQL Editor de Supabase.`;
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
