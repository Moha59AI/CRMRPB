import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  Inbox,
  Link2,
  Loader2,
  Mail,
  Package,
  Paperclip,
  PenLine,
  RefreshCw,
  Reply,
  Search,
  Send,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { fetchContacts } from '@/services/contacts-service';
import { fetchInsurers } from '@/services/insurers-service';
import { fetchLeads } from '@/services/leads-service';
import type { Communication, Contact, Lead } from '@/types';
import {
  classifyEmailParty,
  type EmailPartyClassification,
} from './email-classification';
import {
  buildSignedEmailContent, fetchEmailAttachment, fetchEmailHtml, fetchMailboxEmails, getIonosConnection, getIonosMailboxStatus, parseIonosSettings, prepareEmailAttachments, sendIonosEmail, syncIonosMailbox, type IonosMailboxStatus, marquerEmailLu,
} from './email-service';
import { EmailAttachmentPicker } from './email-attachment-picker';
import { EmailHtmlViewer } from './email-html-viewer';
import { EmailLeadLinkDialog } from './email-lead-link-dialog';
import { LigneEmail, estNonLu } from './ligne-email';
import { EnteteMessage } from './entete-message';

type MailboxView = 'inbound' | 'suppliers' | 'insurers' | 'experts' | 'outbound' | 'all' | 'unlinked';

const mailboxViews: Array<{
  key: MailboxView;
  label: string;
  Icon: typeof Mail;
}> = [
  { key: 'inbound', label: 'Reçus', Icon: Inbox },
  { key: 'suppliers', label: 'Fournisseurs', Icon: Package },
  { key: 'insurers', label: 'Assureurs', Icon: ShieldCheck },
  { key: 'experts', label: 'Experts', Icon: Search },
  { key: 'outbound', label: 'Envoyés', Icon: Send },
  { key: 'all', label: 'Tous', Icon: Mail },
  { key: 'unlinked', label: 'Non rattachés', Icon: Link2 },
];

const OTHER_CLASSIFICATION: EmailPartyClassification = {
  category: 'other',
  organization: null,
  confidence: 'confirmed',
};

type EmailAttachment = Communication['email_attachments'][number];

type AttachmentViewerState = {
  attachment: EmailAttachment;
  contentType: string;
  error: string | null;
  status: 'loading' | 'ready' | 'error';
  url: string | null;
};

function isPdfAttachment(attachment: EmailAttachment): boolean {
  const contentType = attachment.content_type?.split(';', 1)[0].trim().toLowerCase();
  return contentType === 'application/pdf' || attachment.filename.toLowerCase().endsWith('.pdf');
}

function partyLabel(classification: EmailPartyClassification): string {
  if (classification.category === 'insurer') return 'Assureur';
  if (classification.category === 'expert') return 'Cabinet d’expertise';
  if (classification.category === 'supplier') return 'Fournisseur';
  return 'Autre correspondant';
}

