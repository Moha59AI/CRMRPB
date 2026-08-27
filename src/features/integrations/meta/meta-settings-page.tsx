import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  RefreshCw, Save, Zap, Download, Bell, Send, Copy, Check,
  AlertCircle, CheckCircle2, Loader2, Eye, EyeOff, Info, Shield,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { useAuth } from '@/features/auth/auth-context';
import { canManageIntegrations } from '@/config/roles';
import {
  type MetaSettings, parseSettingsFromConnection, getMetaConnection,
  saveMetaSettings, generateVerifyToken, getMetaWebhookUrl,
  testMetaConnection, syncMetaForms, subscribePageToLeads,
  sendTestConversionEvent, maskSecret,
} from '@/features/integrations/meta/meta-service';
import type { IntegrationConnection, WebhookEvent } from '@/types';
import { supabase } from '@/lib/supabase';

const metaSchema = z.object({
  connection_name: z.string().min(1, 'Le nom est requis'),
  meta_app_id: z.string(),
  meta_app_secret: z.string(),
  business_manager_id: z.string(),
  ad_account_id: z.string(),
  facebook_page_id: z.string(),
  page_access_token: z.string(),
  meta_pixel_id: z.string(),
  conversions_api_token: z.string(),
  graph_api_version: z.string().default('v21.0'),
  website_url: z.string(),
  test_event_code: z.string(),
  webhook_verify_token: z.string(),
});

type MetaForm = z.infer<typeof metaSchema>;

