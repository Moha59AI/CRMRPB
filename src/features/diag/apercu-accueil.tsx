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
import { BadgeAttente } from '@/features/leads/leads-page';
import type { Lead, LeadStatus } from '@/types';

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


const HEURE = 3_600_000;

function leadDemo(heures: number, status: LeadStatus): Lead {
  const arrive = new Date(Date.now() - heures * HEURE).toISOString();
  return {
    id: `demo-${heures}-${status}`,
    status,
    arrive_le: arrive,
    received_at: arrive,
    created_at: arrive,
  } as Lead;
}

const CAS_ATTENTE: { titre: string; lead: Lead }[] = [
  { titre: 'Arrivé il y a 1 h', lead: leadDemo(1, 'new') },
  { titre: 'Arrivé il y a 9 h', lead: leadDemo(9, 'new') },
  { titre: 'Sans réponse depuis 3 jours', lead: leadDemo(74, 'nrp') },
  { titre: 'Sans réponse depuis 6 semaines', lead: leadDemo(1010, 'new') },
  { titre: 'Rendez-vous pris il y a 5 jours', lead: leadDemo(120, 'appointment_scheduled') },
];

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

        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Attente d’un lead — remplace le score
          </h2>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {CAS_ATTENTE.map(({ titre, lead }) => (
              <li key={lead.id} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">{titre}</span>
                <BadgeAttente lead={lead} compact />
                <BadgeAttente lead={lead} />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
