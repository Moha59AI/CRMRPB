// Aperçu de la boîte mail, en développement seulement
//
// La boîte ne s'atteint qu'une fois connecté. Cette page monte la ligne de
// la liste sur des messages fabriqués, dans les cas qui font mal : un objet
// très long, un message sans objet, une adresse sans nom, des pièces
// jointes, un message sortant.
//
// La route n'existe pas en production.

import { useState } from 'react';
import { LigneEmail } from '@/features/integrations/email/ligne-email';
import type { Communication } from '@/types';

const HEURE = 3_600_000;

function message(partiel: Partial<Communication> & { id: string; heures: number }): Communication {
  return {
    type: 'email_inbound',
    direction: 'inbound',
    status: 'received',
    subject: null,
    content: null,
    email_attachments: [],
    created_at: new Date(Date.now() - partiel.heures * HEURE).toISOString(),
    ...partiel,
  } as Communication;
}

const CAS: { correspondant: string; aRattacher?: boolean; pdf?: number; email: Communication }[] = [
  {
    correspondant: 'Dorothée Vandeven',
    email: message({
      id: '1', heures: 1,
      subject: 'Devis pare-brise Golf VIII',
      content: 'Bonjour, je vous confirme le rendez-vous de jeudi matin. Vous trouverez ci-joint la carte grise comme convenu.',
    }),
  },
  {
    correspondant: 'MAIF Sinistres',
    pdf: 2,
    email: message({
      id: '2', heures: 5,
      subject: 'Prise en charge dossier 2026-04417 — accord de règlement',
      content: 'Nous vous confirmons la prise en charge au titre du contrat bris de glace.',
      email_attachments: [{ id: 'a', filename: 'accord.pdf', content_type: 'application/pdf' }],
    }),
  },
  {
    correspondant: 'contact@saint-gobain-distribution.fr',
    aRattacher: true,
    email: message({
      id: '3', heures: 26,
      subject: 'Votre commande du 04/10 est expédiée — suivi et facture jointe pour règlement sous 30 jours',
      content: 'Bonjour, votre commande a quitté notre entrepôt ce matin.',
      email_attachments: [
        { id: 'b', filename: 'facture.pdf', content_type: 'application/pdf' },
        { id: 'c', filename: 'bl.pdf', content_type: 'application/pdf' },
      ],
    }),
  },
  {
    correspondant: 'Ahmed Kacet',
    email: message({
      id: '4', heures: 50, direction: 'outbound', type: 'email_outbound', status: 'sent',
      subject: 'Votre intervention de mardi',
      content: 'Bonjour Monsieur Kacet, je reviens vers vous concernant le créneau de mardi.',
    }),
  },
  {
    correspondant: 'noreply@plateforme-assurance.fr',
    aRattacher: true,
    email: message({ id: '5', heures: 100 }),
  },
];

export function ApercuMail() {
  const [actif, setActif] = useState('1');

  return (
    <div className="min-h-full bg-background">
      <p className="gutter-x bg-warning/10 py-2 text-xs text-foreground">
        Aperçu de développement — messages fabriqués, aucune requête.
      </p>

      <div className="gutter-x py-5">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Liste de la boîte mail
        </h2>

        {/* Largeur de la colonne de gauche, pour juger la ligne telle qu'elle
            sera vue et non etiree sur l'ecran. */}
        <div className="max-w-[420px] divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {CAS.map((cas) => (
            <LigneEmail
              key={cas.email.id}
              email={cas.email}
              correspondant={cas.correspondant}
              aRattacher={cas.aRattacher}
              pdfFournisseur={cas.pdf}
              actif={cas.email.id === actif}
              onOuvrir={() => setActif(cas.email.id)}
            />
          ))}
        </div>

        <h2 className="mb-3 mt-8 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Sur toute la largeur
        </h2>
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {CAS.map((cas) => (
            <LigneEmail
              key={cas.email.id}
              email={cas.email}
              correspondant={cas.correspondant}
              aRattacher={cas.aRattacher}
              pdfFournisseur={cas.pdf}
              actif={cas.email.id === actif}
              onOuvrir={() => setActif(cas.email.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
