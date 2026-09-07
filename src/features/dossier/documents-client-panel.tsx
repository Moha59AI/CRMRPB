import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2, Clock3, Copy, ExternalLink, FileText, Loader2, MessageSquare,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import {
  createClientDocumentRequest, createStaffDocumentPreviewUrl,
  fetchLatestClientDocumentRequest,
} from '@/services/client-documents-service';
import type { Lead } from '@/types';

export function DocumentsClientPanel({ lead }: { lead: Lead }) {
  const queryClient = useQueryClient();
  const [latestUrl, setLatestUrl] = useState<string | null>(null);

  const request = useQuery({
    queryKey: ['client-document-request', lead.id],
    queryFn: () => fetchLatestClientDocumentRequest(lead.id),
  });

  const create = useMutation({
    mutationFn: () => createClientDocumentRequest(lead.id),
    onSuccess: (created) => {
      setLatestUrl(created.url);
      queryClient.invalidateQueries({ queryKey: ['client-document-request', lead.id] });
      toast.success('Nouveau lien documentaire créé');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const copy = async (url: string) => {
    await navigator.clipboard.writeText(url);
    toast.success('Lien copié');
  };

  const composeSms = (url: string) => {
    if (!lead.phone) return;
    const firstName = lead.first_name?.trim();
    const message = `Bonjour${firstName ? ` ${firstName}` : ''}, vous pouvez déposer vos documents pour votre dossier pare-brise ici : ${url} — Relais Pare-Brise`;
    window.location.href = `sms:${lead.phone}?body=${encodeURIComponent(message)}`;
  };

  if (request.isLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  const current = request.data;
  const received = current?.items.filter((item) => ['uploaded', 'validated'].includes(item.status)).length ?? 0;
  const total = current?.items.length ?? 0;
  const progress = total ? Math.round((received / total) * 100) : 0;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-base font-semibold">Collecte des documents</h3>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Le client ouvre un lien privé et dépose lui-même ses photos ou PDF. Le lien expire après 30 jours.
            </p>
          </div>
          <Button className="shrink-0 rounded-full" disabled={create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : current ? <RefreshCw className="mr-2 h-4 w-4" /> : <FileText className="mr-2 h-4 w-4" />}
            {current ? 'Nouveau lien' : 'Créer le lien'}
          </Button>
        </div>

        {latestUrl && (
          <div className="mt-4 rounded-xl border border-done/25 bg-done-soft p-3">
            <p className="text-xs font-medium text-done">Lien prêt à envoyer</p>
            <p className="mt-1 truncate text-xs text-muted-foreground">{latestUrl}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="rounded-full" onClick={() => copy(latestUrl)}>
                <Copy className="mr-1.5 h-3.5 w-3.5" />Copier
              </Button>
              <Button size="sm" className="rounded-full" disabled={!lead.phone} onClick={() => composeSms(latestUrl)}>
                <MessageSquare className="mr-1.5 h-3.5 w-3.5" />Envoyer par SMS
              </Button>
            </div>
          </div>
        )}
      </section>

      {current ? (
        <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">Dernière demande</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {current.status === 'complete' ? 'Toutes les pièces obligatoires sont arrivées' : `${received} document${received > 1 ? 's' : ''} reçu${received > 1 ? 's' : ''}`}
              </p>
            </div>
            <span className={cn(
              'rounded-full px-2.5 py-1 text-xs font-medium',
              current.status === 'complete' ? 'bg-done-soft text-done' :
                current.status === 'open' ? 'bg-due-soft text-due' : 'bg-muted text-muted-foreground',
            )}>
              {current.status === 'complete' ? 'Complet' : current.status === 'open' ? 'En attente' : current.status === 'expired' ? 'Expiré' : 'Remplacé'}
            </span>
          </div>
          <Progress value={progress} className="mt-4" />

          <div className="mt-4 divide-y divide-border">
            {current.items.map((item) => {
              const uploaded = ['uploaded', 'validated'].includes(item.status);
              return (
                <div key={item.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  {uploaded ? <CheckCircle2 className="h-4 w-4 shrink-0 text-done" /> : <Clock3 className="h-4 w-4 shrink-0 text-muted-foreground" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.label}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {uploaded ? item.original_name ?? 'Document reçu' : item.required ? 'En attente — obligatoire' : 'En attente — facultatif'}
                    </p>
                  </div>
                  {uploaded && item.storage_path && (
                    <Button
                      size="sm" variant="ghost" className="rounded-full"
                      onClick={async () => {
                        try {
                          const url = await createStaffDocumentPreviewUrl(item.storage_path as string);
                          window.open(url, '_blank', 'noopener,noreferrer');
                        } catch (error) {
                          toast.error((error as Error).message);
                        }
                      }}
                    >
                      Voir <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        <div className="rounded-xl border border-dashed border-border py-14 text-center">
          <FileText className="mx-auto h-7 w-7 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">Aucune demande envoyée</p>
          <p className="mt-1 text-xs text-muted-foreground">Créez le premier lien sécurisé pour ce client.</p>
        </div>
      )}
    </div>
  );
}

