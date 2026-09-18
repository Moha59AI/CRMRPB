import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Phone, PhoneMissed, MessageSquare, Mail, StickyNote,
  ArrowUpRight, ArrowDownLeft, Plus, Clock, AlertCircle,
  Voicemail, Settings, Loader2, CheckCircle2, Paperclip,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import type {
  Communication, SmsTemplate, Lead, Contact,
  CommunicationType, CommunicationStatus,
} from '@/types';
import { createCommunication, createSmsTemplate, fetchCommunications, fetchSmsTemplates } from '@/services/activity-service';
import { fetchContacts } from '@/services/contacts-service';
import { fetchLeads } from '@/services/leads-service';
import {
  buildSignedEmailContent, getIonosConnection, getIonosMailboxStatus,
  parseIonosSettings, sendIonosEmail, type IonosMailboxStatus,
} from '@/features/integrations/email/email-service';

// ============ LABELS ============

const commTypeLabels: Record<string, string> = {
  sms_outbound: 'SMS envoyé',
  sms_inbound: 'SMS reçu',
  call_outbound: 'Appel sortant',
  call_inbound: 'Appel entrant',
  call_missed: 'Appel manqué',
  voicemail: 'Messagerie vocale',
  email_outbound: 'Email envoyé',
  email_inbound: 'Email reçu',
  note: 'Note',
};

const commStatusLabels: Record<string, string> = {
  pending: 'En attente',
  sent: 'Envoyé',
  delivered: 'Livré',
  failed: 'Échec',
  received: 'Reçu',
  answered: 'Répondu',
  missed: 'Manqué',
  cancelled: 'Annulé',
};

type FilterKey = 'all' | 'sms' | 'calls' | 'emails' | 'notes' | 'missed';

const filterItems: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Toutes' },
  { key: 'sms', label: 'SMS' },
  { key: 'calls', label: 'Appels' },
  { key: 'emails', label: 'Emails' },
  { key: 'notes', label: 'Notes' },
  { key: 'missed', label: 'Appels manqués' },
];

function matchesFilter(comm: Communication, filter: FilterKey): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'sms':
      return comm.type === 'sms_outbound' || comm.type === 'sms_inbound';
    case 'calls':
      return comm.type.startsWith('call') || comm.type === 'voicemail';
    case 'emails':
      return comm.type.startsWith('email');
    case 'notes':
      return comm.type === 'note';
    case 'missed':
      return comm.type === 'call_missed';
    default:
      return true;
  }
}

// ============ ICON / BADGE HELPERS ============

function typeIcon(type: CommunicationType): { Icon: typeof Phone; className: string } {
  switch (type) {
    case 'sms_outbound':
    case 'sms_inbound':
      return { Icon: MessageSquare, className: 'bg-upcoming-soft text-upcoming' };
    case 'call_outbound':
    case 'call_inbound':
      return { Icon: Phone, className: 'bg-done-soft text-done' };
    case 'call_missed':
      return { Icon: PhoneMissed, className: 'bg-urgent-soft text-urgent' };
    case 'voicemail':
      return { Icon: Voicemail, className: 'bg-due-soft text-due' };
    case 'email_outbound':
    case 'email_inbound':
      return { Icon: Mail, className: 'bg-upcoming-soft text-upcoming' };
    case 'note':
      return { Icon: StickyNote, className: 'bg-due-soft text-due' };
    default:
      return { Icon: MessageSquare, className: 'bg-muted text-muted-foreground' };
  }
}

function statusBadgeClass(status: CommunicationStatus): string {
  const green = ['delivered', 'answered', 'received'];
  const red = ['failed', 'missed'];
  const amber = ['pending'];
  if (green.includes(status)) return 'bg-done-soft text-done border-done/25';
  if (red.includes(status)) return 'bg-urgent-soft text-urgent border-urgent/25';
  if (amber.includes(status)) return 'bg-due-soft text-due border-due/25';
  return 'bg-muted/50 text-foreground border-border';
}

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

