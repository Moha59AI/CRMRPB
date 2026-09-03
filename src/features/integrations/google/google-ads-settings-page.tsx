import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  AlertCircle, CheckCircle2, Eye, EyeOff, Link2, Loader2,
  RefreshCw, Save, Shield, Unplug,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import type { IntegrationConnection } from '@/types';
import {
  getGoogleAdsConnection, parseGoogleAdsSettings, saveGoogleAdsSettings,
  startGoogleAdsOAuth, syncGoogleAds, testGoogleAdsConnection,
  type GoogleAdsSettings,
} from './google-ads-service';

const schema = z.object({
  connection_name: z.string().min(1, 'Le nom est requis'),
  customer_id: z.string().min(10, 'Le numéro de compte Google Ads est requis'),
  login_customer_id: z.string(),
  client_id: z.string().min(10, 'Le Client ID OAuth est requis'),
  developer_token: z.string(),
  client_secret: z.string(),
  api_version: z.string(),
});

type FormValues = z.infer<typeof schema>;

export function GoogleAdsSettingsPage() {
  const [connection, setConnection] = useState<IntegrationConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [authorizing, setAuthorizing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showSecret, setShowSecret] = useState<Record<string, boolean>>({});
  const { register, handleSubmit, setValue, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { connection_name: 'Google Ads', api_version: 'v25', login_customer_id: '' },
  });

  const loadConnection = useCallback(async () => {
    setLoading(true);
    try {
      const current = await getGoogleAdsConnection();
      setConnection(current);
      const settings = parseGoogleAdsSettings(current);
      setValue('connection_name', settings.connection_name);
      setValue('customer_id', settings.customer_id);
      setValue('login_customer_id', settings.login_customer_id);
      setValue('client_id', settings.client_id);
      setValue('api_version', settings.api_version);
      setValue('developer_token', '');
      setValue('client_secret', '');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Chargement impossible');
    } finally {
      setLoading(false);
    }
  }, [setValue]);

  useEffect(() => { void loadConnection(); }, [loadConnection]);

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.data?.type !== 'google-ads-oauth') return;
      setAuthorizing(false);
      if (event.data.success) {
        toast.success('Compte Google Ads autorisé');
        void loadConnection();
      } else {
        toast.error('Google n’a pas autorisé la connexion');
      }
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [loadConnection]);

  async function onSubmit(values: FormValues) {
    setSaving(true);
    try {
      const current = parseGoogleAdsSettings(connection);
      const settings: GoogleAdsSettings = {
        ...current,
        connection_name: values.connection_name,
        customer_id: values.customer_id,
        login_customer_id: values.login_customer_id,
        client_id: values.client_id,
        api_version: values.api_version,
      };
      await saveGoogleAdsSettings(settings, {
        developer_token: values.developer_token,
        client_secret: values.client_secret,
      });
      toast.success('Configuration Google Ads enregistrée');
      await loadConnection();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Enregistrement impossible');
    } finally {
      setSaving(false);
    }
  }

  async function authorize() {
    const popup = window.open('', 'google-ads-oauth', 'width=560,height=720');
    setAuthorizing(true);
    try {
      const { authUrl } = await startGoogleAdsOAuth();
      if (popup) popup.location.href = authUrl;
      else window.location.href = authUrl;
    } catch (error) {
      popup?.close();
      setAuthorizing(false);
      toast.error(error instanceof Error ? error.message : 'Autorisation impossible');
    }
  }

  async function testConnection() {
    setTesting(true);
    try {
      await testGoogleAdsConnection();
      toast.success('Connexion Google Ads opérationnelle');
      await loadConnection();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Test impossible');
      await loadConnection();
    } finally {
      setTesting(false);
    }
  }

  async function synchronize() {
    setSyncing(true);
    try {
      await syncGoogleAds();
      toast.success('Campagnes et clics synchronisés');
      await loadConnection();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Synchronisation impossible');
      await loadConnection();
    } finally {
      setSyncing(false);
    }
  }

  if (loading) {
    return <div className="flex flex-1 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const settings = parseGoogleAdsSettings(connection);
  const authorized = Boolean(settings.refresh_token_ref);
  const connected = connection?.status === 'connected' && authorized;
  const hasBaseCredentials = Boolean(settings.developer_token_ref && settings.client_secret_ref && settings.client_id);

  return (
    <>
      <PageHeader
        title="Google Ads"
        description="Connexion sécurisée et synchronisation des campagnes"
        action={
          <Badge variant="secondary" className={`rounded-full ${connected ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>
            {connected ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <Unplug className="mr-1 h-3 w-3" />}
            {connected ? 'Connecté' : 'À connecter'}
          </Badge>
        }
      />
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <form className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6" onSubmit={handleSubmit(onSubmit)}>
          <Alert>
            <Shield className="h-4 w-4" />
            <AlertTitle>Connexion sécurisée</AlertTitle>
            <AlertDescription>
              Le jeton développeur, le secret OAuth et l'autorisation Google sont stockés dans Supabase Vault. Ils ne sont jamais renvoyés au navigateur.
            </AlertDescription>
          </Alert>

          <Card className="rounded-xl p-5">
            <h2 className="text-sm font-semibold">Compte publicitaire</h2>
            <p className="mt-1 text-xs text-muted-foreground">Les numéros peuvent être saisis avec ou sans tirets.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Nom de la connexion" error={errors.connection_name?.message}>
                <Input className="rounded-lg" {...register('connection_name')} />
              </Field>
              <Field label="Numéro client Google Ads" error={errors.customer_id?.message}>
                <Input className="rounded-lg font-mono" placeholder="123-456-7890" {...register('customer_id')} />
              </Field>
              <Field label="Compte administrateur (facultatif)" error={errors.login_customer_id?.message}>
                <Input className="rounded-lg font-mono" placeholder="MCC uniquement" {...register('login_customer_id')} />
              </Field>
              <Field label="Version API" error={errors.api_version?.message}>
                <Input className="rounded-lg font-mono" readOnly {...register('api_version')} />
              </Field>
            </div>
          </Card>

          <Card className="rounded-xl p-5">
            <h2 className="text-sm font-semibold">Accès API Google</h2>
            <p className="mt-1 text-xs text-muted-foreground">À renseigner une fois. Laissez un secret vide pour conserver celui déjà stocké.</p>
            <div className="mt-4 space-y-4">
              <Field label="Client ID OAuth" error={errors.client_id?.message}>
                <Input className="rounded-lg font-mono text-xs" placeholder="…apps.googleusercontent.com" {...register('client_id')} />
              </Field>
              <SecretField
                id="developer_token"
                label="Jeton développeur Google Ads"
                stored={Boolean(settings.developer_token_ref)}
                show={Boolean(showSecret.developer_token)}
                toggle={() => setShowSecret((value) => ({ ...value, developer_token: !value.developer_token }))}
                register={register}
              />
              <SecretField
                id="client_secret"
                label="Secret OAuth"
                stored={Boolean(settings.client_secret_ref)}
                show={Boolean(showSecret.client_secret)}
                toggle={() => setShowSecret((value) => ({ ...value, client_secret: !value.client_secret }))}
                register={register}
              />
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button type="submit" className="rounded-full" disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Enregistrer
              </Button>
              <Button type="button" variant="outline" className="rounded-full" onClick={authorize} disabled={!hasBaseCredentials || authorizing}>
                {authorizing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
                Autoriser avec Google
              </Button>
            </div>
          </Card>

          {connection?.last_error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Dernière erreur Google Ads</AlertTitle>
              <AlertDescription>{connection.last_error}</AlertDescription>
            </Alert>
          )}

          <Card className="rounded-xl p-5">
            <h2 className="text-sm font-semibold">Contrôle et synchronisation</h2>
            <div className="mt-3 space-y-2 text-sm">
              <InfoRow label="Compte" value={settings.customer_name || settings.customer_id || 'Non renseigné'} />
              <InfoRow label="Dernier test" value={connection?.last_tested_at ? new Date(connection.last_tested_at).toLocaleString('fr-FR') : 'Jamais'} />
              <InfoRow label="Dernière synchronisation" value={connection?.last_success_at ? new Date(connection.last_success_at).toLocaleString('fr-FR') : 'Jamais'} />
            </div>
            <Separator className="my-4" />
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="rounded-full" onClick={testConnection} disabled={!authorized || testing}>
                {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                Tester
              </Button>
              <Button type="button" variant="outline" className="rounded-full" onClick={synchronize} disabled={!connected || syncing}>
                {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Synchroniser maintenant
              </Button>
            </div>
          </Card>
        </form>
      </div>
    </>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function SecretField({ id, label, stored, show, toggle, register }: {
  id: 'developer_token' | 'client_secret';
  label: string;
  stored: boolean;
  show: boolean;
  toggle: () => void;
  register: ReturnType<typeof useForm<FormValues>>['register'];
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{label}</Label>
        {stored && <Badge variant="secondary" className="rounded-full bg-success/10 text-[10px] text-success">Stocké</Badge>}
      </div>
      <div className="flex gap-2">
        <Input id={id} type={show ? 'text' : 'password'} className="rounded-lg font-mono text-xs" placeholder={stored ? '••••••••••••' : ''} {...register(id)} />
        <Button type="button" variant="outline" size="icon" className="shrink-0 rounded-lg" onClick={toggle} aria-label={show ? 'Masquer' : 'Afficher'}>
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-4"><span className="text-muted-foreground">{label}</span><span className="text-right">{value}</span></div>;
}
