import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Clock3, ExternalLink, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { LIBELLE_VITRAGE, formatDateTime } from '@/features/leads/lead-shared';
import {
  createStaffDocumentPreviewUrl, fetchClientDocumentHistory,
} from '@/services/client-documents-service';
import type { Lead } from '@/types';

export function ClientDocumentHistory({ interventions }: { interventions: Lead[] }) {
  const leadIds = interventions.map((lead) => lead.id);
  const history = useQuery({
    queryKey: ['client-document-history', leadIds],
    queryFn: () => fetchClientDocumentHistory(leadIds),
    enabled: leadIds.length > 0,
  });

  if (history.isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }
  if (history.isError) {
    return <div className="py-16 text-center text-sm text-destructive">Impossible de charger les documents du client.</div>;
  }
  if (!history.data?.length) {
    return (
      <div className="mx-auto max-w-3xl rounded-xl border border-dashed border-border py-16 text-center">
        <FileText className="mx-auto h-7 w-7 text-muted-foreground" />
        <p className="mt-3 text-sm font-medium">Aucun document client</p>
        <p className="mt-1 text-xs text-muted-foreground">Les pièces déposées depuis un lien privé apparaîtront ici.</p>
      </div>
    );
  }

  const interventionsById = new Map(interventions.map((lead) => [lead.id, lead]));
  const allItems = history.data.flatMap((request) => request.items);
  const received = allItems.filter((item) => ['uploaded', 'validated'].includes(item.status)).length;
  const progress = allItems.length ? Math.round((received / allItems.length) * 100) : 0;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Documents de toutes les interventions</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{received} pièce{received > 1 ? 's' : ''} reçue{received > 1 ? 's' : ''} sur {allItems.length}</p>
          </div>
          <span className="text-sm font-semibold tabular">{progress}%</span>
        </div>
        <Progress value={progress} className="mt-3" />
      </section>

      {history.data.map((request) => {
        const intervention = interventionsById.get(request.lead_id);
        const title = [
          intervention?.glass_type ? LIBELLE_VITRAGE[intervention.glass_type] : 'Intervention',
          intervention?.vehicle_registration,
        ].filter(Boolean).join(' · ');

        return (
          <section key={request.id} className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/40 px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold">{title}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">Demande du {formatDateTime(request.created_at)}</p>
              </div>
              <span className={request.status === 'complete' ? 'text-xs font-medium text-done' : 'text-xs font-medium text-due'}>
                {request.status === 'complete' ? 'Complet' : 'En attente'}
              </span>
            </div>
            <div className="divide-y divide-border px-4">
              {request.items.map((item) => {
                const uploaded = ['uploaded', 'validated'].includes(item.status);
                return (
                  <div key={item.id} className="flex items-center gap-3 py-3">
                    {uploaded ? <CheckCircle2 className="h-4 w-4 shrink-0 text-done" /> : <Clock3 className="h-4 w-4 shrink-0 text-muted-foreground" />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.label}</p>
                      <p className="truncate text-xs text-muted-foreground">{uploaded ? item.original_name ?? 'Document reçu' : 'En attente'}</p>
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
        );
      })}
    </div>
  );
}
