import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  EyeOff,
  FileLock2,
  FileUp,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Undo2,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  createRedactedPdf,
  downloadRedactedPdf,
  MAX_DOCUMENT_PAGES,
  MAX_DOCUMENT_SIZE,
  releaseRenderedPages,
  renderSupplierDocument,
  type RedactionColor,
  type RedactionZone,
  type RenderedSupplierPage,
} from './price-redaction-service';

type Point = { x: number; y: number };
type DraftZone = Omit<RedactionZone, 'id' | 'pageNumber'>;

function formatBytes(value: number): string {
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} Ko`;
  return `${(value / (1024 * 1024)).toFixed(1)} Mo`;
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function rectangleBetween(start: Point, end: Point): DraftZone {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

function normalizedPoint(event: PointerEvent<HTMLDivElement>): Point {
  const rect = event.currentTarget.getBoundingClientRect();
  return {
    x: clamp((event.clientX - rect.left) / rect.width),
    y: clamp((event.clientY - rect.top) / rect.height),
  };
}

function zoneStyle(zone: DraftZone, color: RedactionColor) {
  return {
    left: `${zone.x * 100}%`,
    top: `${zone.y * 100}%`,
    width: `${zone.width * 100}%`,
    height: `${zone.height * 100}%`,
    backgroundColor: color === 'black' ? '#000000' : '#ffffff',
  };
}

export function SupplierRedactionPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragStartRef = useRef<Point | null>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [pages, setPages] = useState<RenderedSupplierPage[]>([]);
  const [pageNumber, setPageNumber] = useState(1);
  const [zones, setZones] = useState<RedactionZone[]>([]);
  const [draftZone, setDraftZone] = useState<DraftZone | null>(null);
  const [color, setColor] = useState<RedactionColor>('black');
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [draggingFile, setDraggingFile] = useState(false);

  useEffect(() => () => releaseRenderedPages(pages), [pages]);

  const currentPage = pages.find((page) => page.pageNumber === pageNumber) ?? null;
  const currentZones = useMemo(
    () => zones.filter((zone) => zone.pageNumber === pageNumber),
    [pageNumber, zones],
  );

  const resetDocument = () => {
    releaseRenderedPages(pages);
    setSourceFile(null);
    setPages([]);
    setZones([]);
    setPageNumber(1);
    setDraftZone(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const loadFile = async (file: File) => {
    setLoading(true);
    try {
      const rendered = await renderSupplierDocument(file);
      releaseRenderedPages(pages);
      setSourceFile(file);
      setPages(rendered);
      setZones([]);
      setPageNumber(1);
      toast.success(`${rendered.length} page${rendered.length > 1 ? 's' : ''} prête${rendered.length > 1 ? 's' : ''} à masquer`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible de lire ce document');
    } finally {
      setLoading(false);
      setDraggingFile(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void loadFile(file);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) void loadFile(file);
  };

  const startZone = (event: PointerEvent<HTMLDivElement>) => {
    if (!currentPage || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const start = normalizedPoint(event);
    dragStartRef.current = start;
    setDraftZone({ x: start.x, y: start.y, width: 0, height: 0 });
  };

  const moveZone = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;
    setDraftZone(rectangleBetween(dragStartRef.current, normalizedPoint(event)));
  };

  const finishZone = (event: PointerEvent<HTMLDivElement>) => {
    const start = dragStartRef.current;
    dragStartRef.current = null;
    if (!start) return;
    const zone = rectangleBetween(start, normalizedPoint(event));
    setDraftZone(null);
    if (zone.width < 0.006 || zone.height < 0.006) return;
    setZones((current) => [
      ...current,
      { ...zone, id: crypto.randomUUID(), pageNumber },
    ]);
  };

  const copyCurrentZonesToEveryPage = () => {
    if (currentZones.length === 0 || pages.length < 2) return;
    const copied = pages.flatMap((page) => currentZones.map((zone) => ({
      ...zone,
      id: crypto.randomUUID(),
      pageNumber: page.pageNumber,
    })));
    setZones(copied);
    toast.success('Les zones de cette page ont été copiées sur toutes les pages');
  };

  const exportDocument = async () => {
    if (!sourceFile) return;
    setExporting(true);
    try {
      const result = await createRedactedPdf(sourceFile.name, pages, zones, color);
      downloadRedactedPdf(result);
      toast.success('Copie sans prix téléchargée. Vérifiez-la avant envoi à l’expert.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible de créer le PDF');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader
        title="Masquer les prix"
        description="Préparez une copie fournisseur sécurisée avant de l’envoyer à l’expert"
        action={sourceFile ? (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="rounded-full" onClick={resetDocument}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Nouveau document
            </Button>
            <Button
              size="sm"
              className="rounded-full"
              disabled={zones.length === 0 || exporting}
              onClick={() => void exportDocument()}
            >
              {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Télécharger sans prix
            </Button>
          </div>
        ) : undefined}
      />

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={onFileChange}
      />

      {!sourceFile && (
        <div className="flex flex-1 overflow-y-auto p-4 sm:p-8">
          <div className="mx-auto flex w-full max-w-4xl flex-col justify-center">
            <div
              onDragEnter={(event) => { event.preventDefault(); setDraggingFile(true); }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setDraggingFile(false)}
              onDrop={onDrop}
              className={`rounded-3xl border-2 border-dashed p-8 text-center transition sm:p-14 ${
                draggingFile ? 'border-primary bg-primary/5' : 'border-border bg-card'
              }`}
            >
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                {loading ? <Loader2 className="h-8 w-8 animate-spin" /> : <FileUp className="h-8 w-8" />}
              </div>
              <h2 className="mt-5 text-xl font-semibold">Déposez la facture ou le bon de livraison</h2>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
                PDF, JPG, PNG ou WebP, jusqu’à {MAX_DOCUMENT_PAGES} pages et {formatBytes(MAX_DOCUMENT_SIZE)}.
                Le document reste dans votre navigateur et n’est pas enregistré dans le CRM.
              </p>
              <Button className="mt-6 rounded-full" disabled={loading} onClick={() => inputRef.current?.click()}>
                <FileUp className="mr-2 h-4 w-4" />
                Choisir un document
              </Button>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-3">
              <SecurityPoint icon={FileLock2} title="Original préservé" text="Une copie distincte est générée." />
              <SecurityPoint icon={EyeOff} title="Masquage définitif" text="Les prix sont brûlés dans l’image." />
              <SecurityPoint icon={ShieldCheck} title="Traitement local" text="Aucun document n’est envoyé au serveur." />
            </div>
          </div>
        </div>
      )}

      {sourceFile && currentPage && (
        <div className="grid min-h-0 flex-1 xl:grid-cols-[290px_minmax(0,1fr)]">
          <aside className="order-2 overflow-y-auto border-t border-border bg-card p-4 scrollbar-thin xl:order-1 xl:border-r xl:border-t-0">
            <div className="flex items-start gap-3 rounded-xl border border-border bg-background p-3">
              <FileLock2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{sourceFile.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {pages.length} page{pages.length > 1 ? 's' : ''} · {formatBytes(sourceFile.size)}
                </p>
              </div>
            </div>

            <ControlSection title="1. Page">
              <div className="grid grid-cols-5 gap-2 xl:grid-cols-4">
                {pages.map((page) => {
                  const count = zones.filter((zone) => zone.pageNumber === page.pageNumber).length;
                  return (
                    <button
                      key={page.pageNumber}
                      type="button"
                      onClick={() => setPageNumber(page.pageNumber)}
                      className={`relative min-h-11 rounded-lg border text-sm font-semibold transition ${
                        page.pageNumber === pageNumber
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-background hover:bg-muted'
                      }`}
                    >
                      {page.pageNumber}
                      {count > 0 && (
                        <span className="absolute -right-1 -top-1 rounded-full bg-primary px-1.5 py-0.5 text-[9px] text-primary-foreground">
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </ControlSection>

            <ControlSection title="2. Style du masque">
              <div className="grid grid-cols-2 gap-2">
                <ColorButton active={color === 'black'} color="black" label="Noir" onClick={() => setColor('black')} />
                <ColorButton active={color === 'white'} color="white" label="Blanc" onClick={() => setColor('white')} />
              </div>
            </ControlSection>

            <ControlSection title={`3. Zones masquées (${zones.length})`}>
              {currentZones.length === 0 ? (
                <p className="rounded-lg bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
                  Sur le document, glissez avec la souris ou le doigt autour des prix, remises, montants et totaux.
                </p>
              ) : (
                <div className="space-y-2">
                  {currentZones.map((zone, index) => (
                    <div key={zone.id} className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2">
                      <span className="text-xs font-medium">Zone {index + 1}</span>
                      <button
                        type="button"
                        className="rounded-md p-1 text-muted-foreground hover:bg-urgent-soft hover:text-urgent"
                        onClick={() => setZones((current) => current.filter((item) => item.id !== zone.id))}
                        aria-label={`Supprimer la zone ${index + 1}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-3 grid gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="justify-start rounded-lg"
                  disabled={zones.length === 0}
                  onClick={() => setZones((current) => current.slice(0, -1))}
                >
                  <Undo2 className="mr-2 h-4 w-4" />
                  Annuler la dernière zone
                </Button>
                {pages.length > 1 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="justify-start rounded-lg"
                    disabled={currentZones.length === 0}
                    onClick={copyCurrentZonesToEveryPage}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Copier sur toutes les pages
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-start rounded-lg text-muted-foreground"
                  disabled={zones.length === 0}
                  onClick={() => setZones([])}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Effacer tous les masques
                </Button>
              </div>
            </ControlSection>

            <Alert className="mt-5 border-due/30 bg-due-soft/50">
              <AlertTriangle className="h-4 w-4 text-due" />
              <AlertTitle>À vérifier avant l’envoi</AlertTitle>
              <AlertDescription className="text-xs leading-relaxed">
                Masquez Prix brut, Remise, Prix net, Montant, TVA, Total et les conditions de règlement si elles révèlent un prix.
              </AlertDescription>
            </Alert>
          </aside>

          <main className="order-1 min-h-0 overflow-auto bg-muted/35 p-3 scrollbar-thin sm:p-6 xl:order-2">
            <div className="mx-auto flex min-h-full max-w-5xl items-start justify-center">
              <div
                className="relative inline-block max-w-full cursor-crosshair touch-none select-none overflow-hidden bg-white shadow-xl ring-1 ring-border"
                onPointerDown={startZone}
                onPointerMove={moveZone}
                onPointerUp={finishZone}
                onPointerCancel={() => { dragStartRef.current = null; setDraftZone(null); }}
                aria-label="Document à masquer"
              >
                <img
                  src={currentPage.previewUrl}
                  alt={`Page ${currentPage.pageNumber} du document fournisseur`}
                  className="block max-h-[calc(100vh-15rem)] max-w-full object-contain"
                  draggable={false}
                />
                <div className="pointer-events-none absolute inset-0">
                  {currentZones.map((zone, index) => (
                    <div
                      key={zone.id}
                      style={zoneStyle(zone, color)}
                      className={`absolute ${color === 'white' ? 'outline outline-2 outline-dashed outline-urgent' : ''}`}
                    >
                      <span className={`absolute left-1 top-1 rounded px-1 text-[9px] font-bold ${color === 'black' ? 'bg-white/90 text-black' : 'bg-urgent text-white'}`}>
                        {index + 1}
                      </span>
                    </div>
                  ))}
                  {draftZone && (
                    <div
                      style={zoneStyle(draftZone, color)}
                      className="absolute opacity-80 outline outline-2 outline-dashed outline-primary"
                    />
                  )}
                </div>
              </div>
            </div>
          </main>
        </div>
      )}

      {sourceFile && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-done" />
            Le PDF final sera aplati : les prix masqués ne pourront pas être récupérés.
          </div>
          <Button
            className="w-full rounded-full sm:w-auto"
            disabled={zones.length === 0 || exporting}
            onClick={() => void exportDocument()}
          >
            {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Télécharger la copie sans prix
          </Button>
        </div>
      )}
    </div>
  );
}

function SecurityPoint({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof ShieldCheck;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <Icon className="h-5 w-5 text-primary" />
      <p className="mt-3 text-sm font-semibold">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{text}</p>
    </div>
  );
}

function ControlSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-5">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

function ColorButton({
  active,
  color,
  label,
  onClick,
}: {
  active: boolean;
  color: RedactionColor;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition ${
        active ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background hover:bg-muted'
      }`}
    >
      <span className={`h-5 w-5 rounded border ${color === 'black' ? 'border-black bg-black' : 'border-border bg-white'}`} />
      {label}
    </button>
  );
}
