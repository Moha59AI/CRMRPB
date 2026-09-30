// Ce qui a ete facture a un client
//
// La facturation vit dans Onify. Le CRM en garde une copie synchronisee :
// montants, lignes, vehicule, reglements. Cet onglet la restitue la ou on se
// pose la question -- devant le client, au telephone -- sans changer d'outil.
//
// Le detail affiche ici vient de la facture Onify elle-meme. Le PDF qu'on
// ouvre est le document d'origine, pas une reconstitution.

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, FileText, Receipt, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { BoutonPdfFacture } from './bouton-pdf-facture';
import { fetchFacturationClient } from '@/services/billing-service';
import type { Invoice, InvoiceStatus, OnifyCreditNote, Payment } from '@/types';

const euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });

function montant(valeur: number | null | undefined): string {
  if (valeur == null) return '—';
  return euro.format(valeur);
}

function jour(date: string | null | undefined): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

const LIBELLE_STATUT: Record<InvoiceStatus, string> = {
  draft: 'Brouillon', sent: 'Envoyée', paid: 'Payée',
  partial: 'Partielle', overdue: 'En retard', cancelled: 'Annulée',
};

function couleurStatut(statut: InvoiceStatus): string {
  if (statut === 'paid') return 'border-success/25 bg-success-soft text-success';
  if (statut === 'overdue') return 'border-urgent/25 bg-urgent-soft text-urgent';
  if (statut === 'cancelled') return 'border-border bg-muted text-muted-foreground';
  return 'border-border bg-muted/60 text-foreground';
}

// ── Lecture du contenu Onify ──────────────────────────────────────────────
//
// `onify_payload` est un JSON libre : on ne lit que ce dont on a besoin, et
// une facture dont le contenu change de forme s'affiche sans son detail
// plutot que de faire tomber l'onglet.

interface LigneFacture {
  nom: string;
  description: string | null;
  quantite: number;
  unite: string | null;
  prixUnitaire: number;
  totalHt: number;
  tva: number;
}

interface VehiculeFacture {
  designation: string | null;
  immatriculation: string | null;
}

function nombre(valeur: unknown): number {
  const converti = Number(valeur);
  return Number.isFinite(converti) ? converti : 0;
}

function texte(valeur: unknown): string | null {
  return typeof valeur === 'string' && valeur.trim() ? valeur.trim() : null;
}

function lignesDe(facture: Invoice): LigneFacture[] {
  const brutes = facture.onify_payload?.lines;
  if (!Array.isArray(brutes)) return [];

  return brutes.flatMap((brute) => {
    if (!brute || typeof brute !== 'object') return [];
    const ligne = brute as Record<string, unknown>;
    const nom = texte(ligne.name);
    if (!nom) return [];
    return [{
      nom,
      description: texte(ligne.description),
      quantite: nombre(ligne.quantity),
      unite: texte(ligne.unit),
      prixUnitaire: nombre(ligne.unit_price),
      totalHt: nombre(ligne.line_total_ht),
      tva: nombre(ligne.vat_rate),
    }];
  });
}

function vehiculeDe(facture: Invoice): VehiculeFacture | null {
  const brut = facture.onify_payload?.vehicle;
  if (!brut || typeof brut !== 'object') return null;
  const vehicule = brut as Record<string, unknown>;
  const designation = texte(vehicule.brand_model)
    ?? texte([texte(vehicule.brand), texte(vehicule.model)].filter(Boolean).join(' '));
  const immatriculation = texte(vehicule.immat);
  if (!designation && !immatriculation) return null;
  return { designation, immatriculation };
}

function objetDe(facture: Invoice): string | null {
  return texte(facture.onify_payload?.object);
}

// ── Panneau ───────────────────────────────────────────────────────────────

interface FacturationClientProps {
  contactId: string;
  /**
   * Plaque de l'intervention d'ou l'on vient.
   *
   * Depuis une fiche lead, une seule facture interesse : celle de ce
   * vehicule. Elle remonte en tete et s'ouvre deja.
   */
  plaque?: string | null;
}

