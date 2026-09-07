import { useEffect, useMemo, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle, Camera, CarFront, Check, CheckCircle2, ExternalLink,
  FileCheck2, FileSignature, FileText, Gift, IdCard, Loader2,
  LockKeyhole, ShieldCheck, Smartphone, UploadCloud,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import {
  fetchClientDocumentSession, uploadClientDocument,
  type ClientDocumentItem, type ClientDocumentSession,
} from '@/services/client-documents-service';

const maxBytes = 12 * 1024 * 1024;
const accepted = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

const previewSession: ClientDocumentSession = {
  client_first_name: 'Mohamed',
  selected_offer: 'Nintendo Switch OLED',
  request_status: 'open',
  expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
  submitted_at: null,
  items: [
    { id: 'preview-registration', document_type: 'registration', label: 'Carte grise', required: true, status: 'uploaded', original_name: 'carte-grise.pdf', mime_type: 'application/pdf', size_bytes: 842_000, uploaded_at: new Date().toISOString(), rejection_reason: null, preview_url: null },
    { id: 'preview-insurance', document_type: 'insurance_cert', label: 'Attestation d’assurance', required: true, status: 'requested', original_name: null, mime_type: null, size_bytes: null, uploaded_at: null, rejection_reason: null, preview_url: null },
    { id: 'preview-photo', document_type: 'photo_windscreen', label: 'Photo du pare-brise', required: false, status: 'requested', original_name: null, mime_type: null, size_bytes: null, uploaded_at: null, rejection_reason: null, preview_url: null },
    { id: 'preview-claim', document_type: 'claim_declaration', label: 'Déclaration de sinistre', required: false, status: 'requested', original_name: null, mime_type: null, size_bytes: null, uploaded_at: null, rejection_reason: null, preview_url: null },
  ],
};

function formatSize(bytes: number | null): string {
  if (!bytes) return '';
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} Ko`
    : `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`;
}

export function ClientDocumentsPage() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const token = params.get('token') ?? '';
  const preview = import.meta.env.DEV && params.get('preview') === '1';
  const queryClient = useQueryClient();

  useEffect(() => {
    document.title = 'Mes documents — Relais Pare-Brise';
  }, []);

  const session = useQuery({
    queryKey: ['client-document-session', token],
    queryFn: () => fetchClientDocumentSession(token),
    enabled: !preview && /^[0-9a-f]{64}$/.test(token),
    retry: false,
  });

  const upload = useMutation({
    mutationFn: ({ item, file }: { item: ClientDocumentItem; file: File }) => {
      if (!accepted.includes(file.type)) throw new Error('Utilisez un PDF ou une photo (JPG, PNG, WEBP ou HEIC).');
      if (file.size > maxBytes) throw new Error('Le fichier dépasse 12 Mo.');
      return uploadClientDocument(token, item.id, file);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['client-document-session', token] }),
  });

  if (!token && !preview) return <PortalMessage title="Lien nécessaire" detail="Ouvrez le lien privé reçu par SMS. Si vous ne l’avez plus, contactez Relais Pare-Brise pour en recevoir un nouveau." />;
  if (!preview && session.isLoading) return <PortalMessage loading title="Ouverture de votre espace" detail="Nous vérifions votre lien sécurisé…" />;
  if (!preview && (session.isError || !session.data)) return <PortalMessage error title="Lien indisponible" detail="Ce lien est invalide, expiré ou a été remplacé. Demandez un nouveau lien à Relais Pare-Brise." />;

  const data = preview ? previewSession : session.data as ClientDocumentSession;

  const required = data.items.filter((item) => item.required);
  const uploadedCount = required.filter((item) => ['uploaded', 'validated'].includes(item.status)).length;
  const progress = required.length ? Math.round((uploadedCount / required.length) * 100) : 100;
  const complete = data.request_status === 'complete' || progress === 100;

  return (
    <div className="min-h-screen bg-[hsl(var(--surface))] text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4 sm:px-6">
          <img src="/icon-192.png" alt="Relais Pare-Brise" className="h-10 w-10 rounded-xl" />
          <div>
            <p className="text-sm font-semibold">Relais Pare-Brise</p>
            <p className="text-xs text-muted-foreground">Espace client sécurisé</p>
          </div>
          <LockKeyhole className="ml-auto h-4 w-4 text-done" />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <section className="mb-6 grid overflow-hidden rounded-xl border border-border bg-card shadow-sm sm:grid-cols-[minmax(0,1fr)_230px]">
          <div className="p-5 sm:p-7">
            <p className="text-sm font-medium text-primary">
              Bonjour{data.client_first_name ? ` ${data.client_first_name}` : ''},
            </p>
            <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Ajoutez les pièces de votre dossier</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
              Prenez une photo nette ou choisissez un PDF. Vous pouvez remplacer un document tant que nécessaire.
            </p>
            <div className="mt-5 flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><Smartphone className="h-4 w-4 text-primary" />Depuis votre téléphone</span>
              <span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-primary" />Envoi sécurisé</span>
            </div>
          </div>
          <div className="relative hidden min-h-52 overflow-hidden border-l border-border bg-muted/60 sm:block" aria-hidden="true">
            <div className="absolute left-7 top-7 flex h-24 w-40 items-center justify-center rounded-2xl border border-border bg-card shadow-md">
              <CarFront className="h-12 w-12 text-primary" strokeWidth={1.5} />
            </div>
            <div className="absolute bottom-6 left-5 flex h-20 w-16 -rotate-6 items-center justify-center rounded-xl border border-border bg-card shadow-md">
              <IdCard className="h-8 w-8 text-upcoming" strokeWidth={1.5} />
            </div>
            <div className="absolute bottom-5 right-5 flex h-24 w-20 rotate-6 items-center justify-center rounded-xl border border-primary/25 bg-accent shadow-md">
              <FileCheck2 className="h-9 w-9 text-primary" strokeWidth={1.5} />
            </div>
          </div>
        </section>

        {data.selected_offer && (
          <section className="mb-6 flex items-center gap-4 overflow-hidden rounded-xl border border-primary/25 bg-accent p-4 sm:p-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Gift className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">Votre cadeau est réservé</p>
              <p className="mt-1 text-base font-semibold text-foreground">{data.selected_offer}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Votre choix est bien enregistré. Le dépôt des pièces nous permet de poursuivre votre dossier sans perdre cet avantage.
              </p>
            </div>
            <div className="ml-auto hidden h-20 w-20 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-card shadow-sm sm:flex" aria-hidden="true">
              <Gift className="h-10 w-10 text-primary" strokeWidth={1.4} />
            </div>
          </section>
        )}

        <section className={cn(
          'mb-6 rounded-xl border p-4',
          complete ? 'border-done/30 bg-done-soft' : 'border-border bg-card',
        )}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">{complete ? 'Pièces obligatoires reçues' : 'Avancement du dossier'}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{uploadedCount} sur {required.length} pièce{required.length > 1 ? 's' : ''}</p>
            </div>
            {complete ? <CheckCircle2 className="h-6 w-6 text-done" /> : <span className="text-sm font-semibold tabular">{progress}%</span>}
          </div>
          <Progress value={progress} className="mt-3" />
        </section>

        {upload.isError && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {(upload.error as Error).message}
          </div>
        )}

        <div className="space-y-3">
          {data.items.map((item) => (
            <DocumentUploadCard
              key={item.id}
              item={item as ClientDocumentItem}
              pending={upload.isPending && upload.variables?.item.id === item.id}
              onFile={(file) => upload.mutate({ item: item as ClientDocumentItem, file })}
              preview={preview}
            />
          ))}
        </div>

        <div className="mt-8 flex items-start gap-2 border-t border-border pt-5 text-xs leading-5 text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-done" />
          Vos documents sont chiffrés pendant le transfert et conservés dans un espace privé. Ils sont accessibles uniquement à l’équipe qui traite votre dossier.
        </div>
      </main>
    </div>
  );
}

function DocumentUploadCard({
  item, pending, onFile, preview,
}: {
  item: ClientDocumentItem;
  pending: boolean;
  onFile: (file: File) => void;
  preview: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const received = ['uploaded', 'validated'].includes(item.status);
  const DocumentIcon = item.document_type === 'registration' ? IdCard
    : item.document_type === 'insurance_cert' ? ShieldCheck
      : item.document_type === 'photo_windscreen' ? Camera
        : item.document_type === 'claim_declaration' ? FileSignature
          : FileText;

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex items-start gap-3">
        <div className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
          received ? 'bg-done-soft text-done' : 'bg-muted text-muted-foreground',
        )}>
          {received ? <Check className="h-5 w-5" /> : <DocumentIcon className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold">{item.label}</h2>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {item.required ? 'Obligatoire' : 'Si disponible'}
            </span>
          </div>
          {received ? (
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {item.original_name} {item.size_bytes ? `· ${formatSize(item.size_bytes)}` : ''}
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">PDF ou photo, 12 Mo maximum</p>
          )}
          {item.status === 'rejected' && item.rejection_reason && (
            <p className="mt-2 text-xs font-medium text-destructive">À remplacer : {item.rejection_reason}</p>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <input
          ref={input}
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onFile(file);
            event.target.value = '';
          }}
        />
        <Button className="rounded-full" disabled={pending || preview} onClick={() => input.current?.click()}>
          {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
          {pending ? 'Envoi en cours…' : received ? 'Remplacer' : 'Ajouter le document'}
        </Button>
        {received && item.preview_url && (
          <Button variant="outline" className="rounded-full" asChild>
            <a href={item.preview_url} target="_blank" rel="noreferrer">
              Voir <ExternalLink className="ml-2 h-3.5 w-3.5" />
            </a>
          </Button>
        )}
      </div>
    </section>
  );
}

function PortalMessage({
  title, detail, loading = false, error = false,
}: {
  title: string;
  detail: string;
  loading?: boolean;
  error?: boolean;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[hsl(var(--surface))] px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-7 text-center shadow-md">
        <img src="/icon-192.png" alt="Relais Pare-Brise" className="mx-auto h-14 w-14 rounded-2xl" />
        <div className={cn('mx-auto mt-5 flex h-10 w-10 items-center justify-center rounded-full', error ? 'bg-destructive/10 text-destructive' : 'bg-done-soft text-done')}>
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : error ? <AlertCircle className="h-5 w-5" /> : <LockKeyhole className="h-5 w-5" />}
        </div>
        <h1 className="mt-4 text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p>
        {!loading && (
          <a className="mt-5 inline-block text-sm font-medium text-primary hover:underline" href="https://relaisparebrise.fr/contact">
            Contacter Relais Pare-Brise
          </a>
        )}
      </div>
    </div>
  );
}
