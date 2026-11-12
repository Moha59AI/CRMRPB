import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { fetchCaseById } from '@/services/cases-service';

/**
 * Compatibilite des anciens liens `/glass?id=...` et `/cases?id=...`.
 *
 * Glass n est plus un module : quand le dossier technique est encore lie a
 * un lead, son ancien lien ouvre directement cette fiche enrichie. La reprise
 * SQL cree aussi un lead pour les dossiers Onify historiques non rattaches.
 */
export function LegacyOnifyCaseRedirect() {
  const [params] = useSearchParams();
  const caseId = params.get('id');
  const query = useQuery({
    queryKey: ['legacy-onify-case', caseId],
    queryFn: () => fetchCaseById(caseId as string),
    enabled: Boolean(caseId),
    retry: false,
  });

  if (!caseId) return <Navigate to="/leads" replace />;
  if (query.isLoading) {
    return (
      <div className="flex min-h-48 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Ouverture de la fiche Lead…
      </div>
    );
  }
  if (query.data?.lead_id) {
    return <Navigate to={`/interventions/${query.data.lead_id}`} replace />;
  }
  return <Navigate to="/leads" replace />;
}
