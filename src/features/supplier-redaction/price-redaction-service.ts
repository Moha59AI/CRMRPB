import { PDFDocument } from 'pdf-lib';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export const MAX_DOCUMENT_SIZE = 25 * 1024 * 1024;
export const MAX_DOCUMENT_PAGES = 30;
const TARGET_RENDER_WIDTH = 1800;
const MIN_RENDER_SCALE = 1.5;
const MAX_RENDER_SCALE = 2.5;

const acceptedMimeTypes = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export type RedactionColor = 'black' | 'white';

export interface RedactionZone {
  id: string;
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RenderedSupplierPage {
  pageNumber: number;
  sourceBlob: Blob;
  previewUrl: string;
  width: number;
  height: number;
  pdfWidth: number;
  pdfHeight: number;
}

export interface RedactedPdfResult {
  blob: Blob;
  filename: string;
}

function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/jpeg', quality = 0.96): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Impossible de préparer la page du document'));
    }, type, quality);
  });
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

async function renderPdf(file: File): Promise<RenderedSupplierPage[]> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const loadingTask = getDocument({ data: bytes });
  const pdf = await loadingTask.promise;

  if (pdf.numPages > MAX_DOCUMENT_PAGES) {
    await loadingTask.destroy();
    throw new Error(`Le document dépasse la limite de ${MAX_DOCUMENT_PAGES} pages`);
  }

  const pages: RenderedSupplierPage[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = Math.min(
        MAX_RENDER_SCALE,
        Math.max(MIN_RENDER_SCALE, TARGET_RENDER_WIDTH / baseViewport.width),
      );
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(viewport.width, viewport.height);
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('Prévisualisation PDF indisponible sur ce navigateur');

      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      const sourceBlob = await canvasToBlob(canvas);
      pages.push({
        pageNumber,
        sourceBlob,
        previewUrl: URL.createObjectURL(sourceBlob),
        width: canvas.width,
        height: canvas.height,
        pdfWidth: baseViewport.width,
        pdfHeight: baseViewport.height,
      });
      page.cleanup();
      canvas.width = 1;
      canvas.height = 1;
    }
  } catch (error) {
    releaseRenderedPages(pages);
    throw error;
  } finally {
    await loadingTask.destroy();
  }
  return pages;
}

async function renderImage(file: File): Promise<RenderedSupplierPage[]> {
  const image = await createImageBitmap(file);
  try {
    const scale = Math.min(1, TARGET_RENDER_WIDTH / image.width);
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Prévisualisation indisponible sur ce navigateur');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const sourceBlob = await canvasToBlob(canvas);
    const page = {
      pageNumber: 1,
      sourceBlob,
      previewUrl: URL.createObjectURL(sourceBlob),
      width: canvas.width,
      height: canvas.height,
      pdfWidth: canvas.width * 0.5,
      pdfHeight: canvas.height * 0.5,
    };
    canvas.width = 1;
    canvas.height = 1;
    return [page];
  } finally {
    image.close();
  }
}

export async function renderSupplierDocument(file: File): Promise<RenderedSupplierPage[]> {
  if (!acceptedMimeTypes.has(file.type)) {
    throw new Error('Format refusé. Utilisez un PDF, JPG, PNG ou WebP');
  }
  if (file.size > MAX_DOCUMENT_SIZE) {
    throw new Error('Le document dépasse la limite de 25 Mo');
  }
  return file.type === 'application/pdf' ? renderPdf(file) : renderImage(file);
}

export function releaseRenderedPages(pages: RenderedSupplierPage[]): void {
  pages.forEach((page) => URL.revokeObjectURL(page.previewUrl));
}

async function burnRedactions(
  page: RenderedSupplierPage,
  zones: RedactionZone[],
  color: RedactionColor,
): Promise<Blob> {
  const image = await createImageBitmap(page.sourceBlob);
  try {
    const canvas = createCanvas(page.width, page.height);
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Export PDF indisponible sur ce navigateur');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    context.fillStyle = color === 'black' ? '#000000' : '#ffffff';
    zones.forEach((zone) => {
      context.fillRect(
        zone.x * canvas.width,
        zone.y * canvas.height,
        zone.width * canvas.width,
        zone.height * canvas.height,
      );
    });
    const blob = await canvasToBlob(canvas);
    canvas.width = 1;
    canvas.height = 1;
    return blob;
  } finally {
    image.close();
  }
}

function outputFilename(sourceName: string): string {
  const base = sourceName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9À-ÿ_-]+/g, '-').replace(/-+/g, '-');
  return `${base || 'document-fournisseur'}-sans-prix.pdf`;
}

/**
 * Reconstruit un PDF neuf uniquement avec des images aplaties. Le texte et les
 * objets du fournisseur ne sont jamais copies dans le document exporte.
 */
export async function createRedactedPdf(
  sourceName: string,
  pages: RenderedSupplierPage[],
  zones: RedactionZone[],
  color: RedactionColor,
): Promise<RedactedPdfResult> {
  if (pages.length === 0) throw new Error('Aucune page à exporter');
  if (zones.length === 0) throw new Error('Dessinez au moins une zone à masquer');

  const output = await PDFDocument.create();
  output.setTitle('Document fournisseur sans prix');
  output.setSubject('Copie aplatie pour expertise');
  output.setCreator('CRM Relais Pare-Brise');
  output.setProducer('CRM Relais Pare-Brise');

  for (const page of pages) {
    const pageZones = zones.filter((zone) => zone.pageNumber === page.pageNumber);
    const redactedBlob = await burnRedactions(page, pageZones, color);
    const redactedImage = await output.embedJpg(await redactedBlob.arrayBuffer());
    const outputPage = output.addPage([page.pdfWidth, page.pdfHeight]);
    outputPage.drawImage(redactedImage, {
      x: 0,
      y: 0,
      width: page.pdfWidth,
      height: page.pdfHeight,
    });
  }

  const bytes = await output.save({ useObjectStreams: true });
  return {
    blob: new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }),
    filename: outputFilename(sourceName),
  };
}

export function downloadRedactedPdf(result: RedactedPdfResult): void {
  const url = URL.createObjectURL(result.blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = result.filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