export function MetaSettingsPage() {
  const { profile } = useAuth();
  const canManage = canManageIntegrations(profile?.role ?? 'advisor');
  const [connection, setConnection] = useState<IntegrationConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [webhookEvents, setWebhookEvents] = useState<WebhookEvent[]>([]);

  const {
    register, handleSubmit, formState: { errors }, setValue, watch,
  } = useForm<MetaForm>({
    resolver: zodResolver(metaSchema),
    defaultValues: {
      connection_name: 'Meta Ads',
      graph_api_version: 'v21.0',
    },
  });

  const webhookUrl = getMetaWebhookUrl();
  const verifyToken = watch('webhook_verify_token');

  useEffect(() => {
    loadConnection();
  }, []);

  async function loadConnection() {
    setLoading(true);
    const conn = await getMetaConnection();
    setConnection(conn);
    const settings = parseSettingsFromConnection(conn);
    setValue('connection_name', settings.connection_name || 'Meta Ads');
    setValue('meta_app_id', settings.meta_app_id);
    setValue('business_manager_id', settings.business_manager_id);
    setValue('ad_account_id', settings.ad_account_id);
    setValue('facebook_page_id', settings.facebook_page_id);
    setValue('meta_pixel_id', settings.meta_pixel_id);
    setValue('graph_api_version', settings.graph_api_version || 'v21.0');
    setValue('website_url', settings.website_url);
    setValue('test_event_code', settings.test_event_code);
    setValue('webhook_verify_token', settings.webhook_verify_token);
    setLoading(false);

    if (conn) {
      loadWebhookEvents(conn.workspace_id);
    }
  }

  async function loadWebhookEvents(workspaceId: string) {
    const { data } = await supabase
      .from('webhook_events')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('provider', 'meta')
      .order('received_at', { ascending: false })
      .limit(10);
    setWebhookEvents((data as WebhookEvent[]) ?? []);
  }

  function copyToClipboard(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
    toast.success('Copié dans le presse-papier');
  }

  function handleGenerateToken() {
    const token = generateVerifyToken();
    setValue('webhook_verify_token', token);
    toast.success('Token généré');
  }

  async function onSubmit(data: MetaForm) {
    setSaving(true);
    const settings: MetaSettings = {
      connection_name: data.connection_name,
      meta_app_id: data.meta_app_id,
      meta_app_secret_ref: data.meta_app_secret ? 'stored' : null,
      business_manager_id: data.business_manager_id,
      ad_account_id: data.ad_account_id,
      facebook_page_id: data.facebook_page_id,
      page_access_token_ref: data.page_access_token ? 'stored' : null,
      meta_pixel_id: data.meta_pixel_id,
      conversions_api_token_ref: data.conversions_api_token ? 'stored' : null,
      graph_api_version: data.graph_api_version,
      website_url: data.website_url,
      test_event_code: data.test_event_code,
      webhook_verify_token: data.webhook_verify_token,
    };

    const secrets: Record<string, string> = {};
    if (data.meta_app_secret) secrets.meta_app_secret = data.meta_app_secret;
    if (data.page_access_token) secrets.page_access_token = data.page_access_token;
    if (data.conversions_api_token) secrets.conversions_api_token = data.conversions_api_token;

    const { error } = await saveMetaSettings(settings, secrets);
    setSaving(false);

    if (error) {
      toast.error(error);
    } else {
      toast.success('Configuration enregistrée');
      loadConnection();
    }
  }

  async function handleTest() {
    setTesting(true);
    const result = await testMetaConnection();
    setTesting(false);
    if (result.success) {
      toast.success('Connexion testée avec succès');
    } else {
      toast.error(result.error || 'Échec du test de connexion');
    }
    loadConnection();
  }

  async function handleSyncForms() {
    setSyncing(true);
    const result = await syncMetaForms();
    setSyncing(false);
    if (result.success) {
      toast.success(`${result.forms?.length ?? 0} formulaire(s) synchronisé(s)`);
    } else {
      toast.error(result.error || 'Échec de la synchronisation');
    }
  }

  async function handleSubscribe() {
    setSubscribing(true);
    const result = await subscribePageToLeads();
    setSubscribing(false);
    if (result.success) {
      toast.success('Page abonnée aux leads');
    } else {
      toast.error(result.error || "Échec de l'abonnement");
    }
  }

  async function handleSendTest() {
    setSendingTest(true);
    const result = await sendTestConversionEvent();
    setSendingTest(false);
    if (result.success) {
      toast.success('Événement test envoyé');
    } else {
      toast.error(result.error || "Échec de l'envoi");
    }
  }

  const status = connection?.status ?? 'not_configured';
  const statusConfig = {
    connected: { label: 'Connecté', className: 'bg-success/10 text-success', icon: CheckCircle2 },
    error: { label: 'Erreur', className: 'bg-destructive/10 text-destructive', icon: AlertCircle },
    not_configured: { label: 'Non configuré', className: 'bg-muted text-muted-foreground', icon: Info },
  };
  const statusInfo = statusConfig[status as keyof typeof statusConfig];
  const StatusIcon = statusInfo.icon;

  if (loading) {
    return (
      <>
        <PageHeader title="Meta Ads" description="Configuration Meta Lead Ads & Conversions API" />
        <div className="flex items-center justify-center p-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Meta Ads"
        description="Configuration Meta Lead Ads & Conversions API"
        action={
          <Badge variant="secondary" className={`rounded-full gap-1.5 ${statusInfo.className}`}>
            <StatusIcon className="h-3 w-3" />
            {statusInfo.label}
          </Badge>
        }
      />

      <div className="overflow-y-auto scrollbar-thin">
        <div className="mx-auto max-w-3xl space-y-6 p-6">
          {/* Permissions notice */}
          {!canManage && (
            <Card className="rounded-xl border border-warning/30 bg-warning/5 p-4">
              <div className="flex items-center gap-2 text-sm text-warning">
                <Shield className="h-4 w-4" />
                <span>Seuls les administrateurs peuvent modifier les intégrations.</span>
              </div>
            </Card>
          )}

          {/* Webhook info */}
          <Card className="rounded-xl border border-border p-5">
            <div className="mb-4 flex items-center gap-2">
              <Bell className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">Webhook Meta Lead Ads</h3>
            </div>
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">URL du webhook</Label>
                <div className="mt-1 flex items-center gap-2">
                  <Input readOnly value={webhookUrl} className="rounded-lg bg-muted/50 font-mono text-xs" />
                  <Button
                    variant="outline"
                    size="icon"
                    className="shrink-0 rounded-lg"
                    onClick={() => copyToClipboard(webhookUrl, 'url')}
                  >
                    {copied === 'url' ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Verify Token</Label>
                <div className="mt-1 flex items-center gap-2">
                  <Input
                    readOnly
                    value={verifyToken || ''}
                    placeholder="Générez un token"
                    className="rounded-lg bg-muted/50 font-mono text-xs"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    className="shrink-0 rounded-lg"
                    onClick={() => copyToClipboard(verifyToken || '', 'token')}
                    disabled={!verifyToken}
                  >
                    {copied === 'token' ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="shrink-0 rounded-lg"
                    onClick={handleGenerateToken}
                    title="Générer"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </Card>

          {/* Configuration form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <Card className="rounded-xl border border-border p-5">
              <h3 className="mb-4 text-sm font-semibold text-foreground">Informations Meta</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="connection_name">Nom de la connexion</Label>
                  <Input id="connection_name" className="rounded-lg" disabled={!canManage} {...register('connection_name')} />
                  {errors.connection_name && <p className="text-xs text-destructive">{errors.connection_name.message}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="meta_app_id">Meta App ID</Label>
                  <Input id="meta_app_id" placeholder="1234567890" className="rounded-lg" disabled={!canManage} {...register('meta_app_id')} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="graph_api_version">Version Graph API</Label>
                  <Input id="graph_api_version" placeholder="v21.0" className="rounded-lg" disabled={!canManage} {...register('graph_api_version')} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="business_manager_id">Business Manager ID</Label>
                  <Input id="business_manager_id" placeholder="1234567890" className="rounded-lg" disabled={!canManage} {...register('business_manager_id')} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ad_account_id">Ad Account ID</Label>
                  <Input id="ad_account_id" placeholder="act_1234567890" className="rounded-lg" disabled={!canManage} {...register('ad_account_id')} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="facebook_page_id">Facebook Page ID</Label>
                  <Input id="facebook_page_id" placeholder="1234567890" className="rounded-lg" disabled={!canManage} {...register('facebook_page_id')} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="website_url">URL du site</Label>
                  <Input id="website_url" placeholder="https://relais-pare-brise.fr" className="rounded-lg" disabled={!canManage} {...register('website_url')} />
                </div>
              </div>
            </Card>

            {/* Secrets section */}
            <Card className="rounded-xl border border-border p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Secrets & Tokens</h3>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Valeurs chiffrées côté serveur</span>
                  <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
              </div>
              <div className="space-y-4">
                <SecretField
                  id="meta_app_secret"
                  label="Meta App Secret"
                  placeholder="••••••••••••••••"
                  register={register}
                  show={showSecrets.meta_app_secret}
                  onToggle={() => setShowSecrets((s) => ({ ...s, meta_app_secret: !s.meta_app_secret }))}
                  disabled={!canManage}
                  stored={!!connection?.settings && !!(connection.settings as Record<string, string>).meta_app_secret_ref}
                />
                <SecretField
                  id="page_access_token"
                  label="Page Access Token / System User Token"
                  placeholder="••••••••••••••••"
                  register={register}
                  show={showSecrets.page_access_token}
                  onToggle={() => setShowSecrets((s) => ({ ...s, page_access_token: !s.page_access_token }))}
                  disabled={!canManage}
                  stored={!!connection?.settings && !!(connection.settings as Record<string, string>).page_access_token_ref}
                />
                <SecretField
                  id="conversions_api_token"
                  label="Conversions API Access Token"
                  placeholder="••••••••••••••••"
                  register={register}
                  show={showSecrets.conversions_api_token}
                  onToggle={() => setShowSecrets((s) => ({ ...s, conversions_api_token: !s.conversions_api_token }))}
                  disabled={!canManage}
                  stored={!!connection?.settings && !!(connection.settings as Record<string, string>).conversions_api_token_ref}
                />
              </div>
            </Card>

            {/* Conversions API section */}
            <Card className="rounded-xl border border-border p-5">
              <h3 className="mb-4 text-sm font-semibold text-foreground">Conversions API</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="meta_pixel_id">Meta Pixel / Dataset ID</Label>
                  <Input id="meta_pixel_id" placeholder="1234567890" className="rounded-lg" disabled={!canManage} {...register('meta_pixel_id')} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="test_event_code">Code de test (facultatif)</Label>
                  <Input id="test_event_code" placeholder="TEST12345" className="rounded-lg" disabled={!canManage} {...register('test_event_code')} />
                </div>
              </div>
            </Card>

            {/* Webhook verify token */}
            <Card className="rounded-xl border border-border p-5">
              <h3 className="mb-4 text-sm font-semibold text-foreground">Webhook</h3>
              <div className="space-y-2">
                <Label htmlFor="webhook_verify_token">Verify Token du webhook</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="webhook_verify_token"
                    placeholder="Générez un token avec le bouton"
                    className="rounded-lg font-mono text-xs"
                    disabled={!canManage}
                    {...register('webhook_verify_token')}
                  />
                  <Button type="button" variant="outline" className="shrink-0 rounded-lg" onClick={handleGenerateToken} disabled={!canManage}>
                    <RefreshCw className="mr-2 h-3.5 w-3.5" />
                    Générer
                  </Button>
                </div>
              </div>
            </Card>

            {/* Action buttons */}
            {canManage && (
              <div className="flex flex-wrap gap-3">
                <Button type="submit" disabled={saving} className="rounded-full">
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Enregistrer
                </Button>
                <Button type="button" variant="outline" className="rounded-full" onClick={handleTest} disabled={testing}>
                  {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
                  Tester la connexion
                </Button>
                <Button type="button" variant="outline" className="rounded-full" onClick={handleSyncForms} disabled={syncing}>
                  {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                  Synchroniser les formulaires
                </Button>
                <Button type="button" variant="outline" className="rounded-full" onClick={handleSubscribe} disabled={subscribing}>
                  {subscribing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bell className="mr-2 h-4 w-4" />}
                  Abonner la page
                </Button>
                <Button type="button" variant="outline" className="rounded-full" onClick={handleSendTest} disabled={sendingTest}>
                  {sendingTest ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  Envoyer un événement test
                </Button>
              </div>
            )}
          </form>

          {/* Connection status details */}
          {connection && (
            <Card className="rounded-xl border border-border p-5">
              <h3 className="mb-3 text-sm font-semibold text-foreground">État de la connexion</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Dernier test</span>
                  <span className="text-foreground">{connection.last_tested_at ? new Date(connection.last_tested_at).toLocaleString('fr-FR') : 'Jamais'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Dernière synchronisation</span>
                  <span className="text-foreground">{connection.last_success_at ? new Date(connection.last_success_at).toLocaleString('fr-FR') : 'Jamais'}</span>
                </div>
                {connection.last_error && (
                  <div className="flex items-start gap-2 rounded-lg bg-destructive/5 p-3 text-destructive">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span className="text-xs">{connection.last_error}</span>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Recent webhook events */}
          {webhookEvents.length > 0 && (
            <Card className="rounded-xl border border-border p-5">
              <h3 className="mb-3 text-sm font-semibold text-foreground">Derniers événements reçus</h3>
              <div className="space-y-2">
                {webhookEvents.map((event) => (
                  <div key={event.id} className="flex items-center justify-between rounded-lg border border-border p-3 text-sm">
                    <div className="flex items-center gap-3">
                      <Badge
                        variant="secondary"
                        className={`rounded-full text-[10px] ${
                          event.processing_status === 'processed' ? 'bg-success/10 text-success' :
                          event.processing_status === 'error' ? 'bg-destructive/10 text-destructive' :
                          'bg-muted text-muted-foreground'
                        }`}
                      >
                        {event.processing_status}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(event.received_at).toLocaleString('fr-FR')}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">{event.event_type}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Setup instructions */}
          <Card className="rounded-xl border border-border p-5">
            <div className="mb-3 flex items-center gap-2">
              <Info className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">Instructions de configuration</h3>
            </div>
            <Separator className="mb-4" />
            <ol className="space-y-3 text-sm text-muted-foreground">
              <li className="flex gap-3">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-foreground">1</span>
                <span>Créez une application sur developers.facebook.com et récupérez l'App ID et App Secret.</span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-foreground">2</span>
                <span>Générez un Verify Token et configurez l'URL du webhook dans Meta Developer.</span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-foreground">3</span>
                <span>Renseignez le Page Access Token et abonnez la page aux leads.</span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-foreground">4</span>
                <span>Synchronisez les formulaires et configurez le mapping des champs.</span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-foreground">5</span>
                <span>Configurez la Conversions API avec le Pixel ID et le token pour le suivi des conversions.</span>
              </li>
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}

interface SecretFieldProps {
  id: string;
  label: string;
  placeholder: string;
  register: ReturnType<typeof useForm<MetaForm>>['register'];
  show: boolean;
  onToggle: () => void;
  disabled: boolean;
  stored: boolean;
}

function SecretField({ id, label, placeholder, register, show, onToggle, disabled, stored }: SecretFieldProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{label}</Label>
        {stored && (
          <Badge variant="secondary" className="rounded-full text-[10px] bg-success/10 text-success">
            <CheckCircle2 className="mr-1 h-2.5 w-2.5" />
            Stocké
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type={show ? 'text' : 'password'}
          placeholder={stored ? maskSecret('stored_secret_value') : placeholder}
          className="rounded-lg font-mono text-xs"
          disabled={disabled}
          {...register(id as keyof MetaForm)}
        />
        <Button type="button" variant="outline" size="icon" className="shrink-0 rounded-lg" onClick={onToggle} disabled={disabled}>
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