function memePlaque(a: string | null | undefined, b: string | null | undefined): boolean {
  const propre = (valeur: string | null | undefined) =>
    (valeur ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const gauche = propre(a);
  return gauche.length >= 5 && gauche === propre(b);
}

export function FacturationClient({ contactId, plaque }: FacturationClientProps) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['client-facturation', contactId],
    queryFn: () => fetchFacturationClient(contactId),
    enabled: !!contactId,
  });

  const totaux = useMemo(() => {
    const factures = (data?.factures ?? []).filter((f) => f.status !== 'cancelled');
    return {
      facture: factures.reduce((somme, f) => somme + (f.amount_ttc ?? 0), 0),
      regle: factures.reduce((somme, f) => somme + (f.amount_paid ?? 0), 0),
      restant: factures.reduce((somme, f) => somme + (f.remaining_amount ?? 0), 0),
      avoirs: (data?.avoirs ?? []).reduce((somme, a) => somme + (a.amount_ttc ?? 0), 0),
    };
  }, [data]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-border bg-card px-4 py-10 text-center">
        <p className="text-sm text-muted-foreground">
          {error instanceof Error ? error.message : 'Facturation indisponible'}
        </p>
      </div>
    );
  }

  const avoirs = data?.avoirs ?? [];
  // La facture du vehicule dont on vient passe devant les autres : c'est
  // celle qu'on ouvre la fiche pour lire.
  const factures = [...(data?.factures ?? [])].sort((gauche, droite) => {
    const aGauche = memePlaque(plaque, vehiculeDe(gauche)?.immatriculation) ? 0 : 1;
    const aDroite = memePlaque(plaque, vehiculeDe(droite)?.immatriculation) ? 0 : 1;
    return aGauche - aDroite;
  });

  if (factures.length === 0 && avoirs.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card px-4 py-10 text-center">
        <Receipt className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Aucune facture ni avoir rattaché à ce client.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
        <Total libelle="Facturé TTC" valeur={montant(totaux.facture)} />
        <Total libelle="Réglé" valeur={montant(totaux.regle)} />
        <Total
          libelle="Reste à recevoir"
          valeur={montant(totaux.restant)}
          alerte={totaux.restant > 0}
        />
        <Total libelle="Avoirs" valeur={avoirs.length > 0 ? montant(totaux.avoirs) : '—'} />
      </section>

      {factures.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Factures
          </h3>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {factures.map((facture) => (
              <LigneFactureDepliable
                key={facture.id}
                facture={facture}
                concernee={memePlaque(plaque, vehiculeDe(facture)?.immatriculation)}
                paiements={(data?.paiements ?? []).filter((p) => p.invoice_id === facture.id)}
              />
            ))}
          </ul>
        </section>
      )}

      {avoirs.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Avoirs
          </h3>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {avoirs.map((avoir) => <LigneAvoir key={avoir.id} avoir={avoir} />)}
          </ul>
          {/* Onify n'expose pas le document des avoirs : son API ne repond
              que pour les factures. Le dire evite de chercher un bouton qui
              n'existe pas. */}
          <p className="mt-2 text-xs text-muted-foreground">
            Onify ne met pas le PDF des avoirs à disposition : seul leur détail est repris ici.
          </p>
        </section>
      )}
    </div>
  );
}

function Total({ libelle, valeur, alerte }: {
  libelle: string;
  valeur: string;
  alerte?: boolean;
}) {
  return (
    <div className="bg-card px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{libelle}</p>
      <p className={cn(
        'mt-0.5 text-base font-semibold tabular-nums',
        alerte ? 'text-urgent' : 'text-foreground',
      )}>
        {valeur}
      </p>
    </div>
  );
}

