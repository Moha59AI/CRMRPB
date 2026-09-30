import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Phone, MessageSquare, Mail, FileText, StickyNote, CalendarClock,
  User, Briefcase, UserCog, Send, History, Copy, Award, Gift, Printer, Receipt,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { LeadIdentity, LeadQualification } from '@/features/leads/lead-qualification';
import {
  formatDateTime, profileName, LIBELLE_VITRAGE, sourceLabels,
} from '@/features/leads/lead-shared';
import { fetchCommunications, fetchNotes, createNote } from '@/services/activity-service';
import { fetchTasks } from '@/services/planning-service';
import { fetchInterventionsDuContact, analyserDoublon } from '@/services/leads-service';
import type { Lead, Profile } from '@/types';
import type { AnalyseDoublon } from '@/services/leads-service';
import { ONGLETS, type OngletDossier } from './dossier-constants';
import { StatusBadge } from '@/features/leads/status-badge';
import { attenteDuLead } from '@/features/leads/anciennete';
import { DocumentsClientPanel } from './documents-client-panel';
import { FacturationClient } from '@/features/billing/facturation-client';
import { LeadAiAssistant } from '@/features/ai/lead-ai-assistant';
import { lireAttributionMeta } from '@/features/leads/meta-attribution';
import { BonRemiseCadeauDialog } from './gift-voucher-dialog';

interface EvenementTimeline {
  cle: string;
  date: string;
  icone: typeof Phone;
  titre: string;
  detail: string | null;
}

const ICONE_COMM: Record<string, typeof Phone> = {
  call_outbound: Phone, call_inbound: Phone, call_missed: Phone,
  sms_outbound: MessageSquare, sms_inbound: MessageSquare,
  email_outbound: Mail, email_inbound: Mail,
  voicemail: Phone, note: StickyNote,
};

const LIBELLE_COMM: Record<string, string> = {
  call_outbound: 'Appel sortant', call_inbound: 'Appel entrant',
  call_missed: 'Appel manqué', sms_outbound: 'SMS envoyé',
  sms_inbound: 'SMS reçu', email_outbound: 'Email envoyé',
  email_inbound: 'Email reçu', voicemail: 'Messagerie', note: 'Note',
};

interface DossierContenuProps {
  lead: Lead;
  profiles: Profile[];
  onglet: OngletDossier;
  onUpdate: (updates: Partial<Lead>) => void;
  enregistrement: boolean;
  onVoirHistorique: () => void;
}

