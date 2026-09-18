import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  Inbox,
  Link2,
  Mail,
  Paperclip,
  PenLine,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchContacts } from '@/services/contacts-service';
import { fetchInsurers } from '@/services/insurers-service';
import { fetchLeads } from '@/services/leads-service';
import type { Communication, Contact, Lead } from '@/types';
import {
  classifyEmailParty,
  type EmailPartyClassification,
} from './email-classification';
import { fetchMailboxEmails } from './email-service';

type MailboxView = 'inbound' | 'insurers' | 'experts' | 'outbound' | 'all' | 'unlinked';

const mailboxViews: Array<{
  key: MailboxView;
  label: string;
  Icon: typeof Mail;
}> = [
  { key: 'inbound', label: 'Reçus', Icon: Inbox },
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

function formatMailboxDate(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }
  if (date.getFullYear() === today.getFullYear()) {
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  }
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
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
  if (view === 'insurers') return email.direction === 'inbound' && classification.category === 'insurer';
  if (view === 'experts') return email.direction === 'inbound' && classification.category === 'expert';
  if (view === 'outbound') return email.direction === 'outbound';
  if (view === 'unlinked') return !email.contact_id && !email.lead_id;
  return true;
}

function EmailPartyBadge({ classification }: { classification: EmailPartyClassification }) {
  if (classification.category === 'other') return null;
  const insurer = classification.category === 'insurer';
  const label = insurer ? 'Assureur' : 'Expert';
  const title = classification.organization ? `${label} · ${classification.organization}` : `${label} probable`;

  return (
    <Badge
      variant="outline"
      title={classification.confidence === 'confirmed' ? 'Correspondant reconnu' : 'Détection probable à vérifier'}
      className={`max-w-full gap-1 rounded-full text-[10px] ${
        insurer
          ? 'border-primary/25 bg-primary/5 text-primary'
          : 'border-upcoming/25 bg-upcoming-soft text-upcoming'
      }`}
    >
      {insurer ? <ShieldCheck className="h-3 w-3 shrink-0" /> : <Search className="h-3 w-3 shrink-0" />}
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
  const [view, setView] = useState<MailboxView>('inbound');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  const emailsQuery = useQuery({
    queryKey: ['mailbox-emails'],
    queryFn: fetchMailboxEmails,
  });
  const contactsQuery = useQuery({ queryKey: ['contacts-all'], queryFn: () => fetchContacts({}) });
  const leadsQuery = useQuery({ queryKey: ['leads-all'], queryFn: () => fetchLeads({}) });
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

  const leadMap = useMemo(() => {
    const map = new Map<string, Lead>();
    (leadsQuery.data ?? []).forEach((lead) => map.set(lead.id, lead));
    return map;
  }, [leadsQuery.data]);

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

  const openEmail = (id: string) => {
    setSelectedId(id);
    setMobileDetailOpen(true);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader
        title="Boîte mail"
        description="Tous les emails reçus et envoyés depuis le CRM"
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => emailsQuery.refetch()}
              disabled={emailsQuery.isFetching}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${emailsQuery.isFetching ? 'animate-spin' : ''}`} />
              Actualiser
            </Button>
            <Button asChild size="sm" className="rounded-full">
              <Link to="/communications">
                <PenLine className="mr-2 h-4 w-4" />
                Écrire
              </Link>
            </Button>
          </div>
        }
      />

      <div className="border-b border-border bg-background gutter-x py-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-thin xl:pb-0">
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
                  className={`flex min-h-10 shrink-0 items-center gap-2 rounded-full px-3 text-sm font-medium transition ${
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

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
        <section className={`${mobileDetailOpen ? 'hidden lg:flex' : 'flex'} min-h-0 flex-col border-r border-border bg-card/30`}>
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
            </div>
          )}

          {!emailsQuery.isLoading && !emailsQuery.isError && filteredEmails.length > 0 && (
            <div className="min-h-0 flex-1 overflow-y-auto p-2 scrollbar-thin">
              {filteredEmails.map((email) => {
                const active = email.id === selectedId;
                const inbound = email.direction === 'inbound';
                const person = resolvePerson(email, contactMap, leadMap);
                const address = inbound ? email.sender_email : email.recipient_email;
                const classification = classificationMap.get(email.id) ?? OTHER_CLASSIFICATION;
                return (
                  <button
                    key={email.id}
                    type="button"
                    onClick={() => openEmail(email.id)}
                    className={`mb-1 w-full rounded-xl border p-3 text-left transition ${
                      active
                        ? 'border-primary/30 bg-primary/5 shadow-sm'
                        : 'border-transparent hover:border-border hover:bg-background'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${inbound ? 'bg-done-soft text-done' : 'bg-upcoming-soft text-upcoming'}`}>
                        {inbound ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {person ?? address ?? 'Adresse inconnue'}
                          </p>
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            {formatMailboxDate(email.created_at)}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-sm font-medium text-foreground/90">
                          {email.subject || '(Sans objet)'}
                        </p>
                        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                          {email.content || 'Aucun contenu texte disponible.'}
                        </p>
                        <div className="mt-2 flex items-center gap-2">
                          <EmailPartyBadge classification={classification} />
                          {!email.contact_id && !email.lead_id && (
                            <span className="rounded-full bg-due-soft px-2 py-0.5 text-[10px] font-medium text-due">
                              À rattacher
                            </span>
                          )}
                          {email.email_attachments.length > 0 && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                              <Paperclip className="h-3 w-3" />
                              {email.email_attachments.length}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className={`${mobileDetailOpen ? 'flex' : 'hidden lg:flex'} min-h-0 flex-col bg-background`}>
          {selectedEmail ? (
            <EmailDetail
              email={selectedEmail}
              person={resolvePerson(selectedEmail, contactMap, leadMap)}
              classification={classificationMap.get(selectedEmail.id) ?? OTHER_CLASSIFICATION}
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
    </div>
  );
}

function EmailDetail({
  email,
  person,
  classification,
  onBack,
}: {
  email: Communication;
  person: string | null;
  classification: EmailPartyClassification;
  onBack: () => void;
}) {
  const inbound = email.direction === 'inbound';
  const relatedPath = email.lead_id
    ? `/interventions/${email.lead_id}`
    : email.contact_id ? `/clients/${email.contact_id}` : null;

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
            <h2 className="mt-3 text-xl font-semibold leading-tight text-foreground sm:text-2xl">
              {email.subject || '(Sans objet)'}
            </h2>
          </div>

          {relatedPath && (
            <Button asChild variant="outline" size="sm" className="shrink-0 rounded-full">
              <Link to={relatedPath}>
                <UserRound className="mr-2 h-4 w-4" />
                Voir la fiche
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 scrollbar-thin sm:p-6">
        <div className="mx-auto max-w-4xl">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="grid gap-3 text-sm sm:grid-cols-[90px_minmax(0,1fr)]">
              <span className="text-muted-foreground">De</span>
              <div className="min-w-0">
                {inbound && person && <p className="font-medium text-foreground">{person}</p>}
                <p className="break-all text-muted-foreground">{email.sender_email ?? 'Adresse inconnue'}</p>
              </div>

              <span className="text-muted-foreground">À</span>
              <p className="break-all text-muted-foreground">{email.recipient_email ?? 'Adresse inconnue'}</p>

              <span className="text-muted-foreground">Date</span>
              <p className="capitalize text-foreground">{formatFullDate(email.created_at)}</p>

              {classification.category !== 'other' && (
                <>
                  <span className="text-muted-foreground">Correspondant</span>
                  <p className="font-medium text-foreground">
                    {classification.category === 'insurer' ? 'Assureur' : 'Cabinet d’expertise'}
                    {classification.organization ? ` · ${classification.organization}` : ' · à confirmer'}
                  </p>
                </>
              )}

              {!email.contact_id && !email.lead_id && (
                <>
                  <span className="text-muted-foreground">Rattachement</span>
                  <p className="font-medium text-due">Aucun client ou lead correspondant</p>
                </>
              )}
            </div>
          </div>

          <div className="mt-4 min-h-48 rounded-xl border border-border bg-card p-5 sm:p-6">
            <div className="whitespace-pre-wrap break-words text-sm leading-7 text-foreground">
              {email.content || 'Aucun contenu texte n’a été fourni avec cet email.'}
            </div>
          </div>

          {email.email_attachments.length > 0 && (
            <div className="mt-4 rounded-xl border border-border bg-card p-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Paperclip className="h-4 w-4" />
                Pièces jointes ({email.email_attachments.length})
              </h3>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {email.email_attachments.map((attachment, index) => (
                  <div key={`${attachment.id}-${index}`} className="rounded-lg border border-border bg-muted/30 p-3">
                    <p className="truncate text-sm font-medium">{attachment.filename}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {attachment.content_type || 'Type inconnu'}
                      {attachment.size ? ` · ${Math.ceil(attachment.size / 1024)} Ko` : ''}
                    </p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Les pièces jointes sont identifiées dans le CRM. Leur téléchargement sécurisé sera ajouté dans une prochaine étape.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
