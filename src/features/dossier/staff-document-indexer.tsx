import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FilePlus2, Loader2, UploadCloud, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/features/auth/auth-context';
import {
  ensureStaffClientDocumentRequest,
  uploadStaffClientDocument,
  type ClientDocumentRequestSummary,
} from '@/services/client-documents-service';
import type { Lead } from '@/types';

const maxBytes = 12 * 1024 * 1024;
const acceptedMimeTypes = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

export function StaffDocumentIndexer({
  lead,
  requests,
}: {
  lead: Lead;
  requests: ClientDocumentRequestSummary[];
}) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [preparedRequest, setPreparedRequest] = useState<ClientDocumentRequestSummary | null>(null);
  const [itemId, setItemId] = useState('');
  const [files, setFiles] = useState<File[]>([]);

  const activeRequest = useMemo(() => (
    requests.find((request) => request.status === 'open' || request.status === 'complete') ?? null
  ), [requests]);
  const request = activeRequest ?? preparedRequest;

  useEffect(() => {
    if (!request?.items.length) return;
    if (request.items.some((item) => item.id === itemId)) return;
    const preferred = request.items.find((item) => item.required && item.status === 'requested')
      ?? request.items.find((item) => item.required)
      ?? request.items[0];
    setItemId(preferred.id);
  }, [itemId, request]);

  const ensure = useMutation({
    mutationFn: () => ensureStaffClientDocumentRequest(lead.id),
    onSuccess: (created) => {
      setPreparedRequest(created);
      queryClient.invalidateQueries({ queryKey: ['client-document-request', lead.id] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const upload = useMutation({
    mutationFn: async () => {
      if (!request || !itemId || files.length === 0) {
        throw new Error('Choisissez une catégorie et au moins un fichier.');
      }

      let complete = request.status === 'complete';
      for (const file of files) {
        const result = await uploadStaffClientDocument(request.id, itemId, file);
        complete = result.complete;
      }
      return { complete, count: files.length };
    },
    onSuccess: async ({ complete, count }) => {
      setFiles([]);
      if (inputRef.current) inputRef.current.value = '';
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['client-document-request', lead.id] }),
        queryClient.invalidateQueries({ queryKey: ['lead', lead.id] }),
        queryClient.invalidateQueries({ queryKey: ['leads'] }),
        queryClient.invalidateQueries({ queryKey: ['relances'] }),
      ]);
      toast.success(
        complete
          ? `${count} fichier${count > 1 ? 's' : ''} indexé${count > 1 ? 's' : ''} · dossier prêt à planifier`
          : `${count} fichier${count > 1 ? 's' : ''} indexé${count > 1 ? 's' : ''} dans la fiche`,
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!profile || !['admin', 'manager', 'advisor'].includes(profile.role)) return null;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !activeRequest && !preparedRequest && !ensure.isPending) ensure.mutate();
  };

  const chooseFiles = (selected: FileList | null) => {
    const next = Array.from(selected ?? []);
    const invalidType = next.find((file) => !acceptedMimeTypes.has(file.type));
    if (invalidType) {
      toast.error(`« ${invalidType.name} » n’est pas un PDF ou une photo acceptée.`);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    const tooLarge = next.find((file) => file.size <= 0 || file.size > maxBytes);
    if (tooLarge) {
      toast.error(`« ${tooLarge.name} » doit faire moins de 12 Mo.`);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    setFiles(next);
  };

  return (
    <section className="rounded-xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <FilePlus2 className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Indexer un document nous-mêmes</h3>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Ajoutez directement une pièce reçue par e-mail, papier ou téléphone. Elle sera classée et visible dans la fiche.
          </p>
        </div>
        <Button type="button" variant={open ? 'ghost' : 'outline'} className="shrink-0 rounded-full" onClick={toggle}>
          {open ? <X className="mr-1.5 h-4 w-4" /> : <UploadCloud className="mr-1.5 h-4 w-4" />}
          {open ? 'Fermer' : 'Indexer un document'}
        </Button>
      </div>

      {open && (
        <div className="mt-4 border-t border-primary/15 pt-4">
          {ensure.isError && !request ? (
            <div className="flex flex-col items-start gap-2 rounded-lg border border-destructive/25 bg-card p-3">
              <p className="text-sm font-medium text-destructive">Impossible de préparer l’indexation.</p>
              <Button type="button" size="sm" variant="outline" className="rounded-full" onClick={() => ensure.mutate()}>
                Réessayer
              </Button>
            </div>
          ) : ensure.isPending || !request ? (
            <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />Préparation de la fiche documentaire…
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium" htmlFor="staff-document-category">
                    Classer dans
                  </label>
                  <Select value={itemId} onValueChange={setItemId}>
                    <SelectTrigger id="staff-document-category" className="bg-card">
                      <SelectValue placeholder="Choisir une catégorie" />
                    </SelectTrigger>
                    <SelectContent>
                      {request.items.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.label}{item.required ? ' · obligatoire' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium" htmlFor="staff-document-files">
                    PDF ou photos
                  </label>
                  <input
                    ref={inputRef}
                    id="staff-document-files"
                    type="file"
                    multiple
                    accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"
                    className="block h-11 w-full cursor-pointer rounded-md border border-input bg-card px-3 py-2 text-sm file:mr-3 file:border-0 file:bg-transparent file:text-xs file:font-semibold file:text-primary md:h-9 md:py-1.5"
                    onChange={(event) => chooseFiles(event.currentTarget.files)}
                  />
                </div>
              </div>

              {files.length > 0 && (
                <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
                  {files.length} fichier{files.length > 1 ? 's' : ''} sélectionné{files.length > 1 ? 's' : ''} :{' '}
                  <span className="font-medium text-foreground">{files.map((file) => file.name).join(', ')}</span>
                </div>
              )}

              <div className="flex justify-end">
                <Button
                  type="button"
                  className="w-full rounded-full sm:w-auto"
                  disabled={!itemId || files.length === 0 || upload.isPending}
                  onClick={() => upload.mutate()}
                >
                  {upload.isPending
                    ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    : <UploadCloud className="mr-1.5 h-4 w-4" />}
                  Ajouter à la fiche
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