function formatFullDate(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function personName(person: Pick<Contact | Lead, 'first_name' | 'last_name' | 'email'>): string | null {
  return [person.first_name, person.last_name].filter(Boolean).join(' ') || person.email || null;
}

type EmailRecipientOption = {
  id: string;
  label: string;
  email: string;
};

function buildEmailRecipientOptions(leads: Lead[], contacts: Contact[]): EmailRecipientOption[] {
  const options: EmailRecipientOption[] = [];
  contacts.forEach((contact) => {
    if (!contact.email) return;
    options.push({
      id: `contact:${contact.id}`,
      label: personName(contact) ?? contact.email,
      email: contact.email,
    });
  });
  leads.forEach((lead) => {
    if (!lead.email) return;
    options.push({
      id: `lead:${lead.id}`,
      label: personName(lead) ?? lead.email,
      email: lead.email,
    });
  });
  return options.sort((left, right) => left.label.localeCompare(right.label, 'fr'));
}

function parseEmailRecipient(value: string): { kind: 'contact' | 'lead'; id: string } | null {
  const [kind, id] = value.split(':');
  if (!id || (kind !== 'contact' && kind !== 'lead')) return null;
  return { kind, id };
}

function resolvePerson(
  email: Communication,
  contacts: Map<string, Contact>,
  leads: Map<string, Lead>,
): string | null {
  if (email.contact_id) {
    const contact = contacts.get(email.contact_id);
    if (contact) return personName(contact);
  }
  if (email.lead_id) {
    const lead = leads.get(email.lead_id);
    if (lead) return personName(lead);
  }
  return null;
}

function matchesMailboxView(
  email: Communication,
  view: MailboxView,
  classification: EmailPartyClassification,
): boolean {
  if (view === 'inbound') return email.direction === 'inbound';
  if (view === 'suppliers') return email.direction === 'inbound' && classification.category === 'supplier';
  if (view === 'insurers') return email.direction === 'inbound' && classification.category === 'insurer';
  if (view === 'experts') return email.direction === 'inbound' && classification.category === 'expert';
  if (view === 'outbound') return email.direction === 'outbound';
  if (view === 'unlinked') return !email.contact_id && !email.lead_id;
  return true;
}

function EmailPartyBadge({ classification }: { classification: EmailPartyClassification }) {
  if (classification.category === 'other') return null;
  const insurer = classification.category === 'insurer';
  const supplier = classification.category === 'supplier';
  const label = supplier ? 'Fournisseur' : insurer ? 'Assureur' : 'Expert';
  const title = classification.organization ? `${label} · ${classification.organization}` : `${label} probable`;

  return (
    <Badge
      variant="outline"
      title={classification.confidence === 'confirmed' ? 'Correspondant reconnu' : 'Détection probable à vérifier'}
      className={`max-w-full gap-1 rounded-full text-[10px] ${
        supplier
          ? 'border-due/25 bg-due-soft text-due'
          : insurer
          ? 'border-primary/25 bg-primary/5 text-primary'
          : 'border-upcoming/25 bg-upcoming-soft text-upcoming'
      }`}
    >
      {supplier
        ? <Package className="h-3 w-3 shrink-0" />
        : insurer
          ? <ShieldCheck className="h-3 w-3 shrink-0" />
          : <Search className="h-3 w-3 shrink-0" />}
      <span className="truncate">{title}</span>
    </Badge>
  );
}

function statusLabel(email: Communication): string {
  if (email.direction === 'inbound') return 'Reçu';
  if (email.status === 'failed') return 'Échec';
  if (email.status === 'delivered') return 'Livré';
  if (email.status === 'sent') return 'Envoyé';
  return 'En cours';
}

function statusClass(email: Communication): string {
  if (email.status === 'failed') return 'border-urgent/25 bg-urgent-soft text-urgent';
  if (email.direction === 'inbound' || email.status === 'delivered') {
    return 'border-done/25 bg-done-soft text-done';
  }
  return 'border-upcoming/25 bg-upcoming-soft text-upcoming';
}

export function EmailInboxPage() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<MailboxView>('inbound');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);

  const emailsQuery = useQuery({
    queryKey: ['mailbox-emails'],
    queryFn: fetchMailboxEmails,
  });
  const ionosConnectionQuery = useQuery({
    queryKey: ['ionos-email-connection'],
    queryFn: getIonosConnection,
  });
  const mailboxStatusQuery = useQuery({
    queryKey: ['ionos-email-status'],
    queryFn: getIonosMailboxStatus,
    retry: false,
  });
  const contactsQuery = useQuery({ queryKey: ['contacts-all'], queryFn: () => fetchContacts({}) });
  const leadsQuery = useQuery({ queryKey: ['leads-all'], queryFn: () => fetchLeads({}) });
  const archivedLeadsQuery = useQuery({
    queryKey: ['leads-archived-mail-link'],
    queryFn: () => fetchLeads({ archives: true }),
  });
  const insurersQuery = useQuery({
    queryKey: ['mailbox-insurers'],
    queryFn: () => fetchInsurers({ inclureInactifs: true }),
    staleTime: 5 * 60 * 1000,
  });

  const contactMap = useMemo(() => {
    const map = new Map<string, Contact>();
    (contactsQuery.data ?? []).forEach((contact) => map.set(contact.id, contact));
    return map;
  }, [contactsQuery.data]);

  const allLeads = useMemo(() => {
    const byId = new Map<string, Lead>();
    [...(leadsQuery.data ?? []), ...(archivedLeadsQuery.data ?? [])]
      .forEach((lead) => byId.set(lead.id, lead));
    return [...byId.values()];
  }, [leadsQuery.data, archivedLeadsQuery.data]);

  const leadMap = useMemo(() => {
    const map = new Map<string, Lead>();
    allLeads.forEach((lead) => map.set(lead.id, lead));
    return map;
  }, [allLeads]);

  const classificationMap = useMemo(() => {
    const map = new Map<string, EmailPartyClassification>();
    (emailsQuery.data ?? []).forEach((email) => {
      map.set(email.id, classifyEmailParty(email, insurersQuery.data ?? []));
    });
    return map;
  }, [emailsQuery.data, insurersQuery.data]);

  const counts = useMemo(() => {
    const emails = emailsQuery.data ?? [];
    return {
      inbound: emails.filter((email) => email.direction === 'inbound').length,
      suppliers: emails.filter((email) => (
        email.direction === 'inbound' && classificationMap.get(email.id)?.category === 'supplier'
      )).length,
      insurers: emails.filter((email) => (
        email.direction === 'inbound' && classificationMap.get(email.id)?.category === 'insurer'
      )).length,
      experts: emails.filter((email) => (
        email.direction === 'inbound' && classificationMap.get(email.id)?.category === 'expert'
      )).length,
      outbound: emails.filter((email) => email.direction === 'outbound').length,
      all: emails.length,
      unlinked: emails.filter((email) => !email.contact_id && !email.lead_id).length,
    } satisfies Record<MailboxView, number>;
  }, [emailsQuery.data, classificationMap]);

  const filteredEmails = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('fr-FR');
    return (emailsQuery.data ?? []).filter((email) => {
      const classification = classificationMap.get(email.id) ?? OTHER_CLASSIFICATION;
      if (!matchesMailboxView(email, view, classification)) return false;
      if (!needle) return true;
      const person = resolvePerson(email, contactMap, leadMap) ?? '';
      return [
        email.subject,
        email.content,
        email.sender_email,
        email.recipient_email,
        person,
        classification.category === 'insurer' ? 'assureur assurance' : null,
        classification.category === 'expert' ? 'expert expertise' : null,
        classification.category === 'supplier' ? 'fournisseur vsf pilkington pdf' : null,
        classification.organization,
      ].some((value) => value?.toLocaleLowerCase('fr-FR').includes(needle));
    });
  }, [emailsQuery.data, search, view, contactMap, leadMap, classificationMap]);

  useEffect(() => {
    if (filteredEmails.length === 0) {
      setSelectedId(null);
      setMobileDetailOpen(false);
      return;
    }
    if (!selectedId || !filteredEmails.some((email) => email.id === selectedId)) {
      setSelectedId(filteredEmails[0].id);
    }
  }, [filteredEmails, selectedId]);

  const selectedEmail = filteredEmails.find((email) => email.id === selectedId) ?? null;
  const emailSignature = parseIonosSettings(ionosConnectionQuery.data ?? null).signature;

  const openEmail = (id: string) => {
    setSelectedId(id);
    setMobileDetailOpen(true);

    // L'affichage ne dépend pas de l'écriture : le message s'ouvre tout de
    // suite, et la liste se rafraîchit quand la base a pris la marque.
    const email = emailsQuery.data?.find((item) => item.id === id);
    if (!email || !estNonLu(email)) return;
    void marquerEmailLu(id)
      .then(() => queryClient.invalidateQueries({ queryKey: ['emails'] }))
      .catch(() => { /* Un marquage manqué se rattrape à la prochaine ouverture. */ });
  };

  const syncMutation = useMutation({
    mutationFn: syncIonosMailbox,
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['mailbox-emails'] }),
        queryClient.invalidateQueries({ queryKey: ['ionos-email-connection'] }),
      ]);
      const importedLabel = result.imported > 1 ? 'emails importés' : 'email importé';
      const enriched = result.enriched ?? 0;
      const enrichedLabel = enriched > 0
        ? ` ${enriched} ancien${enriched > 1 ? 's' : ''} email${enriched > 1 ? 's' : ''} remis en forme.`
        : '';
      const historyLabel = result.remaining_history ? ' La suite de l’historique sera récupérée à la prochaine synchronisation.' : '';
      toast.success(`${result.imported} ${importedLabel}.${enrichedLabel}${historyLabel}`);
    },
    onError: (error) => toast.error((error as Error)?.message || 'Synchronisation IONOS impossible'),
  });

  const mailboxStatus = mailboxStatusQuery.data;
  const lastSyncAt = ionosConnectionQuery.data?.last_success_at ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className={mobileDetailOpen ? 'hidden lg:block' : undefined}>
        <PageHeader
          title="Boîte mail"
          description="Réception, envoi, réponses et pièces jointes depuis votre boîte IONOS"
          action={
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-center rounded-full sm:w-auto"
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
                Synchroniser
              </Button>
              <Button
                size="sm"
                className="w-full justify-center rounded-full sm:w-auto"
                onClick={() => setComposeOpen(true)}
              >
                <PenLine className="mr-2 h-4 w-4" />
                Nouveau message
              </Button>
            </div>
          }
        />
      </div>

      <div className={`${mobileDetailOpen ? 'hidden lg:block' : ''} border-b border-border bg-muted/20 gutter-x py-2.5`}>
        {mailboxStatusQuery.isLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Vérification de la connexion IONOS…
          </div>
        ) : mailboxStatusQuery.isError ? (
          <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
            <span className="inline-flex items-center gap-2 text-due">
              <AlertCircle className="h-4 w-4" />
              La connexion IONOS doit être vérifiée par un administrateur.
            </span>
            <Button asChild variant="outline" size="sm" className="w-full rounded-full sm:w-auto">
              <Link to="/settings/integrations/email">Ouvrir les réglages</Link>
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
              <CheckCircle2 className={`h-4 w-4 ${mailboxStatus?.configured ? 'text-done' : 'text-due'}`} />
              {mailboxStatus?.configured ? mailboxStatus.email_address ?? 'Boîte IONOS connectée' : 'Configuration IONOS incomplète'}
            </span>
            <span>
              Dernière synchronisation : {lastSyncAt ? formatFullDate(lastSyncAt) : 'jamais'}
            </span>
          </div>
        )}
      </div>

      <div className={`${mobileDetailOpen ? 'hidden lg:block' : ''} border-b border-border bg-background gutter-x py-3`}>
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex snap-x gap-1 overflow-x-auto pb-1 scrollbar-thin xl:pb-0">
            {mailboxViews.map(({ key, label, Icon }) => {
              const active = view === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setView(key);
                    setMobileDetailOpen(false);
                  }}
                  className={`flex min-h-10 shrink-0 snap-start items-center gap-2 rounded-full px-3 text-sm font-medium transition ${
                    active
                      ? 'bg-secondary text-secondary-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${active ? 'bg-primary/10 text-primary' : 'bg-muted'}`}>
                    {counts[key]}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="relative w-full xl:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher un email, un client…"
              className="h-10 rounded-full pl-9"
            />
          </div>
        </div>
      </div>

      {/* Tant qu'aucun message n'est ouvert, la liste prend toute la largeur :
          c'est la vue par defaut de Gmail, et c'est elle qui permet de
          balayer. Le volet de lecture n'apparait qu'a l'ouverture. */}
      <div className={`grid min-h-0 flex-1 ${selectedEmail ? 'lg:grid-cols-[minmax(340px,440px)_minmax(0,1fr)]' : 'lg:grid-cols-1'}`}>
        <section className={`${mobileDetailOpen ? 'hidden lg:flex' : 'flex'} min-h-0 flex-col bg-card/30 ${selectedEmail ? 'lg:border-r lg:border-border' : ''}`}>
          {emailsQuery.isLoading && (
            <div className="space-y-2 p-4">
              {Array.from({ length: 7 }).map((_, index) => (
                <Skeleton key={index} className="h-24 rounded-xl" />
              ))}
            </div>
          )}

          {emailsQuery.isError && (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
              <AlertCircle className="mb-3 h-8 w-8 text-destructive" />
              <p className="font-medium">Impossible de charger la boîte mail</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {(emailsQuery.error as Error)?.message ?? 'Réessayez dans quelques instants.'}
              </p>
              <Button variant="outline" className="mt-4 rounded-full" onClick={() => emailsQuery.refetch()}>
                Réessayer
              </Button>
            </div>
          )}

          {!emailsQuery.isLoading && !emailsQuery.isError && filteredEmails.length === 0 && (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
                <Mail className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="font-medium">Aucun email dans cette vue</p>
              <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                {search ? 'Essayez une autre recherche.' : 'Les nouveaux messages apparaîtront automatiquement ici.'}
              </p>
              {!search && (
                <Button size="sm" className="mt-4 rounded-full" onClick={() => setComposeOpen(true)}>
                  <PenLine className="mr-2 h-4 w-4" />
                  Écrire un email
                </Button>
              )}
            </div>
          )}

          {!emailsQuery.isLoading && !emailsQuery.isError && filteredEmails.length > 0 && (
            <div className="min-h-0 flex-1 divide-y divide-border overflow-y-auto scrollbar-thin">
              {filteredEmails.map((email) => {
                const active = email.id === selectedId;
                const inbound = email.direction === 'inbound';
                const person = resolvePerson(email, contactMap, leadMap);
                const address = inbound ? email.sender_email : email.recipient_email;
                const classification = classificationMap.get(email.id) ?? OTHER_CLASSIFICATION;
                const supplierPdfCount = classification.category === 'supplier'
                  ? email.email_attachments.filter(isPdfAttachment).length
                  : 0;
                return (
                  <LigneEmail
                    key={email.id}
                    email={email}
                    correspondant={person ?? address ?? 'Adresse inconnue'}
                    badge={<EmailPartyBadge classification={classification} />}
                    aRattacher={!email.contact_id && !email.lead_id}
                    pdfFournisseur={supplierPdfCount}
                    actif={active}
                    onOuvrir={() => openEmail(email.id)}
                  />
                );
              })}
            </div>
          )}
        </section>

        <section className={`${mobileDetailOpen ? 'flex' : selectedEmail ? 'hidden lg:flex' : 'hidden'} min-h-0 flex-col bg-background`}>
          {selectedEmail ? (
            <EmailDetail
              key={selectedEmail.id}
              email={selectedEmail}
              person={resolvePerson(selectedEmail, contactMap, leadMap)}
              classification={classificationMap.get(selectedEmail.id) ?? OTHER_CLASSIFICATION}
              signature={emailSignature}
              leads={allLeads}
              onBack={() => setMobileDetailOpen(false)}
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-muted/40">
                <Inbox className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="font-semibold">Sélectionnez un email</p>
              <p className="mt-1 text-sm text-muted-foreground">Son contenu complet s’affichera ici.</p>
            </div>
          )}
        </section>
      </div>

      <NewEmailDialog
        open={composeOpen}
        onOpenChange={setComposeOpen}
        leads={leadsQuery.data ?? []}
        contacts={contactsQuery.data ?? []}
        mailboxStatus={mailboxStatus}
        signature={emailSignature}
        onSent={(email) => {
          setView('outbound');
          setSelectedId(email.id);
          setMobileDetailOpen(true);
        }}
      />
    </div>
  );
}

