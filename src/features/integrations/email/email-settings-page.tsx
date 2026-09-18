import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle, CheckCircle2, Copy, Loader2, Mail, RefreshCw, Send,
  Server, ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { supabaseUrl } from '@/lib/supabase';
import {
  buildDefaultEmailSignature, buildSignedEmailContent,
  getIonosConnection, getIonosMailboxStatus, parseIonosSettings,
  saveIonosSettings, sendIonosEmail, type IonosEmailSettings,
} from './email-service';

const webhookUrl = `${supabaseUrl}/functions/v1/email-inbound-webhook`;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function erreurLisible(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const known: Record<string, string> = {
    BOITE_IONOS_NON_CONFIGUREE: "Enregistrez d'abord l'adresse de votre boîte IONOS.",
    RESEND_API_KEY_ABSENT: "La clé Resend n'est pas encore installée dans Supabase.",
    EMAIL_DESTINATAIRE_INVALIDE: "L'adresse email de test est invalide.",
  };
  return known[message] ?? message;
}

export function EmailSettingsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<IonosEmailSettings>({
    email_address: '',
    sender_name: 'Relais Pare-Brise',
    inbound_address: '',
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

  useEffect(() => {
    if (connectionQuery.data !== undefined) setForm(parseIonosSettings(connectionQuery.data));
  }, [connectionQuery.data]);

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

  const testMutation = useMutation({
    mutationFn: async () => {
      await saveIonosSettings(form);
      return sendIonosEmail({
        to: form.email_address,
        subject: 'Test de connexion du CRM Relais Pare-Brise',
        content: buildSignedEmailContent(
          'Votre boîte IONOS est bien reliée au CRM pour les envois. Vous pouvez maintenant envoyer des emails depuis la page Communications.',
          form.signature,
        ),
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['ionos-email-connection'] }),
        queryClient.invalidateQueries({ queryKey: ['ionos-email-status'] }),
        queryClient.invalidateQueries({ queryKey: ['communications'] }),
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
    if (form.inbound_address.trim() && !emailPattern.test(form.inbound_address.trim())) {
      toast.error("L'adresse de transfert Resend est invalide");
      return false;
    }
    return true;
  };

  const save = () => validate() && saveMutation.mutate();
  const test = () => validate() && testMutation.mutate();
  const connected = statusQuery.data?.configured && statusQuery.data.connection_status === 'connected';
  const receptionReady = Boolean(form.inbound_address.trim());
  const busy = saveMutation.isPending || testMutation.isPending;

  return (
    <>
      <PageHeader
        title="Boîte mail IONOS"
        description="Envoyez depuis votre adresse professionnelle et rattachez les réponses aux clients"
        action={
          <Badge variant="outline" className={connected
            ? 'rounded-full border-done/25 bg-done-soft text-done'
            : 'rounded-full border-due/25 bg-due-soft text-due'}
          >
            {connected ? <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> : <AlertCircle className="mr-1 h-3.5 w-3.5" />}
            {connected ? 'Envoi connecté' : 'À configurer'}
          </Badge>
        }
      />

      <div className="mx-auto w-full max-w-4xl space-y-5 p-4 sm:p-6">
        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>Votre mot de passe IONOS reste privé</AlertTitle>
          <AlertDescription>
            Le CRM ne demande ni ne conserve le mot de passe de votre boîte. IONOS reste votre messagerie principale ;
            le CRM envoie via votre domaine Resend et reçoit seulement une copie des nouveaux messages transférés.
          </AlertDescription>
        </Alert>

        {(connectionQuery.isError || statusQuery.isError) && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Connexion indisponible</AlertTitle>
            <AlertDescription>
              {erreurLisible(connectionQuery.error ?? statusQuery.error)}
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

          <div className="space-y-3">
            <div>
              <Label htmlFor="ionos-signature">Signature automatique</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Elle sera visible pendant la rédaction et ajoutée automatiquement à chaque email et chaque réponse.
              </p>
            </div>
            <Textarea
              id="ionos-signature"
              value={form.signature}
              onChange={(event) => setForm((value) => ({ ...value, signature: event.target.value }))}
              rows={6}
              maxLength={2_000}
              className="resize-y rounded-lg"
              placeholder="Cordialement,\n\nRelais Pare-Brise"
            />
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">Aperçu de la signature</p>
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-foreground">
                {form.signature.trim() || 'Aucune signature ne sera ajoutée.'}
              </p>
            </div>
          </div>

          <Separator className="my-5" />

          <div className="space-y-1.5">
            <Label htmlFor="ionos-inbound">Adresse de transfert Resend</Label>
            <Input
              id="ionos-inbound"
              type="email"
              placeholder="crm@reception.relaisparebrise.fr"
              value={form.inbound_address}
              onChange={(event) => setForm((value) => ({ ...value, inbound_address: event.target.value }))}
            />
            <p className="text-xs text-muted-foreground">
              IONOS doit transférer une copie des nouveaux messages vers cette adresse. Sans elle, l'envoi fonctionne mais la réception ne remonte pas dans le CRM.
            </p>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Button className="rounded-full" disabled={busy || connectionQuery.isLoading} onClick={save}>
              {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Server className="mr-2 h-4 w-4" />}
              Enregistrer
            </Button>
            <Button variant="outline" className="rounded-full" disabled={busy || connectionQuery.isLoading} onClick={test}>
              {testMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Envoyer un test
            </Button>
            <Button
              variant="ghost"
              className="rounded-full"
              disabled={statusQuery.isFetching}
              onClick={() => statusQuery.refetch()}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${statusQuery.isFetching ? 'animate-spin' : ''}`} />
              Actualiser
            </Button>
          </div>
        </Card>

        <Card className="rounded-xl p-5">
          <h2 className="text-sm font-semibold">Activer la réception dans le CRM</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Ces réglages conservent votre boîte IONOS actuelle et ne modifient pas les enregistrements MX de votre domaine.
          </p>
          <ol className="mt-4 space-y-4 text-sm">
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">1</span>
              <span>Dans Resend, créez une adresse de réception sur un sous-domaine puis saisissez-la ci-dessus.</span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">2</span>
              <span>Dans IONOS, créez une règle qui transfère une copie des messages reçus vers cette adresse.</span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">3</span>
              <div className="min-w-0 flex-1">
                <p>Dans Resend, ajoutez ce webhook pour les événements de réception et de suivi :</p>
                <div className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-2">
                  <code className="min-w-0 flex-1 truncate text-xs">{webhookUrl}</code>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    aria-label="Copier l'adresse du webhook"
                    onClick={async () => {
                      await navigator.clipboard.writeText(webhookUrl);
                      toast.success('Adresse du webhook copiée');
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </li>
          </ol>
          <div className={`mt-4 rounded-lg border p-3 text-xs ${receptionReady
            ? 'border-done/25 bg-done-soft text-done'
            : 'border-due/25 bg-due-soft text-due'}`}
          >
            {receptionReady
              ? 'Adresse de transfert renseignée. La réception sera active après la règle IONOS et le webhook Resend.'
              : "L'adresse de transfert manque encore : les emails reçus ne peuvent pas être rattachés aux clients."}
          </div>
        </Card>
      </div>
    </>
  );
}