export function DossierContenu({
  lead, profiles, onglet, onUpdate, enregistrement, onVoirHistorique,
}: DossierContenuProps) {
  const queryClient = useQueryClient();
  const [nouvelleNote, setNouvelleNote] = useState('');
  const [bonCadeauOuvert, setBonCadeauOuvert] = useState(false);

  const { data: communications, isLoading: chargeComms } = useQuery({
    queryKey: ['lead-communications', lead.id],
    queryFn: () => fetchCommunications({ leadId: lead.id }),
  });
  const { data: notes } = useQuery({
    queryKey: ['lead-notes', lead.id],
    queryFn: () => fetchNotes({ leadId: lead.id }),
  });
  const { data: taches } = useQuery({
    queryKey: ['lead-tasks', lead.id],
    queryFn: () => fetchTasks({ leadId: lead.id }),
  });

  // Un client peut revenir : pare-brise en janvier, lunette arriere en juillet.
  // Chaque intervention est un lead distinct rattache au meme contact.
  const { data: autresInterventions } = useQuery({
    queryKey: ['interventions-contact', lead.contact_id, lead.id],
    queryFn: () => fetchInterventionsDuContact(lead.contact_id as string, lead.id),
    enabled: !!lead.contact_id,
  });

  const { data: doublon } = useQuery({
    queryKey: ['doublon', lead.id, lead.phone, lead.email],
    queryFn: () => analyserDoublon({
      phone: lead.phone, email: lead.email, excludeLeadId: lead.id,
    }),
    enabled: !!(lead.phone || lead.email),
  });

  const ajouterNote = useMutation({
    mutationFn: async () => {
      const result = await createNote({ lead_id: lead.id, content: nouvelleNote.trim() });
      if (result.error) throw new Error(result.error);
      return result.note;
    },
    onSuccess: () => {
      setNouvelleNote('');
      queryClient.invalidateQueries({ queryKey: ['lead-notes', lead.id] });
      toast.success('Note ajoutée');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const timeline = useMemo<EvenementTimeline[]>(() => {
    const evenements: EvenementTimeline[] = [];

    for (const c of communications ?? []) {
      evenements.push({
        cle: `c-${c.id}`, date: c.created_at,
        icone: ICONE_COMM[c.type] ?? MessageSquare,
        titre: LIBELLE_COMM[c.type] ?? c.type,
        detail: c.content,
      });
    }
    for (const n of notes ?? []) {
      evenements.push({
        cle: `n-${n.id}`, date: n.created_at, icone: StickyNote,
        titre: 'Note', detail: n.content,
      });
    }
    for (const t of taches ?? []) {
      evenements.push({
        cle: `t-${t.id}`, date: t.created_at, icone: CalendarClock,
        titre: `Tâche : ${t.title}`,
        detail: t.status === 'done' ? 'Terminée' : 'En attente',
      });
    }

    return evenements.sort((a, b) => b.date.localeCompare(a.date));
  }, [communications, notes, taches]);

  if (onglet === 'historique') {
    return (
      <div className="mx-auto max-w-3xl">
        <Timeline evenements={timeline} chargement={chargeComms} complet />
      </div>
    );
  }

  if (onglet === 'documents') {
    return <DocumentsClientPanel lead={lead} />;
  }

  // La facturation ne depend pas du dossier vitrage : elle vit sur le client,
  // synchronisee depuis Onify. Attendre la conversion revenait a n'afficher
  // jamais rien -- deux dossiers vitrage existent, pour 146 factures.
  if (onglet === 'facturation') {
    if (!lead.contact_id) return <SansClient />;
    return (
      <FacturationClient contactId={lead.contact_id} plaque={lead.vehicle_registration} />
    );
  }

  if (onglet !== 'apercu') {
    return <OngletAVenir onglet={onglet} />;
  }

  const conseiller = profiles.find((p) => p.id === lead.assigned_user_id) ?? null;
  const attributionMeta = lead.source === 'meta' ? lireAttributionMeta(lead) : null;
  const lignesDossier: [string, string | null][] = attributionMeta
    ? [
        ['Source', 'Meta Lead Ads'],
        ['Campagne Meta', attributionMeta.campagne],
        ['Ensemble de publicités', attributionMeta.ensemble],
        ['Publicité', attributionMeta.publicite],
        ['Formulaire', attributionMeta.formulaire],
        ['Lead Meta', attributionMeta.lead],
        ['Reçu le', formatDateTime(lead.received_at || lead.created_at)],
        ['En attente depuis', attenteDuLead(lead).libelle],
      ]
    : [
        ['Source', sourceLabels[lead.source] ?? lead.source],
        ['Campagne', lead.campaign_name],
        ['Reçu le', formatDateTime(lead.received_at || lead.created_at)],
        ['En attente depuis', attenteDuLead(lead).libelle],
      ];

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
      {/* Colonne principale */}
      <div className="min-w-0 space-y-6">
        {doublon && doublon.type !== 'aucun' && <BandeauDoublon analyse={doublon} />}

        <ProchaineAction lead={lead} />

        <LeadAiAssistant
          lead={lead}
          notes={notes ?? []}
          onVoirHistorique={onVoirHistorique}
        />

        <Bloc titre="Client et coordonnées">
          <LeadIdentity lead={lead} onUpdate={onUpdate} desactive={enregistrement} />
        </Bloc>

        <Bloc titre="Intervention et qualification">
          <LeadQualification lead={lead} onUpdate={onUpdate} desactive={enregistrement} />
        </Bloc>

        <Bloc titre="Note rapide">
          <Textarea
            value={nouvelleNote}
            onChange={(e) => setNouvelleNote(e.target.value)}
            placeholder="Ce qui s'est dit pendant l'appel…"
            className="min-h-[80px] rounded-lg"
          />
          <div className="mt-2 flex justify-end">
            <Button
              size="sm" className="rounded-full"
              disabled={!nouvelleNote.trim() || ajouterNote.isPending}
              onClick={() => ajouterNote.mutate()}
            >
              <Send className="mr-1.5 h-3.5 w-3.5" />
              Ajouter
            </Button>
          </div>
        </Bloc>

        <Bloc titre="Derniers échanges">
          <Timeline evenements={timeline.slice(0, 8)} chargement={chargeComms} />
        </Bloc>
      </div>

      {/* Colonne laterale : ce qu'on consulte, et qu'on ne saisit pas pendant
          l'appel.

          Les cartes « Résumé client », « Véhicule » et « Assurance » ont été
          retirées : elles répétaient mot pour mot les champs éditables de la
          colonne de gauche. On lisait deux fois la même chose, côte à côte, ce
          qui allongeait la fiche sans rien apprendre. */}
      <div className="space-y-4">
        {autresInterventions && autresInterventions.length > 0 && (
          <section className="rounded-xl border border-border bg-card p-4">
            <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <History className="h-3.5 w-3.5" />
              Déjà client
              <span className="ml-auto tabular normal-case">
                {autresInterventions.length + 1} intervention{autresInterventions.length > 0 ? 's' : ''}
              </span>
            </h3>
            <ul className="space-y-2">
              {autresInterventions.slice(0, 5).map((i) => (
                <li key={i.id} className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-foreground">
                      {i.glass_type ? LIBELLE_VITRAGE[i.glass_type] : 'Intervention'}
                    </p>
                    <p className="text-xs text-muted-foreground tabular">
                      {formatDateTime(i.received_at || i.created_at)}
                    </p>
                  </div>
                  <StatusBadge status={i.status} className="shrink-0" />
                </li>
              ))}
            </ul>
          </section>
        )}

        <FicheInfo icone={Briefcase} titre="Dossier" lignes={lignesDossier} />

        <section className="rounded-xl border border-border bg-card p-4">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Gift className="h-3.5 w-3.5" />
            Bon de remise de cadeau
          </h3>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Cadeau sélectionné : <span className="font-medium text-foreground">{lead.offer || 'à renseigner'}</span>. Le bon reste entièrement vérifiable avant impression.
          </p>
          <Button
            variant="outline"
            className="mt-3 w-full rounded-full"
            onClick={() => setBonCadeauOuvert(true)}
          >
            <Printer className="mr-2 h-4 w-4" />
            Préparer et imprimer
          </Button>
        </section>

        <FicheInfo icone={UserCog} titre="Conseiller" lignes={[
          ['Assigné à', conseiller ? profileName(conseiller) : null],
        ]} />
      </div>
      </div>

      <BonRemiseCadeauDialog
        lead={lead}
        open={bonCadeauOuvert}
        onOpenChange={setBonCadeauOuvert}
      />
    </>
  );
}

function BandeauDoublon({ analyse }: { analyse: AnalyseDoublon }) {
  const doublon = analyse.type === 'doublon';
  const Icone = doublon ? Copy : Award;

  return (
    <div className={cn(
      'flex items-start gap-2.5 rounded-xl border px-4 py-3',
      doublon ? 'border-due/30 bg-due-soft' : 'border-done/30 bg-done-soft'
    )}>
      <Icone className={cn('mt-0.5 h-4 w-4 shrink-0', doublon ? 'text-due' : 'text-done')} />
      <div className="min-w-0">
        <p className={cn('text-sm font-medium', doublon ? 'text-due' : 'text-done')}>
          {doublon ? 'Doublon probable' : 'Client fidèle'}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {doublon
            ? `Une autre demande de cette personne est encore ouverte, reçue il y a ${analyse.jours} jour${(analyse.jours ?? 0) > 1 ? 's' : ''}. Traitez-les ensemble plutôt que de rappeler deux fois.`
            : `Déjà ${(analyse.nb_autres ?? 0) + 1} interventions avec vous. La dernière remonte à ${analyse.jours} jours.`}
        </p>
      </div>
    </div>
  );
}

function ProchaineAction({ lead }: { lead: Lead }) {
  const quand = lead.next_action_at ? new Date(lead.next_action_at) : null;
  const enRetard = quand ? quand < new Date() : false;

  return (
    <div className={cn(
      'rounded-xl border px-4 py-3',
      enRetard ? 'border-urgent/30 bg-urgent-soft' : 'border-border bg-muted/40'
    )}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Prochaine action
      </p>
      <p className={cn('mt-1 text-sm font-medium', enRetard ? 'text-urgent' : 'text-foreground')}>
        {quand
          ? `${enRetard ? 'En retard depuis le' : 'Prévue le'} ${formatDateTime(lead.next_action_at)}`
          : 'Aucune date fixée — le délai du statut s’applique'}
      </p>
    </div>
  );
}

function Bloc({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {titre}
      </h3>
      <div className="rounded-xl border border-border bg-card p-4">{children}</div>
    </section>
  );
}

function FicheInfo({
  icone: Icone, titre, lignes,
}: {
  icone: typeof User;
  titre: string;
  lignes: [string, string | null][];
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Icone className="h-3.5 w-3.5" />
        {titre}
      </h3>
      <dl className="space-y-2">
        {lignes.map(([label, valeur]) => (
          <div key={label} className="flex items-baseline justify-between gap-3">
            <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
            <dd
              title={valeur ?? undefined}
              className={cn(
                'min-w-0 break-words text-right text-sm',
                valeur ? 'text-foreground' : 'text-muted-foreground/50'
              )}
            >
              {valeur ?? '—'}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Timeline({
  evenements, chargement, complet,
}: {
  evenements: EvenementTimeline[];
  chargement: boolean;
  complet?: boolean;
}) {
  if (chargement) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
      </div>
    );
  }

  if (evenements.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Aucun échange enregistré pour l’instant.
      </p>
    );
  }

  return (
    <ol className={cn('space-y-3', complet && 'border-l border-border pl-4')}>
      {evenements.map((e) => (
        <li key={e.cle} className="flex gap-3">
          <e.icone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium text-foreground">{e.titre}</span>
              <span className="shrink-0 text-xs text-muted-foreground tabular">
                {formatDateTime(e.date)}
              </span>
            </div>
            {e.detail && (
              <p className={cn('text-sm text-muted-foreground', !complet && 'truncate')}>
                {e.detail}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * Un lead sans client n'a rien a facturer : la facturation se lit sur la
 * personne, pas sur l'intervention.
 */
function SansClient() {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-10 text-center">
      <Receipt className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">
        Cette intervention n’est rattachée à aucun client : renseignez un
        téléphone ou un email pour retrouver sa facturation.
      </p>
    </div>
  );
}

/**
 * L'onglet Assurance s'appuie sur `windscreen_cases`, qui n'est alimente
 * qu'une fois le dossier cree. Il est annonce comme tel plutot que
 * d'afficher un vide sans explication.
 */
function OngletAVenir({ onglet }: { onglet: OngletDossier }) {
  const libelle = ONGLETS.find((o) => o.cle === onglet)?.label ?? onglet;
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <FileText className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="text-base font-semibold">{libelle}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Cette section s’active à la création du dossier vitrage. Tant que le lead
        n’est pas converti, il n’y a ni déclaration, ni facture à afficher.
      </p>
    </div>
  );
}
