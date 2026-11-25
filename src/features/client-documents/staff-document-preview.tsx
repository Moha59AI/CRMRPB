import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle, Download, FileImage, FileText, Loader2, RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { createStaffDocumentPreviewUrl } from '@/services/client-documents-service';

const APERCU_VALIDE_MS = 55 * 60 * 1000;

function estPdf(mimeType: string | null, nom: string) {
  return mimeType?.toLowerCase() === 'application/pdf' || /\.pdf$/i.test(nom);
}

function estImage(mimeType: string | null, nom: string) {
  return Boolean(mimeType?.toLowerCase().startsWith('image/'))
    || /\.(?:avif|bmp|gif|heic|heif|jpe?g|png|webp)$/i.test(nom);
}

/**
 * Aperçu intégré d'une pièce client.
 *
 * La fiche prépare le lien signé dès son affichage : aucune action n'est
 * nécessaire pour lire une carte grise ou une attestation. Le fichier reste
 * dans le bucket privé ; l'URL temporaire est renouvelée avant son expiration.
 */
export function StaffDocumentPreview({
  storagePath,
  originalName,
  mimeType,
}: {
  storagePath: string;
  originalName: string;
  mimeType: string | null;
}) {
  const [telechargement, setTelechargement] = useState(false);
  const [imageIllisible, setImageIllisible] = useState(false);
  const preview = useQuery({
    queryKey: ['client-document-preview', storagePath],
    queryFn: () => createStaffDocumentPreviewUrl(storagePath),
    staleTime: APERCU_VALIDE_MS,
    gcTime: 60 * 60 * 1000,
    refetchInterval: APERCU_VALIDE_MS,
    refetchIntervalInBackground: false,
    retry: 1,
  });

  useEffect(() => setImageIllisible(false), [preview.data]);

  const telecharger = async () => {
    if (!preview.data || telechargement) return;
    setTelechargement(true);
    try {
      const response = await fetch(preview.data);
      if (!response.ok) throw new Error(`Téléchargement refusé (${response.status})`);
      const objectUrl = URL.createObjectURL(await response.blob());
      const lien = document.createElement('a');
      lien.href = objectUrl;
      lien.download = originalName || 'document-client';
      document.body.appendChild(lien);
      lien.click();
      lien.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
    } catch (error) {
      toast.error('Téléchargement impossible', {
        description: error instanceof Error ? error.message : 'Réessayez dans quelques instants.',
      });
    } finally {
      setTelechargement(false);
    }
  };

  const pdf = estPdf(mimeType, originalName);
  const image = estImage(mimeType, originalName);
  const Icone = image ? FileImage : FileText;

  return (
    <article className="overflow-hidden rounded-xl border border-border bg-background shadow-sm">
      <div className="flex min-h-12 items-center gap-3 border-b border-border px-3 py-2 sm:px-4">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icone className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{originalName}</p>
          <p className="text-[11px] text-muted-foreground">
            {pdf ? 'PDF affiché dans la fiche' : image ? 'Image affichée dans la fiche' : 'Document reçu'}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="shrink-0 rounded-full"
          disabled={!preview.data || telechargement}
          onClick={() => void telecharger()}
        >
          {telechargement
            ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            : <Download className="mr-1.5 h-3.5 w-3.5" />}
          <span className="hidden sm:inline">Télécharger</span>
          <span className="sr-only sm:hidden">Télécharger {originalName}</span>
        </Button>
      </div>

      {preview.isPending ? (
        <div className="space-y-3 p-3 sm:p-4" aria-label={`Chargement de ${originalName}`}>
          <Skeleton className="h-[300px] w-full rounded-lg sm:h-[460px]" />
        </div>
      ) : preview.isError || !preview.data ? (
        <div className="flex min-h-44 flex-col items-center justify-center px-5 py-8 text-center">
          <AlertCircle className="h-7 w-7 text-destructive" aria-hidden />
          <p className="mt-3 text-sm font-medium">Aperçu indisponible</p>
          <p className="mt-1 text-xs text-muted-foreground">Le document reste enregistré. Rechargez son lien sécurisé.</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-4 rounded-full"
            onClick={() => void preview.refetch()}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Réessayer
          </Button>
        </div>
      ) : pdf ? (
        <iframe
          src={`${preview.data}#toolbar=1&navpanes=0&view=FitH`}
          title={`Aperçu de ${originalName}`}
          loading="lazy"
          className="h-[420px] w-full bg-muted/20 sm:h-[560px]"
        />
      ) : image && !imageIllisible ? (
        <div className="flex min-h-64 items-center justify-center bg-muted/20 p-2 sm:p-4">
          <img
            src={preview.data}
            alt={originalName}
            loading="lazy"
            decoding="async"
            className="max-h-[70dvh] w-full rounded-lg object-contain"
            onError={() => setImageIllisible(true)}
          />
        </div>
      ) : (
        <div className="flex min-h-44 flex-col items-center justify-center px-5 py-8 text-center">
          <FileText className="h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="mt-3 text-sm font-medium">Aperçu non pris en charge par ce navigateur</p>
          <p className="mt-1 text-xs text-muted-foreground">Le fichier peut être téléchargé depuis son en-tête.</p>
        </div>
      )}
    </article>
  );
}
