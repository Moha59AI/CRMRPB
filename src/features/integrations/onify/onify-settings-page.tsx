import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle, ArrowRight, CheckCircle2, Database, FileCheck2,
  FileText, Link2, Loader2, MessageSquareText, PhoneCall, RefreshCw, ShieldCheck, Users,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import type { IntegrationConnection } from '@/types';
import {
  getOnifyConnection, parseOnifySettings, syncOnify, type OnifySyncCounts,
} from './onify-service';

const countCards: Array<{
  key: Exclude<keyof OnifySyncCounts, 'notesRemaining'>;
  label: string;
  icon: typeof Users;
}> = [
  { key: 'contacts', label: 'Clients', icon: Users },
  { key: 'notes', label: 'Notes', icon: MessageSquareText },
  { key: 'calls', label: 'Appels', icon: PhoneCall },
  { key: 'invoices', label: 'Factures', icon: FileText },
  { key: 'quotes', label: 'Devis', icon: FileCheck2 },
  { key: 'credits', label: 'Avoirs', icon: Database },
  { key: 'glassCases', label: 'Dossiers Glass', icon: ShieldCheck },
  { key: 'affaires', label: 'Affaires liées', icon: Link2 },
];

export function OnifySettingsPage() {
  const [connection, setConnection] = useState<IntegrationConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const loadConnection = useCallback(async () => {
    try {
      setConnection(await getOnifyConnection());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Chargement Onify impossible');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadConnection(); }, [loadConnection]);

  async function synchronize() {
    setSyncing(true);
    try {
      const counts = await syncOnify();
      toast.success(
        `${counts.contacts} client${counts.contacts > 1 ? 's' : ''}, ${counts.invoices} facture${counts.invoices > 1 ? 's' : ''} et ${counts.glassCases} dossier${counts.glassCases > 1 ? 's' : ''} Glass actualisés`,
      );
      await loadConnection();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Synchronisation Onify impossible');
      await loadConnection();
    } finally {
      setSyncing(false);
    }
  }

  if (loading) {
    return <div className="flex flex-1 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const settings = parseOnifySettings(connection);
  const connected = connection?.status === 'connected';
  const counts = settings.last_counts;

  return (
    <>
      <PageHeader
        title="Onify"
        description="Reprise automatique des données vers le nouveau CRM"
        action={
          <Badge variant="secondary" className={`rounded-full ${connected ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>
            {connected ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <RefreshCw className="mr-1 h-3 w-3" />}
            {connected ? 'Synchronisé' : 'Prêt à importer'}
          </Badge>
        }
      />
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="gutter-x mx-auto max-w-4xl space-y-5 py-4 sm:py-6">
          <Alert>
            <ShieldCheck className="h-4 w-4" />
            <AlertTitle>Onify reste protégé</AlertTitle>
            <AlertDescription>
              La connexion lit les clients, dossiers Glass, notes, appels, devis, factures et avoirs, puis les copie dans ce CRM. Aucune donnée n'est créée, modifiée ou supprimée dans Onify.
            </AlertDescription>
          </Alert>

          <Card className="rounded-xl p-5">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-sm font-semibold">Sens de synchronisation</h2>
                <div className="mt-3 flex items-center gap-3 text-sm">
                  <Badge variant="outline" className="rounded-full px-3 py-1">Onify</Badge>
                  <ArrowRight className="h-4 w-4 text-primary" />
                  <Badge className="rounded-full px-3 py-1">Nouveau CRM</Badge>
                </div>
              </div>
              <Button className="rounded-full" onClick={synchronize} disabled={syncing}>
                {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                {syncing ? 'Import en cours…' : 'Synchroniser maintenant'}
              </Button>
            </div>
            <Separator className="my-5" />
            <div className="grid gap-3 sm:grid-cols-2">
              <InfoRow label="Dernière synchronisation" value={connection?.last_success_at ? new Date(connection.last_success_at).toLocaleString('fr-FR') : 'Jamais'} />
              <InfoRow label="Dernière reprise Glass" value={settings.glass_last_sync_at ? new Date(settings.glass_last_sync_at).toLocaleString('fr-FR') : 'Historique à reprendre'} />
              <InfoRow label="Notes restantes" value={settings.notes_remaining ? 'Oui, prochain lot automatique' : 'Non'} />
            </div>
          </Card>

          {connection?.last_error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Dernière erreur Onify</AlertTitle>
              <AlertDescription>{connection.last_error}</AlertDescription>
            </Alert>
          )}

          <div>
            <div className="mb-3">
              <h2 className="text-sm font-semibold">Dernier import</h2>
              <p className="mt-1 text-xs text-muted-foreground">Nombre d'éléments reçus ou actualisés pendant le dernier passage.</p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {countCards.map(({ key, label, icon: Icon }) => (
                <Card key={key} className="rounded-xl p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-2xl font-semibold tabular-nums">{counts?.[key] ?? 0}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
                    </div>
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
