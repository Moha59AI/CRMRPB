// Aperçu de l'accueil, en développement seulement
//
// L'accueil ne s'atteint qu'une fois connecté, ce qui empêche de regarder une
// carte pendant qu'on la dessine. Cette page monte le graphique sur des
// données fabriquées : on voit l'animation, les couleurs et la densité sans
// toucher à la base ni ouvrir de session.
//
// Les chiffres sont inventés. La route n'existe pas en production.

import { CarteEvolution } from '@/features/today/today-page';
import type { MoisEvolution } from '@/features/today/indicateurs-accueil';

const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/** Douze mois plausibles, avec un creux d'hiver et un pic de printemps. */
function evolutionDemo(avecPaiements: boolean): MoisEvolution[] {
  const aujourdhui = new Date();
  return Array.from({ length: 12 }, (_, i) => {
    const date = new Date(aujourdhui.getFullYear(), aujourdhui.getMonth() - (11 - i), 1);
    const mois = date.getMonth();
    const creux = [0, 1, 11].includes(mois) ? 0.55 : mois >= 3 && mois <= 6 ? 1.25 : 1;
    const caNet = Math.round((7200 + ((i * 1370) % 4200)) * creux);
    return {
      cle: `${date.getFullYear()}-${String(mois + 1).padStart(2, '0')}`,
      libelle: MOIS[mois],
      caNet,
      encaisse: avecPaiements ? Math.round(caNet * (0.62 + ((i % 5) * 0.07))) : 0,
    };
  });
}

export function ApercuAccueil() {
  return (
    <div className="min-h-full bg-background">
      <p className="gutter-x bg-warning/10 py-2 text-xs text-foreground">
        Aperçu de développement — données fabriquées, aucune requête.
      </p>

      <div className="gutter-x space-y-5 py-5">
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Avec encaissements
          </h2>
          <CarteEvolution evolution={evolutionDemo(true)} chargement={false} />
        </section>

        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Sans date de paiement — le cas réel aujourd’hui
          </h2>
          <CarteEvolution evolution={evolutionDemo(false)} chargement={false} />
        </section>

        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            En chargement
          </h2>
          <CarteEvolution evolution={[]} chargement />
        </section>
      </div>
    </div>
  );
}
