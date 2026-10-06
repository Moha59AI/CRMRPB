import { useMemo, useState } from 'react';
import { Eye, EyeOff, FileText, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { buildEmailHtmlDocument } from './email-html-security';

type EmailHtmlViewerProps = {
  html: string | null;
  text: string | null;
  subject: string | null;
};

export function EmailHtmlViewer({ html, text, subject }: EmailHtmlViewerProps) {
  const [showText, setShowText] = useState(false);
  const [allowRemoteImages, setAllowRemoteImages] = useState(false);
  const srcDoc = useMemo(
    () => html ? buildEmailHtmlDocument(html, allowRemoteImages) : '',
    [html, allowRemoteImages],
  );

  if (!html || showText) {
    // Le corps d'un message n'est pas un objet pose sur la page : c'est la
    // page. Gmail ne l'encadre pas, et le cadre coutait ici 48 px de marges
    // autour d'un texte souvent court.
    return (
      <div className="mt-4 min-h-32">
        {html && (
          <div className="mb-3 flex justify-end">
            <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => setShowText(false)}>
              <Eye className="mr-2 h-4 w-4" />
              Voir la mise en forme
            </Button>
          </div>
        )}
        <div className="whitespace-pre-wrap break-words text-sm leading-7 text-foreground">
          {text || 'Aucun contenu texte n’a été fourni avec cet email.'}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-col gap-2 border-b border-border px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:px-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <FileText className="h-4 w-4 text-primary" />
          Mise en forme originale sécurisée
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={() => setAllowRemoteImages((value) => !value)}
          >
            {allowRemoteImages ? <EyeOff className="mr-2 h-4 w-4" /> : <ImageIcon className="mr-2 h-4 w-4" />}
            {allowRemoteImages ? 'Bloquer les images externes' : 'Afficher les images externes'}
          </Button>
          <Button type="button" variant="ghost" size="sm" className="rounded-full" onClick={() => setShowText(true)}>
            Version texte
          </Button>
        </div>
      </div>
      <iframe
        title={`Contenu de l’email ${subject || 'sans objet'}`}
        sandbox=""
        referrerPolicy="no-referrer"
        srcDoc={srcDoc}
        className="h-[60dvh] min-h-[360px] w-full bg-white"
      />
    </div>
  );
}