function formatRelative(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "À l'instant";
  if (diffMin < 60) return `Il y a ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `Il y a ${diffH} h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `Il y a ${diffD} j`;
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatFull(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ============ MAIN PAGE ============

export function CommunicationsPage() {
  const [filter, setFilter] = useState<FilterKey>('all');
  const [callOpen, setCallOpen] = useState(false);
  const [smsOpen, setSmsOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);

  const { data: communications, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['communications', 'all'],
    queryFn: () => fetchCommunications({}),
  });

  const { data: leads } = useQuery({ queryKey: ['leads-all'], queryFn: () => fetchLeads({}) });
  const { data: contacts } = useQuery({ queryKey: ['contacts-all'], queryFn: () => fetchContacts({}) });
  const { data: templates } = useQuery({ queryKey: ['sms-templates'], queryFn: fetchSmsTemplates });
  const { data: mailboxStatus } = useQuery({
    queryKey: ['ionos-email-status'],
    queryFn: getIonosMailboxStatus,
    retry: false,
  });
  const { data: ionosConnection } = useQuery({
    queryKey: ['ionos-email-connection'],
    queryFn: getIonosConnection,
  });
  const emailSignature = parseIonosSettings(ionosConnection ?? null).signature;

  const leadMap = useMemo(() => {
    const m = new Map<string, Lead>();
    (leads ?? []).forEach((l) => m.set(l.id, l));
    return m;
  }, [leads]);

  const contactMap = useMemo(() => {
    const m = new Map<string, Contact>();
    (contacts ?? []).forEach((c) => m.set(c.id, c));
    return m;
  }, [contacts]);

  const resolveName = (comm: Communication): string | null => {
    if (comm.contact_id) {
      const c = contactMap.get(comm.contact_id);
      if (c) return [c.first_name, c.last_name].filter(Boolean).join(' ') || c.phone || null;
    }
    if (comm.lead_id) {
      const l = leadMap.get(comm.lead_id);
      if (l) return [l.first_name, l.last_name].filter(Boolean).join(' ') || l.phone || null;
    }
    return null;
  };

  const filtered = useMemo(() => {
    return (communications ?? []).filter((c) => matchesFilter(c, filter));
  }, [communications, filter]);

  const counts = useMemo(() => {
    const all = communications ?? [];
    return {
      all: all.length,
      sms: all.filter((c) => matchesFilter(c, 'sms')).length,
      calls: all.filter((c) => matchesFilter(c, 'calls')).length,
      emails: all.filter((c) => matchesFilter(c, 'emails')).length,
      notes: all.filter((c) => matchesFilter(c, 'notes')).length,
      missed: all.filter((c) => matchesFilter(c, 'missed')).length,
    } as Record<FilterKey, number>;
  }, [communications]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageHeader
        title="Communications"
        description="SMS, appels et emails"
        action={
          <div className="flex items-center gap-2">
            {mailboxStatus?.configured ? (
              <Badge variant="outline" className="rounded-full border-done/25 bg-done-soft text-done text-[10px] font-medium">
                <CheckCircle2 className="mr-1 h-3 w-3" />
                Email IONOS actif
              </Badge>
            ) : (
              <Badge variant="outline" className="rounded-full border-due/25 bg-due-soft text-due text-[10px] font-medium">
                <AlertCircle className="mr-1 h-3 w-3" />
                Email à configurer
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => setTemplatesOpen(true)}
            >
              <Settings className="mr-2 h-4 w-4" />
              Modèles SMS
            </Button>
          </div>
        }
      />

      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-2 gutter-x border-b border-border py-3">
        <Button size="sm" className="rounded-full" onClick={() => setCallOpen(true)}>
          <Phone className="mr-2 h-4 w-4" />
          Appeler
        </Button>
        <Button size="sm" className="rounded-full" onClick={() => setSmsOpen(true)}>
          <MessageSquare className="mr-2 h-4 w-4" />
          Envoyer un SMS
        </Button>
        <Button size="sm" className="rounded-full" onClick={() => setEmailOpen(true)}>
          <Mail className="mr-2 h-4 w-4" />
          Envoyer un email
        </Button>
        <Button size="sm" className="rounded-full" onClick={() => setNoteOpen(true)}>
          <StickyNote className="mr-2 h-4 w-4" />
          Ajouter une note
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar filters */}
        <aside className="w-56 shrink-0 border-r border-border bg-card/50 overflow-y-auto scrollbar-thin">
          <nav className="flex flex-col gap-1 p-3">
            <p className="px-3 pb-2 pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Filtrer
            </p>
            {filterItems.map((item) => {
              const active = filter === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => setFilter(item.key)}
                  className={
                    'flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition ' +
                    (active
                      ? 'bg-secondary text-secondary-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground')
                  }
                >
                  <span>{item.label}</span>
                  <span
                    className={
                      'rounded-full px-2 py-0.5 text-[10px] font-semibold ' +
                      (active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')
                    }
                  >
                    {counts[item.key] ?? 0}
                  </span>
                </button>
              );
            })}
          </nav>

          <div className="mx-3 mb-3 rounded-lg border border-due/25 bg-due-soft/60 p-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-due">
              <AlertCircle className="h-3.5 w-3.5" />
              SMS et appels en démonstration
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-due">
              Les SMS et appels sont seulement enregistrés. Les emails sont réellement
              envoyés dès que la boîte IONOS est configurée dans les réglages.
            </p>
          </div>
        </aside>

        {/* Main list */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {isLoading && (
            <div className="p-6">
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full rounded-lg" />
                ))}
              </div>
            </div>
          )}

          {isError && (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <AlertCircle className="mb-3 h-8 w-8 text-destructive" />
              <p className="text-sm text-muted-foreground">
                {(error as Error)?.message || 'Erreur de chargement'}
              </p>
              <Button variant="outline" className="mt-4 rounded-full" onClick={() => refetch()}>
                Réessayer
              </Button>
            </div>
          )}

          {!isLoading && !isError && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-muted/50">
                <MessageSquare className="h-7 w-7 text-muted-foreground" strokeWidth={1.5} />
              </div>
              <h3 className="text-sm font-semibold text-foreground">
                {filter === 'all'
                  ? 'Aucune communication pour le moment'
                  : 'Aucune communication dans cette catégorie'}
              </h3>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                {filter === 'all'
                  ? "Passez votre premier appel, envoyez un SMS ou un email pour démarrer l'historique."
                  : 'Changez de filtre ou créez une nouvelle communication avec les actions ci-dessus.'}
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Button size="sm" className="rounded-full" onClick={() => setCallOpen(true)}>
                  <Phone className="mr-2 h-4 w-4" />
                  Appeler
                </Button>
                <Button size="sm" className="rounded-full" onClick={() => setSmsOpen(true)}>
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Envoyer un SMS
                </Button>
              </div>
            </div>
          )}

          {!isLoading && !isError && filtered.length > 0 && (
            <div className="space-y-2 p-6">
              {filtered.map((comm) => (
                <CommunicationRow
                  key={comm.id}
                  comm={comm}
                  name={resolveName(comm)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <CallDialog open={callOpen} onOpenChange={setCallOpen} leads={leads ?? []} contacts={contacts ?? []} />
      <SmsDialog
        open={smsOpen}
        onOpenChange={setSmsOpen}
        leads={leads ?? []}
        contacts={contacts ?? []}
        templates={templates ?? []}
      />
      <EmailDialog
        open={emailOpen}
        onOpenChange={setEmailOpen}
        leads={leads ?? []}
        contacts={contacts ?? []}
        mailboxStatus={mailboxStatus}
        signature={emailSignature}
      />
      <NoteDialog
        open={noteOpen}
        onOpenChange={setNoteOpen}
        leads={leads ?? []}
        contacts={contacts ?? []}
      />
      <SmsTemplatesDialog open={templatesOpen} onOpenChange={setTemplatesOpen} templates={templates ?? []} />
    </div>
  );
}

// ============ COMMUNICATION ROW ============

function CommunicationRow({ comm, name }: { comm: Communication; name: string | null }) {
  const { Icon, className: iconClass } = typeIcon(comm.type);
  const isOutbound = comm.direction === 'outbound';
  const DirIcon = isOutbound ? ArrowUpRight : ArrowDownLeft;

  return (
    <div className="rounded-lg border border-border bg-card p-4 transition hover:shadow-sm">
      <div className="flex items-start gap-3">
        {/* Type icon */}
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${iconClass}`}>
          <Icon className="h-4 w-4" strokeWidth={2} />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              {commTypeLabels[comm.type] ?? comm.type}
            </span>
            <span
              className="inline-flex items-center gap-0.5 text-xs text-muted-foreground"
              title={isOutbound ? 'Sortant' : 'Entrant'}
            >
              <DirIcon className="h-3 w-3" />
            </span>
            {name && (
              <span className="truncate text-sm text-muted-foreground">· {name}</span>
            )}
          </div>

          {comm.subject && (
            <p className="mt-1 truncate text-sm font-medium text-foreground">{comm.subject}</p>
          )}
          {comm.content && (
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{comm.content}</p>
          )}
          {(comm.sender_email || comm.recipient_email) && (
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {isOutbound ? `À : ${comm.recipient_email ?? 'adresse inconnue'}` : `De : ${comm.sender_email ?? 'adresse inconnue'}`}
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span title={formatFull(comm.created_at)}>{formatRelative(comm.created_at)}</span>
            {comm.duration_seconds != null && comm.duration_seconds > 0 && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDuration(comm.duration_seconds)}
              </span>
            )}
            {comm.provider && comm.provider !== 'demo' && (
              <span className="uppercase">{comm.provider}</span>
            )}
            {comm.email_attachments?.length > 0 && (
              <span className="inline-flex items-center gap-1">
                <Paperclip className="h-3 w-3" />
                {comm.email_attachments.length} pièce{comm.email_attachments.length > 1 ? 's' : ''} jointe{comm.email_attachments.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        {/* Status */}
        <div className="shrink-0">
          <Badge variant="outline" className={`rounded-full text-[10px] font-medium ${statusBadgeClass(comm.status)}`}>
            {commStatusLabels[comm.status] ?? comm.status}
          </Badge>
        </div>
      </div>
    </div>
  );
}

// ============ SHARED SELECT HELPERS ============

function personLabel(p: { first_name: string | null; last_name: string | null; phone?: string | null; email?: string | null }): string {
  const name = [p.first_name, p.last_name].filter(Boolean).join(' ');
  if (name) return name;
  if (p.phone) return p.phone;
  if (p.email) return p.email;
  return 'Sans nom';
}

type ContactOption = { id: string; label: string; sub?: string | null };

function buildOptions(leads: Lead[], contacts: Contact[]): ContactOption[] {
  const opts: ContactOption[] = [];
  contacts.forEach((c) =>
    opts.push({
      id: `contact:${c.id}`,
      label: personLabel(c),
      sub: c.phone ?? c.email ?? null,
    }),
  );
  leads.forEach((l) =>
    opts.push({
      id: `lead:${l.id}`,
      label: personLabel(l),
      sub: l.phone ?? l.email ?? null,
    }),
  );
  return opts;
}

function buildEmailOptions(leads: Lead[], contacts: Contact[]): ContactOption[] {
  const opts: ContactOption[] = [];
  contacts.forEach((contact) => {
    if (contact.email) opts.push({ id: `contact:${contact.id}`, label: personLabel(contact), sub: contact.email });
  });
  leads.forEach((lead) => {
    if (lead.email) opts.push({ id: `lead:${lead.id}`, label: personLabel(lead), sub: lead.email });
  });
  return opts;
}

function parseOption(value: string): { kind: 'contact' | 'lead'; id: string } | null {
  if (!value) return null;
  const [kind, id] = value.split(':');
  if (kind !== 'contact' && kind !== 'lead') return null;
  return { kind, id };
}

// ============ CALL DIALOG ============

function CallDialog({
  open, onOpenChange, leads, contacts,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  leads: Lead[];
  contacts: Contact[];
}) {
  const queryClient = useQueryClient();
  const [target, setTarget] = useState('');
  const [phone, setPhone] = useState('');
  const [result, setResult] = useState<'answered' | 'no_answer' | 'voicemail'>('answered');
  const [duration, setDuration] = useState('0');
  const [notes, setNotes] = useState('');

  const options = useMemo(() => buildOptions(leads, contacts), [leads, contacts]);

  const reset = () => {
    setTarget('');
    setPhone('');
    setResult('answered');
    setDuration('0');
    setNotes('');
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const parsed = parseOption(target);
      const durationSeconds = Math.max(0, parseInt(duration, 10) || 0);

      let type: CommunicationType;
      let status: CommunicationStatus;
      if (result === 'answered') {
        type = 'call_outbound';
        status = 'answered';
      } else if (result === 'voicemail') {
        type = 'voicemail';
        status = 'delivered';
      } else {
        type = 'call_missed';
        status = 'missed';
      }

      const base: Partial<Communication> = {
        type,
        direction: 'outbound',
        status,
        content: notes || null,
        duration_seconds: result === 'answered' ? durationSeconds : null,
      };
      if (parsed?.kind === 'contact') base.contact_id = parsed.id;
      if (parsed?.kind === 'lead') base.lead_id = parsed.id;

      const res = await createCommunication(base);
      if (res.error) throw new Error(res.error);
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['communications'] });
      toast.success(result === 'answered' ? 'Appel enregistré' : 'Appel enregistré (mode démo)');
      reset();
      onOpenChange(false);
    },
    onError: (err) => toast.error((err as Error)?.message || "Erreur lors de l'enregistrement de l'appel"),
  });

  const handleSubmit = () => {
    if (!target && !phone.trim()) {
      toast.error('Sélectionnez un contact ou saisissez un numéro');
      return;
    }
    mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-lg sm:rounded-xl">
        <DialogHeader>
          <DialogTitle>Enregistrer un appel</DialogTitle>
          <DialogDescription>
            Journalisez un appel sortant. En mode démo, l'appel n'est pas réellement passé.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm">Contact / numéro</Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger className="rounded-lg">
                <SelectValue placeholder="Sélectionner un contact ou un lead" />
              </SelectTrigger>
              <SelectContent>
                {options.length === 0 && (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    Aucun contact ni lead disponible
                  </div>
                )}
                {options.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.label}{o.sub ? ` · ${o.sub}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Numéro appelé (si non lié)</Label>
            <Input
              placeholder="Ex : 06 12 34 56 78"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="rounded-lg"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm">Résultat de l'appel</Label>
              <Select value={result} onValueChange={(v) => setResult(v as typeof result)}>
                <SelectTrigger className="rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="answered">Répondu</SelectItem>
                  <SelectItem value="no_answer">Pas de réponse</SelectItem>
                  <SelectItem value="voicemail">Messagerie vocale</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Durée (secondes)</Label>
              <Input
                type="number"
                min={0}
                placeholder="0"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="rounded-lg"
                disabled={result !== 'answered'}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Notes</Label>
            <Textarea
              placeholder="Compte-rendu de l'appel..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="rounded-lg resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" className="rounded-full" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button className="rounded-full" disabled={mutation.isPending} onClick={handleSubmit}>
            {mutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Phone className="mr-2 h-4 w-4" />
            )}
            Enregistrer l'appel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============ SMS DIALOG ============

function SmsDialog({
  open, onOpenChange, leads, contacts, templates,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  leads: Lead[];
  contacts: Contact[];
  templates: SmsTemplate[];
}) {
  const queryClient = useQueryClient();
  const [target, setTarget] = useState('');
  const [phone, setPhone] = useState('');
  const [templateId, setTemplateId] = useState('none');
  const [message, setMessage] = useState('');

  const options = useMemo(() => buildOptions(leads, contacts), [leads, contacts]);

  const reset = () => {
    setTarget('');
    setPhone('');
    setTemplateId('none');
    setMessage('');
  };

  const handleTemplateChange = (value: string) => {
    setTemplateId(value);
    if (value === 'none') {
      setMessage('');
      return;
    }
    const t = templates.find((tpl) => tpl.id === value);
    if (t) setMessage(t.content);
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const parsed = parseOption(target);
      const base: Partial<Communication> = {
        type: 'sms_outbound',
        direction: 'outbound',
        status: 'sent',
        content: message,
      };
      if (parsed?.kind === 'contact') base.contact_id = parsed.id;
      if (parsed?.kind === 'lead') base.lead_id = parsed.id;
      const res = await createCommunication(base);
      if (res.error) throw new Error(res.error);
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['communications'] });
      toast.success('SMS envoyé (mode démo)');
      reset();
      onOpenChange(false);
    },
    onError: (err) => toast.error((err as Error)?.message || "Erreur d'envoi du SMS"),
  });

  const handleSubmit = () => {
    if (!message.trim()) {
      toast.error('Le message est vide');
      return;
    }
    if (!target && !phone.trim()) {
      toast.error('Sélectionnez un contact ou saisissez un numéro');
      return;
    }
    mutation.mutate();
  };

  const remaining = 160 - message.length;

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-lg sm:rounded-xl">
        <DialogHeader>
          <DialogTitle>Envoyer un SMS</DialogTitle>
          <DialogDescription>
            En mode démo, le SMS est enregistré en base mais n'est pas réellement envoyé.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm">Destinataire</Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger className="rounded-lg">
                <SelectValue placeholder="Sélectionner un contact ou un lead" />
              </SelectTrigger>
              <SelectContent>
                {options.length === 0 && (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    Aucun contact ni lead disponible
                  </div>
                )}
                {options.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.label}{o.sub ? ` · ${o.sub}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Numéro (si non lié)</Label>
            <Input
              placeholder="Ex : 06 12 34 56 78"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="rounded-lg"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Modèle</Label>
            <Select value={templateId} onValueChange={handleTemplateChange}>
              <SelectTrigger className="rounded-lg">
                <SelectValue placeholder="Message personnalisé" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Aucun (message personnalisé)</SelectItem>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Message</Label>
              <span className={`text-[11px] ${remaining < 0 ? 'text-urgent' : 'text-muted-foreground'}`}>
                {message.length}/160
              </span>
            </div>
            <Textarea
              placeholder="Saisissez votre message..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              className="rounded-lg resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" className="rounded-full" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button className="rounded-full" disabled={mutation.isPending} onClick={handleSubmit}>
            {mutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <MessageSquare className="mr-2 h-4 w-4" />
            )}
            Envoyer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============ EMAIL DIALOG ============

function EmailDialog({
  open, onOpenChange, leads, contacts, mailboxStatus, signature,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  leads: Lead[];
  contacts: Contact[];
  mailboxStatus?: IonosMailboxStatus;
  signature: string;
}) {
  const queryClient = useQueryClient();
  const [target, setTarget] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');

  const options = useMemo(() => buildEmailOptions(leads, contacts), [leads, contacts]);

  const reset = () => {
    setTarget('');
    setEmail('');
    setSubject('');
    setContent('');
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const parsed = parseOption(target);
      return sendIonosEmail({
        to: email.trim() || undefined,
        contact_id: parsed?.kind === 'contact' ? parsed.id : undefined,
        lead_id: parsed?.kind === 'lead' ? parsed.id : undefined,
        subject: subject.trim(),
        content: buildSignedEmailContent(content, signature),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['communications'] });
      queryClient.invalidateQueries({ queryKey: ['ionos-email-status'] });
      toast.success('Email envoyé depuis votre boîte IONOS');
      reset();
      onOpenChange(false);
    },
    onError: (err) => toast.error((err as Error)?.message || "Erreur d'envoi de l'email"),
  });

  const handleSubmit = () => {
    if (!subject.trim()) {
      toast.error("L'objet est requis");
      return;
    }
    if (!content.trim()) {
      toast.error('Le contenu est vide');
      return;
    }
    if (!target && !email.trim()) {
      toast.error('Sélectionnez un contact ou saisissez un email');
      return;
    }
    mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-lg sm:rounded-xl">
        <DialogHeader>
          <DialogTitle>Envoyer un email</DialogTitle>
          <DialogDescription>
            {mailboxStatus?.configured
              ? `Envoi réel depuis ${mailboxStatus.email_address ?? 'votre boîte IONOS'}.`
              : "La boîte IONOS doit d'abord être configurée par un administrateur dans Réglages > Intégrations."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm">Destinataire</Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger className="rounded-lg">
                <SelectValue placeholder="Sélectionner un contact ou un lead" />
              </SelectTrigger>
              <SelectContent>
                {options.length === 0 && (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    Aucun contact ni lead disponible
                  </div>
                )}
                {options.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.label}{o.sub ? ` · ${o.sub}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Adresse directe ou de remplacement</Label>
            <Input
              type="email"
              placeholder="exemple@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-lg"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Objet</Label>
            <Input
              placeholder="Objet de l'email"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="rounded-lg"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Contenu</Label>
            <Textarea
              placeholder="Corps de l'email..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={6}
              className="rounded-lg resize-none"
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
        </div>

        <DialogFooter>
          <Button variant="ghost" className="rounded-full" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button className="rounded-full" disabled={mutation.isPending || !mailboxStatus?.configured} onClick={handleSubmit}>
            {mutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Mail className="mr-2 h-4 w-4" />
            )}
            Envoyer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============ NOTE DIALOG ============

function NoteDialog({
  open, onOpenChange, leads, contacts,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  leads: Lead[];
  contacts: Contact[];
}) {
  const queryClient = useQueryClient();
  const [entityType, setEntityType] = useState<'lead' | 'contact'>('contact');
  const [target, setTarget] = useState('');
  const [content, setContent] = useState('');

  const reset = () => {
    setEntityType('contact');
    setTarget('');
    setContent('');
  };

  const list = entityType === 'contact' ? contacts : leads;

  const mutation = useMutation({
    mutationFn: async () => {
      const base: Partial<Communication> = {
        type: 'note',
        direction: 'outbound',
        status: 'sent',
        content,
      };
      if (entityType === 'contact') base.contact_id = target;
      else base.lead_id = target;
      const res = await createCommunication(base);
      if (res.error) throw new Error(res.error);
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['communications'] });
      toast.success('Note ajoutée');
      reset();
      onOpenChange(false);
    },
    onError: (err) => toast.error((err as Error)?.message || "Erreur lors de l'ajout de la note"),
  });

  const handleSubmit = () => {
    if (!target) {
      toast.error('Sélectionnez une entité');
      return;
    }
    if (!content.trim()) {
      toast.error('La note est vide');
      return;
    }
    mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-lg sm:rounded-xl">
        <DialogHeader>
          <DialogTitle>Ajouter une note</DialogTitle>
          <DialogDescription>
            Associez une note à un contact ou un lead.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm">Type</Label>
              <Select value={entityType} onValueChange={(v) => { setEntityType(v as 'lead' | 'contact'); setTarget(''); }}>
                <SelectTrigger className="rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contact">Contact</SelectItem>
                  <SelectItem value="lead">Lead</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">{entityType === 'contact' ? 'Contact' : 'Lead'}</Label>
              <Select value={target} onValueChange={setTarget}>
                <SelectTrigger className="rounded-lg">
                  <SelectValue placeholder={`Sélectionner un ${entityType}`} />
                </SelectTrigger>
                <SelectContent>
                  {list.length === 0 && (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                      Aucun {entityType} disponible
                    </div>
                  )}
                  {list.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {personLabel(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Contenu</Label>
            <Textarea
              placeholder="Saisissez votre note..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              className="rounded-lg resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" className="rounded-full" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button className="rounded-full" disabled={mutation.isPending} onClick={handleSubmit}>
            {mutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <StickyNote className="mr-2 h-4 w-4" />
            )}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============ SMS TEMPLATES DIALOG ============

function SmsTemplatesDialog({
  open, onOpenChange, templates,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  templates: SmsTemplate[];
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('general');
  const [content, setContent] = useState('');

  const reset = () => {
    setName('');
    setCategory('general');
    setContent('');
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await createSmsTemplate(name, content, category);
      if (res.error) throw new Error(res.error);
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sms-templates'] });
      toast.success('Modèle créé');
      reset();
    },
    onError: (err) => toast.error((err as Error)?.message || 'Erreur de création du modèle'),
  });

  const handleSubmit = () => {
    if (!name.trim()) {
      toast.error('Le nom est requis');
      return;
    }
    if (!content.trim()) {
      toast.error('Le contenu est requis');
      return;
    }
    mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl sm:rounded-xl">
        <DialogHeader>
          <DialogTitle>Modèles SMS</DialogTitle>
          <DialogDescription>
            Créez et consultez vos modèles de messages réutilisables.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Existing templates */}
          <div className="max-h-64 space-y-2 overflow-y-auto scrollbar-thin">
            {templates.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-8 text-center">
                <MessageSquare className="mb-2 h-6 w-6 text-muted-foreground" strokeWidth={1.5} />
                <p className="text-sm text-muted-foreground">Aucun modèle pour le moment</p>
              </div>
            ) : (
              templates.map((t) => (
                <div key={t.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">{t.name}</span>
                    <Badge variant="outline" className="rounded-full text-[10px]">
                      {t.category}
                    </Badge>
                  </div>
                  <p className="mt-1.5 text-sm text-muted-foreground line-clamp-2">{t.content}</p>
                </div>
              ))
            )}
          </div>

          {/* Create new template */}
          <div className="rounded-lg border border-border p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Nouveau modèle
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">Nom</Label>
                <Input
                  placeholder="Ex : Confirmation RDV"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="rounded-lg"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Catégorie</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="rounded-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">Général</SelectItem>
                    <SelectItem value="appointment">Rendez-vous</SelectItem>
                    <SelectItem value="follow_up">Relance</SelectItem>
                    <SelectItem value="confirmation">Confirmation</SelectItem>
                    <SelectItem value="info">Information</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Contenu</Label>
              <Textarea
                placeholder="Contenu du modèle..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={3}
                className="rounded-lg resize-none"
              />
            </div>
            <div className="flex justify-end">
              <Button size="sm" className="rounded-full" disabled={mutation.isPending} onClick={handleSubmit}>
                {mutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                Créer le modèle
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" className="rounded-full" onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