function NewEmailDialog({
  open,
  onOpenChange,
  leads,
  contacts,
  mailboxStatus,
  signature,
  onSent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leads: Lead[];
  contacts: Contact[];
  mailboxStatus?: IonosMailboxStatus;
  signature: string;
  onSent: (email: Communication) => void;
}) {
  const queryClient = useQueryClient();
  const [target, setTarget] = useState('');
  const [directEmail, setDirectEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const options = useMemo(() => buildEmailRecipientOptions(leads, contacts), [leads, contacts]);

  const reset = () => {
    setTarget('');
    setDirectEmail('');
    setSubject('');
    setContent('');
    setAttachments([]);
  };

  const sendMutation = useMutation({
    mutationFn: async () => {
      const parsed = parseEmailRecipient(target);
      const preparedAttachments = await prepareEmailAttachments(attachments);
      return sendIonosEmail({
        to: directEmail.trim() || undefined,
        contact_id: parsed?.kind === 'contact' ? parsed.id : undefined,
        lead_id: parsed?.kind === 'lead' ? parsed.id : undefined,
        subject: subject.trim(),
        content: buildSignedEmailContent(content, signature),
        attachments: preparedAttachments,
      });
    },
    onSuccess: async (email) => {
      await queryClient.invalidateQueries({ queryKey: ['mailbox-emails'] });
      toast.success('Email envoyé depuis votre boîte IONOS');
      onSent(email);
      reset();
      onOpenChange(false);
    },
    onError: (error) => toast.error((error as Error)?.message || "Impossible d'envoyer l'email"),
  });

  const submit = () => {
    if (!target && !directEmail.trim()) {
      toast.error('Sélectionnez un client ou saisissez une adresse email');
      return;
    }
    if (!subject.trim()) {
      toast.error("L'objet est requis");
      return;
    }
    if (!content.trim()) {
      toast.error('Écrivez votre message avant de l’envoyer');
      return;
    }
    sendMutation.mutate();
  };

  const close = () => {
    if (sendMutation.isPending) return;
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen && !sendMutation.isPending) reset();
      }}
    >
      <DialogContent className="h-[100dvh] max-h-[100dvh] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden rounded-none p-0 sm:h-auto sm:max-h-[90dvh] sm:max-w-2xl sm:rounded-2xl">
        <DialogHeader className="border-b border-border px-4 py-4 sm:px-6">
          <DialogTitle>Nouveau message</DialogTitle>
          <DialogDescription>
            {mailboxStatus?.configured
              ? `Envoi réel depuis ${mailboxStatus.email_address ?? 'votre boîte IONOS'}.`
              : 'La boîte IONOS doit être configurée par un administrateur avant le premier envoi.'}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 space-y-4 overflow-y-auto px-4 py-4 scrollbar-thin sm:px-6">
          <div className="space-y-1.5">
            <Label className="text-sm">Client ou lead</Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger className="rounded-lg">
                <SelectValue placeholder="Rechercher un destinataire connu" />
              </SelectTrigger>
              <SelectContent>
                {options.length === 0 && (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    Aucun contact avec une adresse email
                  </div>
                )}
                {options.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label} · {option.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mail-direct-recipient" className="text-sm">
              Adresse directe <span className="font-normal text-muted-foreground">(si le client n’est pas dans la liste)</span>
            </Label>
            <Input
              id="mail-direct-recipient"
              type="email"
              autoComplete="email"
              placeholder="destinataire@exemple.fr"
              value={directEmail}
              onChange={(event) => setDirectEmail(event.target.value)}
              className="rounded-lg"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mail-subject" className="text-sm">Objet</Label>
            <Input
              id="mail-subject"
              placeholder="Objet de l’email"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              className="rounded-lg"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mail-content" className="text-sm">Message</Label>
            <Textarea
              id="mail-content"
              placeholder="Écrivez votre message…"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              rows={8}
              className="min-h-40 resize-y rounded-lg"
            />
            {signature.trim() && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">
                  Signature ajoutée à l’envoi
                </p>
                <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
                  {signature}
                </p>
              </div>
            )}
          </div>

          <EmailAttachmentPicker
            files={attachments}
            onChange={setAttachments}
            disabled={sendMutation.isPending}
          />
        </div>

        <DialogFooter className="border-t border-border bg-background px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] sm:px-6 sm:pb-3 [&>button]:w-full sm:[&>button]:w-auto">
          <Button
            type="button"
            variant="ghost"
            className="rounded-full"
            disabled={sendMutation.isPending}
            onClick={close}
          >
            Annuler
          </Button>
          <Button
            type="button"
            className="rounded-full"
            disabled={sendMutation.isPending || !mailboxStatus?.configured}
            onClick={submit}
          >
            {sendMutation.isPending
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              : <Send className="mr-2 h-4 w-4" />}
            Envoyer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmailDetail({
  email,
  person,
  classification,
  signature,
  leads,
  onBack,
}: {
  email: Communication;
  person: string | null;
  classification: EmailPartyClassification;
  signature: string;
  leads: Lead[];
  onBack: () => void;
}) {
  const inbound = email.direction === 'inbound';
  const queryClient = useQueryClient();
  const [replyContent, setReplyContent] = useState('');
  const [replyAttachments, setReplyAttachments] = useState<File[]>([]);
  const [leadLinkOpen, setLeadLinkOpen] = useState(false);
  const [attachmentViewer, setAttachmentViewer] = useState<AttachmentViewerState | null>(null);
  const attachmentRequestId = useRef(0);
  const attachmentUrl = useRef<string | null>(null);
  const recipient = inbound ? email.sender_email?.trim() || null : null;
  const emailHtmlQuery = useQuery({
    queryKey: ['email-html', email.id],
    queryFn: () => fetchEmailHtml(email.id),
    staleTime: 10 * 60 * 1000,
  });
  const originalSubject = email.subject?.trim() || '(Sans objet)';
  const replySubject = /^re\s*:/i.test(originalSubject) ? originalSubject : `Re: ${originalSubject}`;
  const relatedPath = email.lead_id
    ? `/interventions/${email.lead_id}`
    : email.contact_id ? `/clients/${email.contact_id}` : null;
  const supplierPdfs = classification.category === 'supplier'
    ? email.email_attachments.filter(isPdfAttachment)
    : [];
  const otherAttachments = supplierPdfs.length > 0
    ? email.email_attachments.filter((attachment) => !isPdfAttachment(attachment))
    : email.email_attachments;

  const handleLinked = (updatedEmail: Communication) => {
    queryClient.setQueryData<Communication[]>(['mailbox-emails'], (current) => (
      current?.map((item) => item.id === updatedEmail.id ? updatedEmail : item) ?? current
    ));
    void queryClient.invalidateQueries({ queryKey: ['mailbox-emails'] });
    void queryClient.invalidateQueries({ queryKey: ['communications'] });
  };

  const replyMutation = useMutation({
    mutationFn: async () => {
      if (!recipient) throw new Error("L'adresse de l'expéditeur est introuvable");
      const content = replyContent.trim();
      if (!content) throw new Error('Écrivez votre réponse avant de l’envoyer');
      const attachments = await prepareEmailAttachments(replyAttachments);
      return sendIonosEmail({
        to: recipient,
        contact_id: email.contact_id ?? undefined,
        lead_id: email.lead_id ?? undefined,
        subject: replySubject,
        content: buildSignedEmailContent(content, signature),
        in_reply_to: email.email_message_id ?? undefined,
        attachments,
      });
    },
    onSuccess: () => {
      setReplyContent('');
      setReplyAttachments([]);
      void queryClient.invalidateQueries({ queryKey: ['mailbox-emails'] });
      void queryClient.invalidateQueries({ queryKey: ['communications'] });
      toast.success('Réponse envoyée depuis votre boîte IONOS');
    },
    onError: (error) => toast.error((error as Error)?.message || "Impossible d'envoyer la réponse"),
  });

  const clearAttachmentUrl = () => {
    if (!attachmentUrl.current) return;
    URL.revokeObjectURL(attachmentUrl.current);
    attachmentUrl.current = null;
  };

  const closeAttachmentViewer = () => {
    attachmentRequestId.current += 1;
    clearAttachmentUrl();
    setAttachmentViewer(null);
  };

  useEffect(() => () => {
    attachmentRequestId.current += 1;
    clearAttachmentUrl();
  }, []);

  const openAttachment = async (attachment: EmailAttachment) => {
    const requestId = attachmentRequestId.current + 1;
    attachmentRequestId.current = requestId;
    clearAttachmentUrl();
    setAttachmentViewer({
      attachment,
      contentType: attachment.content_type?.toLowerCase() || '',
      error: null,
      status: 'loading',
      url: null,
    });
    try {
      const blob = await fetchEmailAttachment({
        communicationId: email.id,
        attachmentId: attachment.id,
      });
      const objectUrl = URL.createObjectURL(blob);
      if (attachmentRequestId.current !== requestId) {
        URL.revokeObjectURL(objectUrl);
        return;
      }
      attachmentUrl.current = objectUrl;
      const contentType = (blob.type || attachment.content_type || '').toLowerCase();
      setAttachmentViewer({ attachment, contentType, error: null, status: 'ready', url: objectUrl });
    } catch (error) {
      if (attachmentRequestId.current !== requestId) return;
      const message = (error as Error)?.message || "Impossible d'ouvrir la pièce jointe";
      setAttachmentViewer({
        attachment,
        contentType: attachment.content_type?.toLowerCase() || '',
        error: message,
        status: 'error',
        url: null,
      });
      toast.error(message);
    }
  };

  const downloadAttachment = () => {
    if (!attachmentViewer?.url) return;
    const link = document.createElement('a');
    link.href = attachmentViewer.url;
    link.download = attachmentViewer.attachment.filename || 'piece-jointe';
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const attachmentIsPdf = attachmentViewer?.contentType === 'application/pdf';
  const attachmentIsImage = Boolean(
    attachmentViewer
    && /^image\/(avif|bmp|gif|heic|jpeg|jpg|png|webp)$/.test(attachmentViewer.contentType),
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border px-4 py-4 sm:px-6">
        <div className="mb-3 flex items-center justify-between gap-3 lg:hidden">
          <Button variant="ghost" size="sm" className="-ml-2 rounded-full" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Emails
          </Button>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={`rounded-full text-[10px] ${statusClass(email)}`}>
                {statusLabel(email)}
              </Badge>
              <EmailPartyBadge classification={classification} />
              {email.provider && (
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{email.provider}</span>
              )}
            </div>
            <h2 className="mt-3 break-words text-xl font-semibold leading-tight text-foreground sm:text-2xl">
              {email.subject || '(Sans objet)'}
            </h2>
          </div>

          <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full justify-center rounded-full sm:w-auto"
              onClick={() => setLeadLinkOpen(true)}
            >
              <Link2 className="mr-2 h-4 w-4" />
              {email.lead_id ? 'Changer le lead' : 'Rattacher à un lead'}
            </Button>
            {relatedPath && (
              <Button asChild variant="outline" size="sm" className="w-full justify-center rounded-full sm:w-auto">
                <Link to={relatedPath}>
                  <UserRound className="mr-2 h-4 w-4" />
                  Voir la fiche
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 scrollbar-thin sm:p-6">
        <div className="mx-auto max-w-4xl">
          <EnteteMessage
            email={email}
            nom={inbound ? person : null}
            correspondant={classification.category !== 'other'
              ? `${partyLabel(classification)}${classification.organization ? ` · ${classification.organization}` : ' · à confirmer'}`
              : null}
            aRattacher={!email.contact_id && !email.lead_id}
          />

          {supplierPdfs.length > 0 && (
            <div className="mt-4 rounded-xl border border-due/25 bg-due-soft p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-background text-due shadow-sm">
                  <Package className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-foreground">Documents fournisseur</h3>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    {supplierPdfs.length} PDF {supplierPdfs.length > 1 ? 'détectés et sortis' : 'détecté et sorti'} automatiquement de cet email.
                  </p>
                </div>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {supplierPdfs.map((attachment, index) => (
                  <button
                    key={`${attachment.id}-supplier-${index}`}
                    type="button"
                    className="group flex min-w-0 items-center gap-3 rounded-lg border border-due/20 bg-background p-3 text-left transition hover:border-due/40 hover:shadow-sm disabled:cursor-wait disabled:opacity-70"
                    onClick={() => void openAttachment(attachment)}
                    disabled={attachmentViewer?.status === 'loading' && attachmentViewer.attachment.id === attachment.id}
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-due-soft text-due">
                      {attachmentViewer?.status === 'loading' && attachmentViewer.attachment.id === attachment.id
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <FileText className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{attachment.filename}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        PDF fournisseur{attachment.size ? ` · ${Math.ceil(attachment.size / 1024)} Ko` : ''}
                      </p>
                    </div>
                    <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:text-due" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {emailHtmlQuery.isLoading ? (
            <Skeleton className="mt-4 h-[420px] rounded-xl" />
          ) : (
            <>
              {emailHtmlQuery.isError && (
                <div className="mt-4 flex items-center gap-2 rounded-xl border border-due/25 bg-due-soft px-4 py-3 text-xs text-due">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  La mise en forme n’a pas pu être chargée. La version texte reste disponible.
                </div>
              )}
              <EmailHtmlViewer
                html={emailHtmlQuery.data ?? email.email_html}
                text={email.content}
                subject={email.subject}
              />
            </>
          )}

          {otherAttachments.length > 0 && (
            <div className="mt-4 rounded-xl border border-border bg-card p-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Paperclip className="h-4 w-4" />
                Pièces jointes ({otherAttachments.length})
              </h3>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {otherAttachments.map((attachment, index) => {
                  const details = (
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{attachment.filename}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {attachment.content_type || 'Type inconnu'}
                        {attachment.size ? ` · ${Math.ceil(attachment.size / 1024)} Ko` : ''}
                      </p>
                    </div>
                  );

                  if (!inbound) {
                    return (
                      <div
                        key={`${attachment.id}-${index}`}
                        className="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-muted/30 p-3"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background text-primary">
                          <Paperclip className="h-4 w-4" />
                        </div>
                        {details}
                      </div>
                    );
                  }

                  return (
                    <button
                      key={`${attachment.id}-${index}`}
                      type="button"
                      className="group flex min-w-0 items-center gap-3 rounded-lg border border-border bg-muted/30 p-3 text-left transition hover:border-primary/30 hover:bg-primary/5 disabled:cursor-wait disabled:opacity-70"
                      onClick={() => void openAttachment(attachment)}
                      disabled={attachmentViewer?.status === 'loading' && attachmentViewer.attachment.id === attachment.id}
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background text-muted-foreground group-hover:text-primary">
                        {attachmentViewer?.status === 'loading' && attachmentViewer.attachment.id === attachment.id
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <ExternalLink className="h-4 w-4" />}
                      </div>
                      {details}
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {inbound
                  ? 'Cliquez sur un fichier pour l’ouvrir dans le CRM, puis téléchargez-le si nécessaire.'
                  : 'Ces fichiers ont bien été joints à l’envoi. Leur contenu n’est pas conservé dans le CRM.'}
              </p>
            </div>
          )}

          {inbound && (
            <div className="mt-4 rounded-xl border border-border bg-card p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Reply className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-foreground">Répondre à ce message</h3>
                  <p className="mt-0.5 break-all text-xs text-muted-foreground">
                    À : {recipient ?? 'adresse expéditeur indisponible'} · Objet : {replySubject}
                  </p>
                </div>
              </div>

              <Textarea
                value={replyContent}
                onChange={(event) => setReplyContent(event.target.value)}
                placeholder="Écrivez votre réponse…"
                rows={6}
                className="mt-4 resize-y rounded-lg"
                disabled={!recipient || replyMutation.isPending}
              />
              {signature.trim() && (
                <div className="mt-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">
                    Signature ajoutée à l’envoi
                  </p>
                  <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
                    {signature}
                  </p>
                </div>
              )}
              <div className="mt-3">
                <EmailAttachmentPicker
                  files={replyAttachments}
                  onChange={setReplyAttachments}
                  disabled={!recipient || replyMutation.isPending}
                />
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">
                  {email.email_message_id
                    ? 'La réponse restera dans le même fil de discussion.'
                    : 'Le message sera envoyé sans rattachement technique au fil d’origine.'}
                </p>
                <Button
                  type="button"
                  className="w-full rounded-full sm:w-auto"
                  disabled={!recipient || !replyContent.trim() || replyMutation.isPending}
                  onClick={() => replyMutation.mutate()}
                >
                  {replyMutation.isPending
                    ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    : <Send className="mr-2 h-4 w-4" />}
                  Envoyer la réponse
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <Dialog
        open={attachmentViewer !== null}
        onOpenChange={(open) => {
          if (!open) closeAttachmentViewer();
        }}
      >
        <DialogContent className="h-[100dvh] max-h-[100dvh] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden rounded-none p-0 sm:h-[90dvh] sm:max-h-[90dvh] sm:max-w-5xl sm:rounded-2xl">
          <DialogHeader className="border-b border-border px-4 py-4 sm:px-6">
            <DialogTitle className="truncate pr-2">
              {attachmentViewer?.attachment.filename || 'Pièce jointe'}
            </DialogTitle>
            <DialogDescription>
              Aperçu sécurisé de la pièce jointe reçue par email
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-muted/30 p-3 sm:p-5">
            {attachmentViewer?.status === 'loading' && (
              <div className="flex flex-col items-center text-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="mt-3 text-sm font-medium">Chargement de la pièce jointe…</p>
              </div>
            )}

            {attachmentViewer?.status === 'error' && (
              <div className="max-w-md rounded-xl border border-destructive/20 bg-background p-6 text-center">
                <AlertCircle className="mx-auto h-8 w-8 text-destructive" />
                <p className="mt-3 font-medium">Impossible d’ouvrir ce fichier</p>
                <p className="mt-1 text-sm text-muted-foreground">{attachmentViewer.error}</p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-4 rounded-full"
                  onClick={() => void openAttachment(attachmentViewer.attachment)}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Réessayer
                </Button>
              </div>
            )}

            {attachmentViewer?.status === 'ready' && attachmentViewer.url && attachmentIsPdf && (
              <iframe
                src={attachmentViewer.url}
                title={`Aperçu de ${attachmentViewer.attachment.filename}`}
                className="h-full w-full rounded-lg border border-border bg-background"
              />
            )}

            {attachmentViewer?.status === 'ready' && attachmentViewer.url && attachmentIsImage && (
              <img
                src={attachmentViewer.url}
                alt={attachmentViewer.attachment.filename}
                className="max-h-full max-w-full rounded-lg object-contain shadow-sm"
              />
            )}

            {attachmentViewer?.status === 'ready' && attachmentViewer.url && !attachmentIsPdf && !attachmentIsImage && (
              <div className="max-w-md rounded-xl border border-border bg-background p-6 text-center">
                <FileText className="mx-auto h-10 w-10 text-muted-foreground" />
                <p className="mt-3 font-medium">Aperçu non disponible pour ce format</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Téléchargez le fichier pour l’ouvrir avec l’application adaptée.
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="border-t border-border bg-background px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] sm:px-6 sm:pb-3 [&>button]:w-full sm:[&>button]:w-auto">
            <Button type="button" variant="outline" className="rounded-full" onClick={closeAttachmentViewer}>
              Fermer
            </Button>
            <Button
              type="button"
              className="rounded-full"
              disabled={attachmentViewer?.status !== 'ready' || !attachmentViewer.url}
              onClick={downloadAttachment}
            >
              <Download className="mr-2 h-4 w-4" />
              Télécharger
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EmailLeadLinkDialog
        email={email}
        leads={leads}
        open={leadLinkOpen}
        onOpenChange={setLeadLinkOpen}
        onLinked={handleLinked}
      />
    </div>
  );
}
