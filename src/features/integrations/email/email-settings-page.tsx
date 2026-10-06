import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle, CheckCircle2, Eye, EyeOff, KeyRound, Loader2, Mail, RefreshCw,
  Send, Server, ShieldCheck, Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { useLocation } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
  buildDefaultEmailSignature,
  getIonosConnection, getIonosCredentialStatus, getIonosMailboxStatus,
  parseIonosSettings, saveIonosPassword, saveIonosSettings, sendIonosEmail,
  syncIonosMailbox, type IonosEmailSettings,
} from './email-service';
import { EmailSignaturePreview } from './email-signature-preview';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function erreurLisible(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const known: Record<string, string> = {
    BOITE_IONOS_NON_CONFIGUREE: "Enregistrez d'abord l'adresse de votre boîte IONOS.",
    MOT_DE_PASSE_IONOS_ABSENT: "Enregistrez le mot de passe de la boîte IONOS dans le coffre-fort.",
    MOT_DE_PASSE_IONOS_INVALIDE: 'Le mot de passe IONOS est invalide.',
    EMAIL_DESTINATAIRE_INVALIDE: "L'adresse email de test est invalide.",
  };
  return known[message] ?? message;
}

export function EmailSettingsPage() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [form, setForm] = useState<IonosEmailSettings>({
    email_address: '',
    sender_name: 'Relais Pare-Brise',
    signature: buildDefaultEmailSignature('Relais Pare-Brise', ''),
  });

  const connectionQuery = useQuery({
    queryKey: ['ionos-email-connection'],
    queryFn: getIonosConnection,
  });
  const statusQuery = useQuery({
    queryKey: ['ionos-email-status'],
    queryFn: getIonosMailboxStatus,
    retry: false,
  });
  const credentialQuery = useQuery({
    queryKey: ['ionos-email-credential'],
    queryFn: getIonosCredentialStatus,
    enabled: Boolean(connectionQuery.data),
    retry: false,
  });

  useEffect(() => {
    if (connectionQuery.data !== undefined) setForm(parseIonosSettings(connectionQuery.data));
  }, [connectionQuery.data]);

  useEffect(() => {
    if (location.hash !== '#signature-email') return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById('signature-email')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [location.hash]);

  const saveMutation = useMutation({
    mutationFn: () => saveIonosSettings(form),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['ionos-email-connection'] }),
        queryClient.invalidateQueries({ queryKey: ['ionos-email-status'] }),
      ]);
      toast.success('Réglages de la boîte mail enregistrés');
    },
    onError: (error) => toast.error(erreurLisible(error)),
  });

  const credentialMutation = useMutation({
    mutationFn: async () => {
      await saveIonosSettings(form);
      await saveIonosPassword(password);
      return syncIonosMailbox();
    },
    onSuccess: async (result) => {
      setPassword('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['ionos-email-connection'] }),
        queryClient.invalidateQueries({ queryKey: ['ionos-email-credential'] }),
        queryClient.invalidateQueries({ queryKey: ['ionos-email-status'] }),
        queryClient.invalidateQueries({ queryKey: ['mailbox-emails'] }),
      ]);
      toast.success(`${result.imported} nouvel email importé${result.imported > 1 ? 's' : ''}`);
    },
    onError: (error) => toast.error(erreurLisible(error)),
  });

  const syncMutation = useMutation({
    mutationFn: syncIonosMailbox,
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['ionos-email-connection'] }),
        queryClient.invalidateQueries({ queryKey: ['ionos-email-status'] }),
        queryClient.invalidateQueries({ queryKey: ['mailbox-emails'] }),
      ]);
      toast.success(result.imported > 0
        ? `${result.imported} nouvel email importé${result.imported > 1 ? 's' : ''}`
        : 'Boîte IONOS à jour');
    },
    onError: (error) => toast.error(erreurLisible(error)),
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      await saveIonosSettings(form);
      return sendIonosEmail({
        to: form.email_address,
        subject: 'Test de connexion du CRM Relais Pare-Brise',
        content: 'Votre boîte IONOS est bien reliée au CRM pour les envois. Vous pouvez maintenant envoyer des emails depuis le module Boîte mail.',
        signature: form.signature,
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['ionos-email-connection'] }),
        queryClient.invalidateQueries({ queryKey: ['ionos-email-status'] }),
        queryClient.invalidateQueries({ queryKey: ['mailbox-emails'] }),
      ]);
      toast.success('Email de test envoyé dans votre boîte IONOS');
    },
    onError: (error) => toast.error(erreurLisible(error)),
  });

  const validate = () => {
    if (!emailPattern.test(form.email_address.trim())) {
      toast.error("L'adresse de votre boîte IONOS est invalide");
      return false;
    }
    if (!form.sender_name.trim()) {
      toast.error("Le nom d'expéditeur est requis");
      return false;
    }
    return true;
  };

  const save = () => validate() && saveMutation.mutate();
  const test = () => validate() && testMutation.mutate();
  const connect = () => {
    if (!validate()) return;
    if (password.length < 8) {
      toast.error('Saisissez le mot de passe de la boîte IONOS');
      return;
    }
    credentialMutation.mutate();
  };
  const connected = statusQuery.data?.configured && statusQuery.data.connection_status === 'connected';
  const credentialConfigured = credentialQuery.data?.configured === true;
  const busy = saveMutation.isPending
    || testMutation.isPending
    || credentialMutation.isPending
    || syncMutation.isPending;

  return (
    <>
      <PageHeader
        title="Boîte mail et signature IONOS"
        description="Gérez votre adresse professionnelle, votre signature et la synchronisation des emails"
        action={
          <Badge variant="outline" className={connected
            ? 'rounded-full border-done/25 bg-done-soft text-done'
            : 'rounded-full border-due/25 bg-due-soft text-due'}
          >
            {connected ? <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> : <AlertCircle className="mr-1 h-3.5 w-3.5" />}
            {connected ? 'IMAP + SMTP connectés' : 'À configurer'}
          </Badge>
        }
      />

      <div className="mx-auto w-full max-w-4xl space-y-5 p-4 sm:p-6">
        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>Connexion directe à IONOS, sans Resend</AlertTitle>
          <AlertDescription>
            Le mot de passe est chiffré dans le coffre-fort Supabase, jamais enregistré dans le navigateur ni dans les
            réglages visibles. Les messages partent par SMTP IONOS et sont lus dans INBOX par IMAP IONOS.
          </AlertDescription>
        </Alert>

        {(connectionQuery.isError || statusQuery.isError || credentialQuery.isError) && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Connexion indisponible</AlertTitle>
            <AlertDescription>
              {erreurLisible(connectionQuery.error ?? statusQuery.error ?? credentialQuery.error)}
            </AlertDescription>
          </Alert>
        )}

        <Card className="rounded-xl p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Mail className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Identité d'envoi</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Cette adresse apparaît chez le client et les réponses reviennent dans votre boîte IONOS.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ionos-email">Adresse email IONOS</Label>
              <Input
                id="ionos-email"
                type="email"
                autoComplete="email"
                placeholder="contact@relaisparebrise.fr"
                value={form.email_address}
                onChange={(event) => setForm((value) => ({ ...value, email_address: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ionos-sender">Nom affiché</Label>
              <Input
                id="ionos-sender"
                placeholder="Relais Pare-Brise"
                value={form.sender_name}
                onChange={(event) => setForm((value) => ({ ...value, sender_name: event.target.value }))}
              />
            </div>
          </div>

          <Separator className="my-5" />

          <div
            id="signature-email"
            className="-m-2 scroll-mt-24 space-y-3 rounded-xl p-2 transition-shadow target:ring-2 target:ring-primary/30"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <Label htmlFor="ionos-signature">Signature automatique</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Une ligne par information. Le CRM transforme ce texte en signature professionnelle dans l’email.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full shrink-0 rounded-full sm:w-auto"
                onClick={() => setForm((value) => ({
                  ...value,
                  signature: buildDefaultEmailSignature(value.sender_name, value.email_address),
                }))}
              >
                <Sparkles className="mr-2 h-3.5 w-3.5" />
                Appliquer le modèle pro
              </Button>
            </div>
            <Textarea
              id="ionos-signature"
              value={form.signature}
              onChange={(event) => setForm((value) => ({ ...value, signature: event.target.value }))}
              rows={7}
              maxLength={2_000}
              className="resize-y rounded-lg"
              placeholder="Cordialement,\n\nRelais Pare-Brise\nService client\ncontact@relaisparebrise.fr\nwww.relaisparebrise.fr"
            />
            <EmailSignaturePreview signature={form.signature} senderName={form.sender_name} />
          </div>

          <Separator className="my-5" />

          <div className="mt-5 grid gap-2 sm:flex sm:flex-wrap">
            <Button className="w-full rounded-full sm:w-auto" disabled={busy || connectionQuery.isLoading} onClick={save}>
              {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Server className="mr-2 h-4 w-4" />}
              Enregistrer
            </Button>
            <Button
              variant="outline"
              className="w-full rounded-full sm:w-auto"
              disabled={busy || connectionQuery.isLoading || !credentialConfigured}
              onClick={test}
            >
              {testMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Envoyer un test
            </Button>
            <Button
              variant="ghost"
              className="w-full rounded-full sm:w-auto"
              disabled={statusQuery.isFetching}
              onClick={() => statusQuery.refetch()}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${statusQuery.isFetching ? 'animate-spin' : ''}`} />
              Actualiser
            </Button>
          </div>
        </Card>

        <Card className="rounded-xl p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <KeyRound className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold">Accès sécurisé IONOS</h2>
                <Badge variant="outline" className={credentialConfigured
                  ? 'rounded-full border-done/25 bg-done-soft text-done'
                  : 'rounded-full border-due/25 bg-due-soft text-due'}
                >
                  {credentialConfigured ? 'Mot de passe stocké' : 'Mot de passe requis'}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Utilisé côté serveur uniquement pour IMAP sécurisé (993) et SMTP sécurisé (465).
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-1.5">
            <Label htmlFor="ionos-password">
              {credentialConfigured ? 'Remplacer le mot de passe IONOS' : 'Mot de passe de la boîte IONOS'}
            </Label>
            <div className="relative">
              <Input
                id="ionos-password"
                type={passwordVisible ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={credentialConfigured ? 'Laissez vide pour conserver le mot de passe actuel' : 'Mot de passe IONOS'}
                className="pr-11"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2"
                aria-label={passwordVisible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                onClick={() => setPasswordVisible((visible) => !visible)}
              >
                {passwordVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Cette valeur est envoyée une seule fois au coffre-fort et n’est jamais relue par l’interface.
            </p>
          </div>

          <div className="mt-5 grid gap-2 sm:flex sm:flex-wrap">
            <Button className="w-full rounded-full sm:w-auto" disabled={busy || password.length < 8} onClick={connect}>
              {credentialMutation.isPending
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <ShieldCheck className="mr-2 h-4 w-4" />}
              Enregistrer et vérifier
            </Button>
            <Button
              variant="outline"
              className="w-full rounded-full sm:w-auto"
              disabled={busy || !credentialConfigured}
              onClick={() => syncMutation.mutate()}
            >
              {syncMutation.isPending
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <RefreshCw className="mr-2 h-4 w-4" />}
              Synchroniser maintenant
            </Button>
          </div>

          <div className={`mt-4 rounded-lg border p-3 text-xs ${connected
            ? 'border-done/25 bg-done-soft text-done'
            : 'border-due/25 bg-due-soft text-due'}`}
          >
            {connected
              ? 'Connexion directe opérationnelle. Réception IMAP et envoi SMTP IONOS uniquement ; Resend est désactivé pour la boîte mail.'
              : 'Enregistrez les réglages et le mot de passe, puis lancez la vérification. Supprimez également tout ancien transfert vers Resend dans IONOS.'}
          </div>
        </Card>
      </div>
    </>
  );
}
