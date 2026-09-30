// Ouvrir le PDF d'une facture depuis le CRM
//
// Le document reste celui d'Onify : le CRM n'en fabrique pas un second, qui
// porterait un autre numero et d'autres mentions. Une facture saisie dans le
// CRM n'a donc pas de PDF, et le bouton ne s'affiche pas.

import { useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { fetchFacturePdf } from '@/services/billing-service';
import type { Invoice } from '@/types';

interface BoutonPdfFactureProps {
  facture: Pick<Invoice, 'id' | 'invoice_number' | 'onify_invoice_id'>;
}

export function BoutonPdfFacture({ facture }: BoutonPdfFactureProps) {
  const [enCours, setEnCours] = useState(false);
  if (!facture.onify_invoice_id) return null;

  const ouvrir = async () => {
    if (enCours) return;
    setEnCours(true);

    // L'onglet s'ouvre pendant le clic. Ouvert apres l'attente reseau, il
    // serait pris pour une fenetre surgissante et bloque.
    const onglet = window.open('', '_blank');

    try {
      const pdf = await fetchFacturePdf(facture.id);
      const url = URL.createObjectURL(pdf);

      if (onglet && !onglet.closed) {
        onglet.location.href = url;
        return;
      }

      // Fenetres bloquees : on telecharge, le fichier reste accessible.
      const lien = document.createElement('a');
      lien.href = url;
      lien.download = `${facture.invoice_number.replace(/[^A-Za-z0-9._-]/g, '-')}.pdf`;
      document.body.appendChild(lien);
      lien.click();
      lien.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      onglet?.close();
      toast.error(error instanceof Error ? error.message : 'PDF inaccessible');
    } finally {
      setEnCours(false);
    }
  };

  return (
    <Button
      size="sm"
      variant="ghost"
      className="rounded-full"
      disabled={enCours}
      onClick={ouvrir}
      title={`Ouvrir le PDF de la facture ${facture.invoice_number}`}
    >
      {enCours
        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
        : <FileText className="h-3.5 w-3.5" />}
      <span className="sr-only">Ouvrir le PDF</span>
    </Button>
  );
}
