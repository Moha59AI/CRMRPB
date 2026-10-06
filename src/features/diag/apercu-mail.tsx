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
import { EnteteMessage } from '@/features/integrations/email/entete-message';
import { EmailHtmlViewer } from '@/features/integrations/email/email-html-viewer';
import { RailMail } from '@/features/integrations/email/rail-mail';
import { BarreOutilsMail } from '@/features/integrations/email/barre-outils-mail';
import { Inbox, Link2, Mail, Package, Search, Send, ShieldCheck, Star } from 'lucide-react';
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
    read_at: null,
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
      id: '2', heures: 5, read_at: new Date().toISOString(),
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
      id: '4', heures: 50, read_at: new Date().toISOString(), direction: 'outbound', type: 'email_outbound', status: 'sent',
      subject: 'Votre intervention de mardi',
      content: 'Bonjour Monsieur Kacet, je reviens vers vous concernant le créneau de mardi.',
    }),
  },
  {
    correspondant: 'noreply@plateforme-assurance.fr',
    aRattacher: true,
    email: message({ id: '5', heures: 100, read_at: new Date().toISOString() }),
  },
];

export function ApercuMail() {
  const rien = () => {};
  const [actif, setActif] = useState('1');
  const [railActif, setRailActif] = useState('inbound');
  const [selection, setSelection] = useState<Set<string>>(new Set());

  return (
    <div className="min-h-full bg-background">
      <p className="gutter-x bg-warning/10 py-2 text-xs text-foreground">
        Aperçu de développement — messages fabriqués, aucune requête.
      </p>

      <div className="gutter-x py-5">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Rail et barre d’outils
        </h2>
        <div className="flex h-[420px] overflow-hidden rounded-xl border border-border bg-card">
          <RailMail
            entrees={[
              { cle: 'inbound', label: 'Boîte de réception', Icone: Inbox, nonLus: 12, total: 545 },
              { cle: 'starred', label: 'Messages suivis', Icone: Star, total: 3 },
              { cle: 'outbound', label: 'Envoyés', Icone: Send, total: 128 },
              { cle: 'all', label: 'Tous les messages', Icone: Mail, nonLus: 12, total: 678 },
            ]}
            categories={[
              { cle: 'suppliers', label: 'Fournisseurs', Icone: Package, nonLus: 4, total: 61 },
              { cle: 'insurers', label: 'Assureurs', Icone: ShieldCheck, nonLus: 2, total: 44 },
              { cle: 'experts', label: 'Experts', Icone: Search, total: 9 },
              { cle: 'unlinked', label: 'Non rattachés', Icone: Link2, nonLus: 6, total: 37 },
            ]}
            active={railActif}
            onChanger={setRailActif}
            onEcrire={rien}
          />
          <div className="flex min-w-0 flex-1 flex-col">
            <BarreOutilsMail
              total={CAS.length}
              selection={selection.size}
              toutSelectionne={selection.size === CAS.length}
              onToutSelectionner={(choisi) => setSelection(
                choisi ? new Set(CAS.map((c) => c.email.id)) : new Set(),
              )}
              onActualiser={rien}
              onMarquerLus={rien}
              onSuivre={rien}
            />
            <div className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
              {CAS.map((cas) => (
                <LigneEmail
                  key={cas.email.id}
                  email={cas.email}
                  correspondant={cas.correspondant}
                  aRattacher={cas.aRattacher}
                  pdfFournisseur={cas.pdf}
                  actif={cas.email.id === actif}
                  onOuvrir={() => setActif(cas.email.id)}
                  selectionne={selection.has(cas.email.id)}
                  onSelectionner={(choisi) => setSelection((courante) => {
                    const suivante = new Set(courante);
                    if (choisi) suivante.add(cas.email.id); else suivante.delete(cas.email.id);
                    return suivante;
                  })}
                  onSuivre={rien}
                />
              ))}
            </div>
          </div>
        </div>

        <h2 className="mb-3 mt-8 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Liste en vue scindée, 440 px — l’objet doit rester lisible
        </h2>

        {/* La largeur exacte que prend la liste quand un message est ouvert.
            C'est le cas qui avait casse : l'expediteur et les pastilles
            mangeaient tout et il ne restait rien pour l'objet. */}
        <div className="max-w-[440px] divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {CAS.map((cas) => (
            <LigneEmail
              key={cas.email.id}
              email={cas.email}
              correspondant={cas.correspondant}
              aRattacher={cas.aRattacher}
              pdfFournisseur={cas.pdf}
              actif={cas.email.id === actif}
              onOuvrir={() => setActif(cas.email.id)}
              etroite
            />
          ))}
        </div>

        <h2 className="mb-3 mt-8 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          En-tête d’un message ouvert
        </h2>
        <div className="space-y-4 rounded-xl border border-border bg-card p-4">
          <EnteteMessage
            email={message({
              id: 'e1', heures: 2,
              subject: 'Facture n° 963028 — Ref Cde : *N***TOURCOING',
              sender_email: 'contact@vsf41.com',
              recipient_email: 'contact@relaisparebrise.fr',
              provider: 'ionos-imap',
            })}
            nom={null}
            correspondant="Fournisseur · VSF"
            aRattacher
          />
          <div className="border-t border-border pt-4">
            <EnteteMessage
              email={message({
                id: 'e2', heures: 20,
                subject: 'Confirmation de rendez-vous',
                sender_email: 'dorothee.vandeven@example.fr',
                recipient_email: 'contact@relaisparebrise.fr',
                provider: 'ionos-imap',
              })}
              nom="Dorothée Vandeven"
            />
          </div>
        </div>

        <h2 className="mb-3 mt-8 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Corps du message, sans cadre
        </h2>
        <div className="max-w-4xl">
          <EmailHtmlViewer
            html={null}
            text={[
              'Bonjour,',
              'Votre marchandise est partie du dépôt de Saint-Amand Longpré.',
              'Veuillez trouver ci-joint la copie de votre facture.',
              'Bonne réception.',
            ].join('\n\n')}
            subject="Facture n° 963028"
          />
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