function LigneFactureDepliable({ facture, paiements, concernee }: {
  facture: Invoice;
  paiements: Payment[];
  concernee?: boolean;
}) {
  const [ouverte, setOuverte] = useState(Boolean(concernee));
  const lignes = ouverte ? lignesDe(facture) : [];
  const vehicule = vehiculeDe(facture);
  const objet = objetDe(facture);

  return (
    <li className={cn(concernee && 'bg-primary/5')}>
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setOuverte((etat) => !etat)}
          aria-expanded={ouverte}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <ChevronDown className={cn(
            'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
            ouverte && 'rotate-180',
          )} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">
              {facture.invoice_number}
              {vehicule?.immatriculation && (
                <span className="ml-2 text-xs text-muted-foreground tabular-nums">
                  {vehicule.immatriculation}
                </span>
              )}
            </p>
            <p className="truncate text-xs text-muted-foreground tabular-nums">
              {jour(facture.issue_date)}
              {objet && <span className="ml-2">{objet}</span>}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-sm font-semibold tabular-nums text-foreground">
              {montant(facture.amount_ttc)}
            </p>
            {facture.remaining_amount > 0 && (
              <p className="text-xs tabular-nums text-urgent">
                reste {montant(facture.remaining_amount)}
              </p>
            )}
          </div>
          <Badge
            variant="outline"
            className={cn('shrink-0 rounded-full text-[10px]', couleurStatut(facture.status))}
          >
            {LIBELLE_STATUT[facture.status]}
          </Badge>
        </button>
        <BoutonPdfFacture facture={facture} />
      </div>

      {ouverte && (
        <div className="space-y-4 border-t border-border bg-muted/30 px-4 py-4">
          <dl className="grid gap-x-6 gap-y-2 text-xs sm:grid-cols-3">
            <Detail libelle="Émise le" valeur={jour(facture.issue_date)} />
            <Detail libelle="Échéance" valeur={jour(facture.due_date)} />
            <Detail libelle="Véhicule" valeur={vehicule?.designation ?? '—'} />
            <Detail libelle="Total HT" valeur={montant(facture.amount_ht)} />
            <Detail
              libelle="TVA"
              valeur={facture.tva_rate ? `${facture.tva_rate} %` : '—'}
            />
            <Detail libelle="Total TTC" valeur={montant(facture.amount_ttc)} />
            {facture.insurance_amount > 0 && (
              <Detail libelle="Part assurance" valeur={montant(facture.insurance_amount)} />
            )}
            {facture.franchise_amount > 0 && (
              <Detail libelle="Franchise" valeur={montant(facture.franchise_amount)} />
            )}
            <Detail libelle="Réglé" valeur={montant(facture.amount_paid)} />
          </dl>

          {lignes.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="pb-1 pr-3 font-medium">Désignation</th>
                    <th className="pb-1 pr-3 text-right font-medium">Qté</th>
                    <th className="pb-1 pr-3 text-right font-medium">P.U. HT</th>
                    <th className="pb-1 text-right font-medium">Total HT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lignes.map((ligne, index) => (
                    <tr key={`${ligne.nom}-${index}`}>
                      <td className="py-1.5 pr-3 align-top">
                        <span className="text-foreground">{ligne.nom}</span>
                        {ligne.description && (
                          <span className="block whitespace-pre-line text-muted-foreground">
                            {ligne.description}
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 pr-3 text-right align-top tabular-nums text-muted-foreground">
                        {ligne.quantite}{ligne.unite ? ` ${ligne.unite}` : ''}
                      </td>
                      <td className="py-1.5 pr-3 text-right align-top tabular-nums text-muted-foreground">
                        {montant(ligne.prixUnitaire)}
                      </td>
                      <td className="py-1.5 text-right align-top tabular-nums text-foreground">
                        {montant(ligne.totalHt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {paiements.length > 0 && (
            <ul className="space-y-1 text-xs text-muted-foreground">
              {paiements.map((paiement) => (
                <li key={paiement.id} className="tabular-nums">
                  Réglé {montant(paiement.amount)} le {jour(paiement.payment_date)}
                </li>
              ))}
            </ul>
          )}

          {lignes.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Le détail des lignes n’a pas été repris pour cette facture.
              <FileText className="ml-1 inline h-3 w-3 align-[-2px]" />
              {' '}Le PDF reste consultable.
            </p>
          )}
        </div>
      )}
    </li>
  );
}

function Detail({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{libelle}</dt>
      <dd className="tabular-nums text-foreground">{valeur}</dd>
    </div>
  );
}

function LigneAvoir({ avoir }: { avoir: OnifyCreditNote }) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <RotateCcw className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {avoir.credit_number ?? 'Avoir'}
          {avoir.invoice_number && (
            <span className="ml-2 text-xs text-muted-foreground">
              sur {avoir.invoice_number}
            </span>
          )}
        </p>
        <p className="truncate text-xs text-muted-foreground tabular-nums">
          {jour(avoir.issue_date)}
          {avoir.object && <span className="ml-2">{avoir.object}</span>}
        </p>
      </div>
      <p className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
        {montant(avoir.amount_ttc)}
      </p>
    </li>
  );
}
