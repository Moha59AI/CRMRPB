import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Megaphone, Plus, Send, Mail, MessageSquare, Calendar, Users,
  BarChart3, TrendingUp, AlertCircle, Loader2, CheckCircle2,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import type { Campaign, CampaignStatus, SmsTemplate, Contact } from '@/types';
import { fetchSmsTemplates } from '@/services/activity-service';
import { createCampaign, fetchCampaigns, updateCampaign } from '@/services/automation-service';
import { fetchContacts } from '@/services/contacts-service';

// ============ CONSTANTS ============

const campaignStatusLabels: Record<CampaignStatus, string> = {
  draft: 'Brouillon',
  scheduled: 'Programmée',
  sending: 'Envoi en cours',
  sent: 'Envoyée',
  cancelled: 'Annulée',
};

function campaignStatusColor(status: CampaignStatus): string {
  switch (status) {
    case 'draft':
      return 'bg-muted/50 text-foreground border-border';
    case 'scheduled':
      return 'bg-upcoming-soft text-upcoming border-upcoming/25';
    case 'sending':
      return 'bg-due-soft text-due border-due/25';
    case 'sent':
      return 'bg-done-soft text-done border-done/25';
    case 'cancelled':
      return 'bg-urgent-soft text-urgent border-urgent/25';
    default:
      return 'bg-muted/50 text-foreground border-border';
  }
}

const campaignStatusOrder: CampaignStatus[] = ['draft', 'scheduled', 'sending', 'sent', 'cancelled'];

function channelLabel(channel: 'sms' | 'email'): string {
  return channel === 'sms' ? 'SMS' : 'Email';
}

