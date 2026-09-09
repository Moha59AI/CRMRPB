import { useQuery } from '@tanstack/react-query';
import { AlertCircle, ExternalLink, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { createStaffDocumentPreviewUrl } from '@/services/client-documents-service';

const APERCU_VALIDE_MS = 55 * 60 * 1000;

/**
 * Le lien signe est prepare avant le clic afin que le document soit ouvert par
 * un vrai lien HTML. La navigation reste dans l onglet courant : elle fonctionne
 * aussi dans les navigateurs integres qui interdisent tous les nouveaux onglets.
 */
export function StaffDocumentLink({ storagePath }: { storagePath: string }) {
  const preview = useQuery({
    queryKey: ['client-document-preview', storagePath],
    queryFn: () => createStaffDocumentPreviewUrl(storagePath),
    staleTime: APERCU_VALIDE_MS,
    gcTime: 60 * 60 * 1000,
    refetchInterval: APERCU_VALIDE_MS,
    refetchIntervalInBackground: false,
    retry: 1,
  });

  if (preview.isPending) {
    return (
      <Button size="sm" variant="ghost" className="rounded-full" disabled>
        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Préparation…
      </Button>
    );
  }

  if (preview.isError || !preview.data) {
    return (
      <Button
        size="sm"
        variant="ghost"
        className="rounded-full text-destructive"
        onClick={async () => {
          const result = await preview.refetch();
          if (result.error) toast.error((result.error as Error).message);
        }}
      >
        <AlertCircle className="mr-1.5 h-3.5 w-3.5" />Réessayer
      </Button>
    );
  }

  return (
    <Button asChild size="sm" variant="ghost" className="rounded-full">
      <a href={preview.data}>
        Voir <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
      </a>
    </Button>
  );
}
