// Ouvrir le PDF d'une facture depuis le CRM
//
// Le document reste celui d'Onify : le CRM n'en fabrique pas un second, qui
// porterait un autre numero et d'autres mentions. Une facture saisie dans le
// CRM n'a donc pas de PDF, et le bouton ne s'affiche pas.
//
// La premiere version ouvrait un onglet pendant le clic puis y poussait le
// fichier. Quand le navigateur bloque les fenetres surgissantes -- ce qui est
// le reglage par defaut sur beaucoup de postes -- elle basculait sur un
// telechargement silencieux : le fichier arrivait dans le dossier
// Telechargements, et a l'ecran il ne se passait rien. Le PDF s'affiche
// desormais dans le CRM, sans fenetre a autoriser.

import { useEffect, useState } from 'react';
import { Download, ExternalLink, FileText, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  fetchFacturePdf, lienFactureOnify, televerserPdfFacture,
} from '@/services/billing-service';
import { useQueryClient } from '@tanstack/react-query';
import type { Invoice } from '@/types';

type FactureOuvrable = Pick<Invoice, 'id' | 'invoice_number' | 'source_system' | 'onify_invoice_id' | 'onify_pdf_path'>;

function nomFichier(numero: string): string {
  return `${numero.replace(/[^A-Za-z0-9._-]/g, '-')}.pdf`;
}

/**
 * Le PDF, affiche dans le CRM.
 *
 * L'URL d'objet est liberee a la fermeture : sans cela chaque ouverture
 * laisse le fichier en memoire pour toute la duree de la session.
 */
export function VisionneusePdf({ facture, url, onFermer }: {
  facture: FactureOuvrable;
  url: string;
  onFermer: () => void;
}) {
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  const telecharger = () => {
    const lien = document.createElement('a');
    lien.href = url;
    lien.download = nomFichier(facture.invoice_number);
    document.body.appendChild(lien);
    lien.click();
    lien.remove();
  };

  return (
    <Dialog open onOpenChange={(ouvert) => { if (!ouvert) onFermer(); }}>
      <DialogContent className="flex h-[88vh] max-w-5xl flex-col gap-3 p-4 sm:p-5">
        <DialogHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0 pr-8">
          <DialogTitle className="text-base">
            Facture {facture.invoice_number}
          </DialogTitle>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="rounded-full" onClick={telecharger}>
              <Download className="mr-1.5 h-3.5 w-3.5" />Télécharger
            </Button>
            <Button
              variant="outline" size="sm" className="rounded-full"
              onClick={() => window.open(url, '_blank', 'noopener')}
            >
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />Nouvel onglet
            </Button>
          </div>
        </DialogHeader>

        <iframe
          src={url}
          title={`Facture ${facture.invoice_number}`}
          className="min-h-0 flex-1 rounded-lg border border-border bg-surface"
        />
      </DialogContent>
    </Dialog>
  );
}

/**
 * Charge le PDF d'une facture et l'affiche.
 *
 * Expose aussi le declencheur, pour qu'une ligne de tableau entiere puisse
 * ouvrir la facture : cliquer la ligne est le geste naturel, et il ne faisait
 * rien.
 */
export function usePdfFacture(facture: FactureOuvrable) {
  const [enCours, setEnCours] = useState(false);
  const [url, setUrl] = useState<string | null>(null);

  const ouvrir = async () => {
    if (enCours || url) return;
    setEnCours(true);
    try {
      setUrl(URL.createObjectURL(await fetchFacturePdf(facture.id)));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'PDF inaccessible');
    } finally {
      setEnCours(false);
    }
  };

  const visionneuse = url
    ? <VisionneusePdf facture={facture} url={url} onFermer={() => setUrl(null)} />
    : null;

  return {
    ouvrir,
    enCours,
    visionneuse,
    disponible: Boolean(facture.onify_invoice_id || facture.source_system === 'reseau_glass'),
  };
}

/**
 * Deposer le document quand Onify ne le donne plus.
 *
 * Leur API renvoie 404 sur le lien qu'elle fournit, et leur politique CORS
 * interdit au CRM de lire la page ou le navigateur, lui, y accede. Ouvrir
 * chez eux puis deposer ici reste le seul chemin qui ne depende de personne.
 */
function ActionsSansPdf({ facture }: { facture: FactureOuvrable }) {
  const [depot, setDepot] = useState(false);
  const queryClient = useQueryClient();

  const deposer = async (fichier: File | undefined) => {
    if (!fichier) return;
    setDepot(true);
    try {
      await televerserPdfFacture(facture, fichier);
      toast.success(`Facture ${facture.invoice_number} enregistrée dans le CRM`);
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['client-facturation'] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Dépôt impossible');
    } finally {
      setDepot(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-1.5">
      {facture.onify_invoice_id && (
        <Button
          size="sm" variant="ghost" className="rounded-full"
          onClick={(e) => {
            e.stopPropagation();
            window.open(lienFactureOnify(String(facture.onify_invoice_id)), '_blank', 'noopener');
          }}
          title="Ouvrir la facture dans Onify, où votre session fait foi"
        >
          <ExternalLink className="mr-1.5 h-3.5 w-3.5" />Onify
        </Button>
      )}
      <Button
        asChild size="sm" variant="outline" className="rounded-full"
        disabled={depot}
      >
        <label onClick={(e) => e.stopPropagation()}>
          {depot
            ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            : <Upload className="mr-1.5 h-3.5 w-3.5" />}
          Joindre
          <input
            type="file" accept="application/pdf" className="sr-only"
            onChange={(e) => { void deposer(e.target.files?.[0]); e.target.value = ''; }}
          />
        </label>
      </Button>
    </span>
  );
}

export function BoutonPdfFacture({ facture }: { facture: FactureOuvrable }) {
  const { ouvrir, enCours, visionneuse, disponible } = usePdfFacture(facture);
  if (!disponible) return null;

  // Sans document conserve, proposer les deux gestes qui en produisent un,
  // plutot qu'un bouton qui echouera.
  if (!facture.onify_pdf_path) return <ActionsSansPdf facture={facture} />;

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="rounded-full"
        disabled={enCours}
        onClick={(e) => { e.stopPropagation(); void ouvrir(); }}
        title={`Ouvrir le PDF de la facture ${facture.invoice_number}`}
      >
        {enCours
          ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          : <FileText className="mr-1.5 h-3.5 w-3.5" />}
        PDF
      </Button>
      {visionneuse}
    </>
  );
}
