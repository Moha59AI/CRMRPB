import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Trash2, Copy, Check, Webhook as WebhookIcon,
  Loader2, AlertTriangle, RefreshCw, ExternalLink, Eye, EyeOff,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { supabaseUrl } from '@/lib/supabase';
import {
  fetchWebhookEndpoints, createWebhookEndpoint, toggleWebhookEndpoint,
  deleteWebhookEndpoint, fetchWebhookEventsForEndpoint, reprocessWebhookEvent,
} from '@/services/leads-service';
import type { WebhookEndpoint, WebhookEvent } from '@/types';
import { INBOUND_WEBHOOK_PATH } from '@/config/constants';
import { useAuth } from '@/features/auth/auth-context';
import { canManageIntegrations } from '@/config/roles';

export function WebhooksPage() {
  const { profile } = useAuth();
  const canManage = canManageIntegrations(profile?.role ?? 'advisor');
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newProvider, setNewProvider] = useState('custom');
  const [selectedEndpoint, setSelectedEndpoint] = useState<WebhookEndpoint | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const { data: endpoints, isLoading } = useQuery({
    queryKey: ['webhook-endpoints'],
    queryFn: fetchWebhookEndpoints,
  });

  const createMutation = useMutation({
    mutationFn: () => createWebhookEndpoint(newName, newProvider),
    onSuccess: (result) => {
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success('Webhook créé');
        setShowCreate(false);
        setNewName('');
        queryClient.invalidateQueries({ queryKey: ['webhook-endpoints'] });
      }
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => toggleWebhookEndpoint(id, enabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['webhook-endpoints'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteWebhookEndpoint(id),
    onSuccess: (result) => {
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success('Webhook supprimé');
        queryClient.invalidateQueries({ queryKey: ['webhook-endpoints'] });
      }
    },
  });

  function getWebhookUrl(endpointKey: string): string {
    return `${supabaseUrl}/functions/v1/${INBOUND_WEBHOOK_PATH}/${endpointKey}`;
  }

  function copyToClipboard(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
    toast.success('Copié');
  }

  return (
    <>
      <PageHeader
        title="Webhooks"
        description="Webhooks entrants pour recevoir des prospects"
        action={
          canManage && (
            <Button className="rounded-full" onClick={() => setShowCreate(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Créer un webhook
            </Button>
          )
        }
      />

      <div className="flex-1 overflow-y-auto scrollbar-thin p-6">
        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        )}

        {!isLoading && endpoints && endpoints.length === 0 && (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-muted/50">
              <WebhookIcon className="h-7 w-7 text-muted-foreground" strokeWidth={1.5} />
            </div>
            <h3 className="text-sm font-semibold text-foreground">Aucun webhook configuré</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Créez un webhook entrant pour recevoir des prospects d'autres sources.
            </p>
          </div>
        )}

        {!isLoading && endpoints && endpoints.length > 0 && (
          <div className="space-y-4">
            {endpoints.map((endpoint) => (
              <Card key={endpoint.id} className="rounded-xl border border-border p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-foreground">{endpoint.name}</h3>
                      <Badge variant="secondary" className="rounded-full text-[10px] capitalize">
                        {endpoint.provider}
                      </Badge>
                      {endpoint.enabled ? (
                        <Badge variant="secondary" className="rounded-full text-[10px] bg-success/10 text-success">
                          Actif
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="rounded-full text-[10px]">
                          Inactif
                        </Badge>
                      )}
                    </div>

                    <div className="mt-3 space-y-2">
                      <div>
                        <Label className="text-xs text-muted-foreground">URL du webhook</Label>
                        <div className="mt-1 flex items-center gap-2">
                          <Input
                            readOnly
                            value={getWebhookUrl(endpoint.endpoint_key)}
                            className="rounded-lg bg-muted/50 font-mono text-xs"
                          />
                          <Button
                            variant="outline"
                            size="icon"
                            className="shrink-0 rounded-lg"
                            onClick={() => copyToClipboard(getWebhookUrl(endpoint.endpoint_key), `url-${endpoint.id}`)}
                          >
                            {copied === `url-${endpoint.id}` ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    {canManage && (
                      <>
                        <Switch
                          checked={endpoint.enabled}
                          onCheckedChange={(checked) => toggleMutation.mutate({ id: endpoint.id, enabled: checked })}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="rounded-lg text-destructive hover:bg-destructive/10"
                          onClick={() => deleteMutation.mutate(endpoint.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-lg"
                      onClick={() => setSelectedEndpoint(endpoint)}
                    >
                      <Eye className="mr-1.5 h-3.5 w-3.5" />
                      Événements
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Outbound webhooks info */}
        <div className="mt-8">
          <Card className="rounded-xl border border-dashed border-border p-5">
            <div className="flex items-center gap-2 mb-2">
              <ExternalLink className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">Webhooks sortants</h3>
              <Badge variant="secondary" className="rounded-full text-[10px]">Bientôt disponible</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Les webhooks sortants permettront d'envoyer des événements vers des services externes.
              Événements prévus : lead.created, lead.updated, lead.status_changed, appointment.created, appointment.updated, payment.received.
            </p>
          </Card>
        </div>
      </div>

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="rounded-xl">
          <DialogHeader>
            <DialogTitle>Créer un webhook entrant</DialogTitle>
            <DialogDescription>
              Une URL unique sera générée pour recevoir des prospects.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="webhook-name">Nom</Label>
              <Input
                id="webhook-name"
                placeholder="Ex: Site web, Formulaire partenaires..."
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="rounded-lg"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="webhook-provider">Source</Label>
              <Select value={newProvider} onValueChange={setNewProvider}>
                <SelectTrigger className="rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom">Personnalisé</SelectItem>
                  <SelectItem value="google">Google Ads</SelectItem>
                  <SelectItem value="website">Site web</SelectItem>
                  <SelectItem value="partner">Partenaire</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setShowCreate(false)}>
              Annuler
            </Button>
            <Button
              className="rounded-full"
              disabled={!newName || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Créer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Events dialog */}
      <WebhookEventsDialog endpoint={selectedEndpoint} onClose={() => setSelectedEndpoint(null)} />
    </>
  );
}

function WebhookEventsDialog({ endpoint, onClose }: { endpoint: WebhookEndpoint | null; onClose: () => void }) {
  const queryClient = useQueryClient();

  const { data: events, isLoading } = useQuery({
    queryKey: ['webhook-events', endpoint?.id],
    queryFn: () => endpoint ? fetchWebhookEventsForEndpoint(endpoint.id) : Promise.resolve([]),
    enabled: !!endpoint,
  });

  const reprocessMutation = useMutation({
    mutationFn: (eventId: string) => reprocessWebhookEvent(eventId),
    onSuccess: (result) => {
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success('Retraitement programmé');
        if (endpoint) queryClient.invalidateQueries({ queryKey: ['webhook-events', endpoint.id] });
      }
    },
  });

  if (!endpoint) return null;

  return (
    <Dialog open={!!endpoint} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl rounded-xl">
        <DialogHeader>
          <DialogTitle>Événements - {endpoint.name}</DialogTitle>
          <DialogDescription>
            {events?.length ?? 0} événement(s) reçu(s)
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[400px] overflow-y-auto scrollbar-thin">
          {isLoading && (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          )}

          {!isLoading && events && events.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Aucun événement reçu pour ce webhook.
            </div>
          )}

          {!isLoading && events && events.length > 0 && (
            <div className="space-y-2">
              {events.map((event) => (
                <EventRow
                  key={event.id}
                  event={event}
                  onReprocess={() => reprocessMutation.mutate(event.id)}
                  reprocessing={reprocessMutation.isPending}
                />
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EventRow({ event, onReprocess, reprocessing }: {
  event: WebhookEvent;
  onReprocess: () => void;
  reprocessing: boolean;
}) {
  const [showPayload, setShowPayload] = useState(false);

  const statusConfig: Record<string, { label: string; className: string }> = {
    pending: { label: 'En attente', className: 'bg-muted text-muted-foreground' },
    processing: { label: 'Traitement', className: 'bg-accent text-accent-foreground' },
    processed: { label: 'Traité', className: 'bg-success/10 text-success' },
    error: { label: 'Erreur', className: 'bg-destructive/10 text-destructive' },
    skipped: { label: 'Ignoré', className: 'bg-muted text-muted-foreground' },
  };
  const status = statusConfig[event.processing_status] ?? statusConfig.pending;

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className={`rounded-full text-[10px] ${status.className}`}>
            {status.label}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {new Date(event.received_at).toLocaleString('fr-FR')}
          </span>
          {event.event_type && (
            <span className="text-xs text-muted-foreground">{event.event_type}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="rounded-lg h-7"
            onClick={() => setShowPayload(!showPayload)}
          >
            {showPayload ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="rounded-lg h-7"
            onClick={onReprocess}
            disabled={reprocessing}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${reprocessing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {event.error_message && (
        <div className="mt-2 flex items-start gap-2 rounded bg-destructive/5 p-2 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          <span>{event.error_message}</span>
        </div>
      )}

      {showPayload && event.payload && (
        <pre className="mt-2 max-h-32 overflow-auto scrollbar-thin rounded bg-muted/30 p-2 text-[10px] text-muted-foreground">
          {JSON.stringify(event.payload, null, 2)}
        </pre>
      )}
    </div>
  );
}