function formatDate(date: string | null | undefined): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatDateTime(date: string | null | undefined): string {
  if (!date) return '—';
  return new Date(date).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ============ MAIN PAGE ============

export function CampaignsPage() {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const { data: campaigns, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['campaigns'],
    queryFn: fetchCampaigns,
  });

  const { data: templates } = useQuery({
    queryKey: ['sms-templates'],
    queryFn: fetchSmsTemplates,
  });

  const { data: contacts } = useQuery({
    queryKey: ['contacts-all'],
    queryFn: () => fetchContacts({}),
  });

  const templateMap = useMemo(() => {
    const m = new Map<string, SmsTemplate>();
    (templates ?? []).forEach((t) => m.set(t.id, t));
    return m;
  }, [templates]);

  // Audience size: count subscribed contacts matching the filter
  const audienceSize = useMemo(() => {
    return (filter: Record<string, unknown> | undefined): number => {
      const all = contacts ?? [];
      const subscribed = all.filter((c) => !c.unsubscribed);
      const scope = filter?.scope;
      const city = filter?.city as string | undefined;
      if (scope === 'city' && city) {
        return subscribed.filter((c) => c.city?.toLowerCase() === city.toLowerCase()).length;
      }
      return subscribed.length;
    };
  }, [contacts]);

  const filteredCampaigns = useMemo(() => {
    return (campaigns ?? []).filter((c) => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (channelFilter !== 'all' && c.channel !== channelFilter) return false;
      return true;
    });
  }, [campaigns, statusFilter, channelFilter]);

  const selectedCampaign = useMemo(
    () => (campaigns ?? []).find((c) => c.id === selectedCampaignId) ?? null,
    [campaigns, selectedCampaignId],
  );

  const selectedTemplate = useMemo(
    () => (selectedCampaign && selectedCampaign.template_id
      ? templateMap.get(selectedCampaign.template_id) ?? null
      : null),
    [selectedCampaign, templateMap],
  );

  return (
    <>
      <PageHeader
        title="Campagnes"
        description="Campagnes SMS et marketing"
        action={
          <Button className="rounded-full" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nouvelle campagne
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 gutter-x border-b border-border py-4">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Canal</Label>
          <Select value={channelFilter} onValueChange={setChannelFilter}>
            <SelectTrigger className="w-[160px] rounded-lg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les canaux</SelectItem>
              <SelectItem value="sms">SMS</SelectItem>
              <SelectItem value="email">Email</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Statut</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px] rounded-lg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              {campaignStatusOrder.map((s) => (
                <SelectItem key={s} value={s}>{campaignStatusLabels[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {isLoading && (
          <div className="p-6">
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <AlertCircle className="mb-3 h-8 w-8 text-destructive" />
            <p className="text-sm text-muted-foreground">{(error as Error)?.message || 'Erreur de chargement'}</p>
            <Button variant="outline" className="mt-4 rounded-full" onClick={() => refetch()}>
              Réessayer
            </Button>
          </div>
        )}

        {!isLoading && !isError && filteredCampaigns.length === 0 && (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-muted/50">
              <Megaphone className="h-7 w-7 text-muted-foreground" strokeWidth={1.5} />
            </div>
            <h3 className="text-sm font-semibold text-foreground">Aucune campagne pour le moment</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Créez votre première campagne SMS ou email pour relancer vos contacts et booster vos conversions.
            </p>
            <Button className="mt-4 rounded-full" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Nouvelle campagne
            </Button>
          </div>
        )}

        {!isLoading && !isError && filteredCampaigns.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-xs">Nom</TableHead>
                <TableHead className="text-xs">Canal</TableHead>
                <TableHead className="text-xs">Statut</TableHead>
                <TableHead className="text-xs text-right">Envoyés</TableHead>
                <TableHead className="text-xs text-right">Livrés</TableHead>
                <TableHead className="text-xs text-right">Échecs</TableHead>
                <TableHead className="text-xs text-right">Réponses</TableHead>
                <TableHead className="text-xs text-right">Conversions</TableHead>
                <TableHead className="text-xs">Date programmée</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCampaigns.map((c) => (
                <TableRow
                  key={c.id}
                  className="cursor-pointer"
                  onClick={() => setSelectedCampaignId(c.id)}
                >
                  <TableCell className="font-medium text-foreground">
                    <div className="flex items-center gap-2">
                      {c.channel === 'sms' ? (
                        <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className="truncate">{c.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="rounded-full text-[10px]">
                      {channelLabel(c.channel)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`rounded-full text-[10px] ${campaignStatusColor(c.status)}`}>
                      {campaignStatusLabels[c.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{c.sent_count}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{c.delivered_count}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{c.failed_count}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{c.reply_count}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{c.conversion_count}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(c.scheduled_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Detail Sheet */}
      <CampaignDetailSheet
        campaign={selectedCampaign}
        template={selectedTemplate}
        audienceSize={selectedCampaign ? audienceSize(selectedCampaign.audience_filter) : 0}
        open={!!selectedCampaignId}
        onOpenChange={(o) => { if (!o) setSelectedCampaignId(null); }}
      />

      {/* Create Dialog */}
      <CreateCampaignDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        templates={templates ?? []}
        contacts={contacts ?? []}
      />
    </>
  );
}

// ============ CAMPAIGN DETAIL SHEET ============

function CampaignDetailSheet({
  campaign, template, audienceSize, open, onOpenChange,
}: {
  campaign: Campaign | null;
  template: SmsTemplate | null;
  audienceSize: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Campaign> }) =>
      updateCampaign(id, updates),
    onSuccess: (res, vars) => {
      if (res.error) {
        toast.error(res.error);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      if (vars.updates.status === 'sent') {
        toast.success('Campagne envoyée (mode démo)', {
          description: `${campaign?.sent_count ?? 0} messages marqués comme envoyés.`,
        });
      } else {
        toast.success('Campagne mise à jour');
      }
    },
    onError: (err) => toast.error((err as Error)?.message || 'Erreur de mise à jour'),
  });

  if (!campaign) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="sm:max-w-lg" />
      </Sheet>
    );
  }

  const sent = campaign.sent_count;
  const delivered = campaign.delivered_count;
  const failed = campaign.failed_count;
  const replies = campaign.reply_count;
  const conversions = campaign.conversion_count;

  const deliveryRate = sent > 0 ? Math.round((delivered / sent) * 100) : 0;
  const failureRate = sent > 0 ? Math.round((failed / sent) * 100) : 0;
  const replyRate = sent > 0 ? Math.round((replies / sent) * 100) : 0;
  const conversionRate = sent > 0 ? Math.round((conversions / sent) * 100) : 0;

  const canSendNow = campaign.status === 'draft' || campaign.status === 'scheduled';
  const canSchedule = campaign.status === 'draft';
  const canCancel = campaign.status === 'draft' || campaign.status === 'scheduled';

  const handleSendNow = () => {
    // Demo mode: mark as sent with a notional sent count equal to the audience size
    updateMutation.mutate({
      id: campaign.id,
      updates: {
        status: 'sent',
        sent_count: audienceSize || sent,
        delivered_count: audienceSize || delivered,
      },
    });
  };

  const handleSchedule = () => {
    if (!campaign.scheduled_at) {
      toast.error('Programmez une date avant de planifier la campagne');
      return;
    }
    updateMutation.mutate({ id: campaign.id, updates: { status: 'scheduled' } });
  };

  const handleCancel = () => {
    updateMutation.mutate({ id: campaign.id, updates: { status: 'cancelled' } });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader className="pr-10">
          <div className="flex items-center gap-2">
            {campaign.channel === 'sms' ? (
              <MessageSquare className="h-5 w-5 text-muted-foreground" />
            ) : (
              <Mail className="h-5 w-5 text-muted-foreground" />
            )}
            <SheetTitle className="truncate">{campaign.name}</SheetTitle>
          </div>
          <SheetDescription className="sr-only">Détails de la campagne</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Status + channel badges */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={`rounded-full text-[10px] ${campaignStatusColor(campaign.status)}`}>
              {campaignStatusLabels[campaign.status]}
            </Badge>
            <Badge variant="outline" className="rounded-full text-[10px]">
              {channelLabel(campaign.channel)}
            </Badge>
            <Badge variant="outline" className="rounded-full text-[10px]">
              {audienceSize} destinataires
            </Badge>
          </div>

          {/* Description */}
          {campaign.description && (
            <p className="text-sm text-muted-foreground">{campaign.description}</p>
          )}

          {/* Info */}
          <div className="rounded-xl border border-border p-4">
            <div className="flex items-start gap-3 py-1.5">
              <Calendar className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">Date programmée</p>
                <p className="text-sm text-foreground">{formatDateTime(campaign.scheduled_at)}</p>
              </div>
            </div>
            <div className="flex items-start gap-3 py-1.5">
              <Users className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">Audience</p>
                <p className="text-sm text-foreground">
                  {audienceSize} contact(s) éligible(s)
                </p>
              </div>
            </div>
            {template && (
              <div className="flex items-start gap-3 py-1.5">
                <MessageSquare className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">Modèle utilisé</p>
                  <p className="text-sm text-foreground">{template.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-3">{template.content}</p>
                </div>
              </div>
            )}
          </div>

          {/* Unsubscribed note */}
          <div className="flex items-start gap-2 rounded-xl border border-due/25 bg-due-soft p-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-due" />
            <p className="text-xs text-due">
              Les contacts désabonnés sont automatiquement exclus de l'envoi. Aucun message ne leur sera envoyé.
            </p>
          </div>

          {/* Stats */}
          {(campaign.status === 'sending' || campaign.status === 'sent') && (
            <div className="rounded-xl border border-border p-4">
              <div className="mb-4 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">Statistiques</h3>
              </div>

              <StatBar
                icon={<Send className="h-3.5 w-3.5" />}
                label="Envoyés"
                value={sent}
                rate={sent > 0 ? 100 : 0}
              />
              <StatBar
                icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                label="Livrés"
                value={delivered}
                rate={deliveryRate}
                colorClass="bg-done"
              />
              <StatBar
                icon={<AlertCircle className="h-3.5 w-3.5" />}
                label="Échecs"
                value={failed}
                rate={failureRate}
                colorClass="bg-urgent"
              />
              <StatBar
                icon={<MessageSquare className="h-3.5 w-3.5" />}
                label="Réponses"
                value={replies}
                rate={replyRate}
                colorClass="bg-upcoming"
              />
              <StatBar
                icon={<TrendingUp className="h-3.5 w-3.5" />}
                label="Conversions"
                value={conversions}
                rate={conversionRate}
                colorClass="bg-due"
              />
            </div>
          )}

          {/* Status management */}
          <div className="rounded-xl border border-border p-4">
            <h3 className="mb-3 text-sm font-semibold text-foreground">Cycle de vie</h3>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={campaign.status === 'draft' ? 'font-semibold text-foreground' : ''}>Brouillon</span>
              <span>→</span>
              <span className={campaign.status === 'scheduled' ? 'font-semibold text-foreground' : ''}>Programmée</span>
              <span>→</span>
              <span className={campaign.status === 'sending' ? 'font-semibold text-foreground' : ''}>Envoi</span>
              <span>→</span>
              <span className={campaign.status === 'sent' ? 'font-semibold text-foreground' : ''}>Envoyée</span>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {canSchedule && campaign.scheduled_at && (
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  disabled={updateMutation.isPending}
                  onClick={handleSchedule}
                >
                  <Calendar className="mr-2 h-4 w-4" />
                  Planifier
                </Button>
              )}
              {canSendNow && (
                <Button
                  size="sm"
                  className="rounded-full"
                  disabled={updateMutation.isPending}
                  onClick={handleSendNow}
                >
                  {updateMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  Envoyer maintenant
                </Button>
              )}
              {canCancel && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-full text-muted-foreground"
                  disabled={updateMutation.isPending}
                  onClick={handleCancel}
                >
                  Annuler la campagne
                </Button>
              )}
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            Créée le {formatDate(campaign.created_at)}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ============ CREATE CAMPAIGN DIALOG ============

const campaignSchema = z.object({
  name: z.string().min(1, 'Le nom est requis'),
  description: z.string().optional(),
  channel: z.enum(['sms', 'email']),
  template_id: z.string().optional().or(z.literal('')),
  audience_scope: z.enum(['all', 'city']),
  audience_city: z.string().optional().or(z.literal('')),
  scheduled_at: z.string().optional().or(z.literal('')),
});

type CampaignFormValues = z.infer<typeof campaignSchema>;

function CreateCampaignDialog({
  open, onOpenChange, templates, contacts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: SmsTemplate[];
  contacts: Contact[];
}) {
  const queryClient = useQueryClient();

  const [channel, setChannel] = useState<'sms' | 'email'>('sms');
  const [audienceScope, setAudienceScope] = useState<'all' | 'city'>('all');

  // Unique cities from subscribed contacts, for the city selector
  const cities = useMemo(() => {
    const set = new Set<string>();
    contacts
      .filter((c) => !c.unsubscribed && c.city)
      .forEach((c) => set.add(c.city as string));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [contacts]);

  const subscribedCount = useMemo(
    () => contacts.filter((c) => !c.unsubscribed).length,
    [contacts],
  );

  const form = useForm<CampaignFormValues>({
    resolver: zodResolver(campaignSchema),
    defaultValues: {
      name: '',
      description: '',
      channel: 'sms',
      template_id: '',
      audience_scope: 'all',
      audience_city: '',
      scheduled_at: '',
    },
  });

  const mutation = useMutation({
    mutationFn: (values: CampaignFormValues) => {
      const audience_filter: Record<string, unknown> = { scope: values.audience_scope };
      if (values.audience_scope === 'city' && values.audience_city) {
        audience_filter.city = values.audience_city;
      }
      return createCampaign({
        name: values.name,
        description: values.description || null,
        channel: values.channel,
        template_id: values.template_id || null,
        audience_filter,
        scheduled_at: values.scheduled_at ? new Date(values.scheduled_at).toISOString() : null,
        status: 'draft',
        sent_count: 0,
        delivered_count: 0,
        failed_count: 0,
        reply_count: 0,
        conversion_count: 0,
      });
    },
    onSuccess: (res) => {
      if (res.error) {
        toast.error(res.error);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Campagne créée', {
        description: 'Elle est enregistrée comme brouillon. Vous pouvez la programmer ou l\'envoyer.',
      });
      resetAndClose();
    },
    onError: (err) => toast.error((err as Error)?.message || 'Erreur de création'),
  });

  const resetAndClose = () => {
    form.reset();
    setChannel('sms');
    setAudienceScope('all');
    onOpenChange(false);
  };

  const onSubmit = (values: CampaignFormValues) => {
    if (values.audience_scope === 'city' && !values.audience_city) {
      toast.error('Sélectionnez une ville pour le filtre d\'audience');
      return;
    }
    mutation.mutate(values);
  };

  // React-hook-form watches are not used for Select; we sync via state
  const handleChannelChange = (v: string) => {
    const val = v as 'sms' | 'email';
    setChannel(val);
    form.setValue('channel', val);
    if (val === 'email') form.setValue('template_id', '');
  };

  const handleAudienceScopeChange = (v: string) => {
    const val = v as 'all' | 'city';
    setAudienceScope(val);
    form.setValue('audience_scope', val);
    if (val === 'all') form.setValue('audience_city', '');
  };

  const scheduledValue = form.watch('scheduled_at');
  const selectedCity = form.watch('audience_city');

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetAndClose(); }}>
      <DialogContent className="max-w-lg sm:rounded-xl">
        <DialogHeader>
          <DialogTitle>Nouvelle campagne</DialogTitle>
          <DialogDescription>
            Créez une campagne SMS ou email vers vos contacts. Les désabonnés sont exclus automatiquement.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            label="Nom de la campagne"
            error={form.formState.errors.name?.message}
            {...form.register('name')}
            placeholder="Ex: Relance vitrage janvier"
          />

          <div className="space-y-1.5">
            <Label className="text-sm text-foreground">Description</Label>
            <Textarea
              {...form.register('description')}
              placeholder="Objectif de la campagne…"
              className="rounded-lg"
              rows={2}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm text-foreground">Canal</Label>
            <Select value={channel} onValueChange={handleChannelChange}>
              <SelectTrigger className="rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="email">Email</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {channel === 'sms' && (
            <div className="space-y-1.5">
              <Label className="text-sm text-foreground">Modèle de SMS</Label>
              <Select
                value={form.watch('template_id') || ''}
                onValueChange={(v) => form.setValue('template_id', v)}
              >
                <SelectTrigger className="rounded-lg">
                  <SelectValue placeholder="Sélectionnez un modèle" />
                </SelectTrigger>
                <SelectContent>
                  {templates.length === 0 && (
                    <SelectItem value="_none" disabled>Aucun modèle disponible</SelectItem>
                  )}
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-sm text-foreground">Audience</Label>
            <Select value={audienceScope} onValueChange={handleAudienceScopeChange}>
              <SelectTrigger className="rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les contacts ({subscribedCount})</SelectItem>
                <SelectItem value="city">Par ville</SelectItem>
              </SelectContent>
            </Select>
            {audienceScope === 'city' && (
              <div className="pt-1.5">
                <Select
                  value={selectedCity || ''}
                  onValueChange={(v) => form.setValue('audience_city', v)}
                >
                  <SelectTrigger className="rounded-lg">
                    <SelectValue placeholder="Sélectionnez une ville" />
                  </SelectTrigger>
                  <SelectContent>
                    {cities.length === 0 && (
                      <SelectItem value="_none" disabled>Aucune ville disponible</SelectItem>
                    )}
                    {cities.map((city) => (
                      <SelectItem key={city} value={city}>{city}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <FormField
            label="Date de programmation (optionnel)"
            type="datetime-local"
            error={form.formState.errors.scheduled_at?.message}
            {...form.register('scheduled_at')}
            value={scheduledValue}
          />

          <div className="flex items-start gap-2 rounded-xl border border-due/25 bg-due-soft p-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-due" />
            <p className="text-xs text-due">
              Les contacts désabonnés ({contacts.filter((c) => c.unsubscribed).length}) seront exclus automatiquement.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              className="rounded-full"
              onClick={() => onOpenChange(false)}
            >
              Annuler
            </Button>
            <Button
              type="submit"
              className="rounded-full"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Créer la campagne
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============ SMALL COMPONENTS ============

function StatBar({
  icon, label, value, rate, colorClass,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  rate: number;
  colorClass?: string;
}) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="mb-1.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {icon}
          <span>{label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground tabular-nums">{value}</span>
          <span className="text-xs text-muted-foreground tabular-nums">{rate}%</span>
        </div>
      </div>
      <Progress value={rate} className={colorClass ? `bg-muted ${colorClass}` : undefined} />
    </div>
  );
}

function FormField({
  label, error, ...props
}: {
  label: string;
  error?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm text-foreground">{label}</Label>
      <Input
        {...props}
        className={`rounded-lg ${props.className ?? ''}`}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}


