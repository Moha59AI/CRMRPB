// Indicateurs de l'accueil
//
// L'accueil montre le chiffre d'un coup d'oeil : ce qui est facture, ce qui
// reste a encaisser, ce qui est en retard, avec qui on travaille le mieux.
// Les donnees viennent du meme service que le tableau financier ; seules les
// derivations sont propres a cette page.
//
// Regle tenue partout : **un indicateur qu'on ne peut pas calculer ne vaut
// pas zero.** Aujourd'hui aucune date de paiement n'est enregistree, donc le
// delai moyen est `null`, pas « 0 jour ». L'ecran le dit. Une valeur inventee
// serait lue comme vraie, et c'est sur elle qu'on prendrait des decisions.

import { supabase } from '@/lib/supabase';
import { getWorkspaceId } from '@/services/workspace';
import {
  fetchFinancialDashboardData,
  type FinancialDashboardData,
} from '@/features/finance/financial-dashboard-service';
import type { Invoice, OnifyCreditNote, Payment } from '@/types';

// ─────────────────────────────────────────────────────────────────────
// Types exposes a la page
// ─────────────────────────────────────────────────────────────────────

export interface TrancheRetard {
  cle: '1_7' | '8_30' | '31_60' | 'plus_60';
  label: string;
  factures: number;
  montant: number;
}

export interface LigneAssureur {
  id: string;
  nom: string;
  dossiers: number;
  /** Delai moyen d'encaissement en jours ; null si aucune facture payee. */
  delaiJours: number | null;
}

export interface LigneMarque {
  marque: string;
  interventions: number;
}

export interface Taux {
  valeur: number | null;
  numerateur: number;
  denominateur: number;
}

export interface IndicateursAccueil {
  periode: { debut: string; fin: string; libelle: string };

  caNet: number;
  avoirs: number;
  caBrut: number;
  benefice: number;
  encours: number;
  nbFactures: number;
  panierMoyen: number | null;
  delaiPaiementJours: number | null;
  devisAcceptes: number;

  retards: { tranches: TrancheRetard[]; total: number; factures: number };

  assureurs: {
    parDelai: LigneAssureur[];
    meilleurs: LigneAssureur[];
    pires: LigneAssureur[];
    /** Vrai quand aucun assureur n'a de delai calculable. */
    sansDonnees: boolean;
  };

  marques: LigneMarque[];

  tauxConversionDevis: Taux;
  tauxLeadsAssures: Taux;
  formules: { label: string; part: number; nombre: number }[];
}

// ─────────────────────────────────────────────────────────────────────
// Chargement
// ─────────────────────────────────────────────────────────────────────

interface LeadLeger {
  vehicle_make: string | null;
  insurance: string | null;
  created_at: string;
}

export interface DonneesAccueil extends FinancialDashboardData {
  leads: LeadLeger[];
}

export async function fetchDonneesAccueil(): Promise<DonneesAccueil> {
  const workspaceId = await getWorkspaceId();

  const [finance, leads] = await Promise.all([
    fetchFinancialDashboardData(),
    supabase
      .from('leads')
      .select('vehicle_make, insurance, created_at')
      .eq('workspace_id', workspaceId)
      .is('archived_at', null)
      .limit(10000),
  ]);

  if (leads.error) throw new Error(leads.error.message);

  return { ...finance, leads: (leads.data as LeadLeger[]) ?? [] };
}

// ─────────────────────────────────────────────────────────────────────
// Helpers numeriques
// ─────────────────────────────────────────────────────────────────────

function numerique(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function somme(valeurs: number[]): number {
  return valeurs.reduce((total, v) => total + v, 0);
}

function dateValide(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function joursEntre(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** Reste du : la colonne quand elle existe, sinon TTC moins encaisse. */
function resteDu(f: Invoice): number {
  const stocke = numerique(f.remaining_amount);
  if (stocke > 0) return stocke;
  return Math.max(0, numerique(f.amount_ttc) - numerique(f.amount_paid));
}

function factureActive(f: Invoice): boolean {
  return f.status !== 'cancelled';
}

function avoirActif(a: OnifyCreditNote): boolean {
  return !String(a.status ?? '').toLocaleLowerCase('fr-FR').includes('brouillon');
}

function dansPeriode(iso: string | null | undefined, debut: Date, fin: Date): boolean {
  const d = dateValide(iso);
  return d !== null && d >= debut && d <= fin;
}

// ─────────────────────────────────────────────────────────────────────
// Derivations
// ─────────────────────────────────────────────────────────────────────

/**
 * Date d'encaissement d'une facture : `payment_date` quand elle est
 * renseignee, sinon le premier paiement rattache. Sans l'un ni l'autre, la
 * facture ne participe pas au delai moyen -- meme si elle est soldee.
 */
function dateEncaissement(f: Invoice, paiementsParFacture: Map<string, Date>): Date | null {
  return dateValide(f.payment_date) ?? paiementsParFacture.get(f.id) ?? null;
}

function indexerPaiements(paiements: Payment[]): Map<string, Date> {
  const premier = new Map<string, Date>();
  for (const p of paiements) {
    if (!p.invoice_id) continue;
    const d = dateValide(p.payment_date);
    if (!d) continue;
    const existant = premier.get(p.invoice_id);
    if (!existant || d < existant) premier.set(p.invoice_id, d);
  }
  return premier;
}

function tranchesRetard(factures: Invoice[], maintenant: Date) {
  const tranches: TrancheRetard[] = [
    { cle: '1_7', label: '1 – 7 j', factures: 0, montant: 0 },
    { cle: '8_30', label: '8 – 30 j', factures: 0, montant: 0 },
    { cle: '31_60', label: '31 – 60 j', factures: 0, montant: 0 },
    { cle: 'plus_60', label: '+ 60 j', factures: 0, montant: 0 },
  ];

  for (const f of factures) {
    const montant = resteDu(f);
    if (montant <= 0) continue;
    const echeance = dateValide(f.due_date);
    if (!echeance || echeance >= maintenant) continue;

    const retard = joursEntre(echeance, maintenant);
    const tranche =
      retard <= 7 ? tranches[0] : retard <= 30 ? tranches[1] : retard <= 60 ? tranches[2] : tranches[3];
    tranche.factures += 1;
    tranche.montant += montant;
  }

  return {
    tranches,
    total: somme(tranches.map((t) => t.montant)),
    factures: somme(tranches.map((t) => t.factures)),
  };
}

function classementAssureurs(
  factures: Invoice[],
  data: DonneesAccueil,
  paiementsParFacture: Map<string, Date>,
) {
  const assureurParDossier = new Map<string, string>();
  for (const dossier of data.cases) {
    if (dossier.insurer_id) assureurParDossier.set(dossier.id, dossier.insurer_id);
  }
  const nomAssureur = new Map(data.insurers.map((a) => [a.id, a.name]));

  const cumul = new Map<string, { dossiers: number; delais: number[] }>();
  for (const f of factures) {
    if (!f.case_id) continue;
    const assureurId = assureurParDossier.get(f.case_id);
    if (!assureurId) continue;

    const ligne = cumul.get(assureurId) ?? { dossiers: 0, delais: [] };
    ligne.dossiers += 1;

    const emission = dateValide(f.issue_date);
    const encaissement = dateEncaissement(f, paiementsParFacture);
    if (emission && encaissement && encaissement >= emission) {
      ligne.delais.push(joursEntre(emission, encaissement));
    }
    cumul.set(assureurId, ligne);
  }

  const lignes: LigneAssureur[] = [...cumul.entries()].map(([id, c]) => ({
    id,
    nom: nomAssureur.get(id) ?? 'Assureur inconnu',
    dossiers: c.dossiers,
    delaiJours: c.delais.length ? Math.round(somme(c.delais) / c.delais.length) : null,
  }));

  const avecDelai = lignes.filter((l) => l.delaiJours !== null);
  const parDelai = [...avecDelai].sort((a, b) => (b.delaiJours ?? 0) - (a.delaiJours ?? 0));

  return {
    parDelai: parDelai.slice(0, 5),
    meilleurs: [...avecDelai].sort((a, b) => (a.delaiJours ?? 0) - (b.delaiJours ?? 0)).slice(0, 5),
    pires: parDelai.slice(0, 5),
    sansDonnees: avecDelai.length === 0,
  };
}

/**
 * Marques les plus vues. Priorite aux factures (le vehicule y est fiable,
 * il vient de l'immatriculation), puis aux leads pour completer.
 */
function topMarques(factures: Invoice[], leads: LeadLeger[]): LigneMarque[] {
  const compte = new Map<string, number>();

  const ajouter = (brut: unknown) => {
    const marque = String(brut ?? '').trim().toLocaleUpperCase('fr-FR');
    if (!marque) return;
    compte.set(marque, (compte.get(marque) ?? 0) + 1);
  };

  let depuisFactures = 0;
  for (const f of factures) {
    const vehicule = (f.onify_payload as { vehicle?: { brand?: unknown } } | null)?.vehicle;
    if (vehicule?.brand) {
      ajouter(vehicule.brand);
      depuisFactures += 1;
    }
  }
  // Les leads ne completent que si les factures ne disent presque rien :
  // melanger prospects et interventions realisees fausserait le classement.
  if (depuisFactures < 10) {
    for (const l of leads) ajouter(l.vehicle_make);
  }

  return [...compte.entries()]
    .map(([marque, interventions]) => ({ marque, interventions }))
    .sort((a, b) => b.interventions - a.interventions)
    .slice(0, 5);
}

function taux(numerateur: number, denominateur: number): Taux {
  return {
    valeur: denominateur > 0 ? numerateur / denominateur : null,
    numerateur,
    denominateur,
  };
}

function repartitionFormules(factures: Invoice[]) {
  const compte = new Map<string, number>();
  for (const f of factures) {
    const type = String((f.onify_payload as { type?: unknown } | null)?.type ?? '').trim();
    if (!type) continue;
    compte.set(type, (compte.get(type) ?? 0) + 1);
  }
  const total = somme([...compte.values()]);
  const libelle = (t: string) =>
    t === 'basique' ? 'Classique' : t.charAt(0).toLocaleUpperCase('fr-FR') + t.slice(1);

  return [...compte.entries()]
    .map(([type, nombre]) => ({ label: libelle(type), nombre, part: total ? nombre / total : 0 }))
    .sort((a, b) => b.nombre - a.nombre);
}

// ─────────────────────────────────────────────────────────────────────
// Point d'entree
// ─────────────────────────────────────────────────────────────────────

/**
 * Calcule les indicateurs sur l'annee civile en cours.
 *
 * Le filtre de periode porte sur la date d'emission des factures et des
 * avoirs. Les retards, eux, se comptent sur tout ce qui reste du, quelle que
 * soit l'annee : une facture de decembre impayee en janvier est toujours en
 * retard.
 */
export function calculerIndicateurs(data: DonneesAccueil, maintenant = new Date()): IndicateursAccueil {
  const debut = new Date(maintenant.getFullYear(), 0, 1);
  const fin = new Date(maintenant.getFullYear(), 11, 31, 23, 59, 59, 999);

  const facturesActives = data.invoices.filter(factureActive);
  const facturesPeriode = facturesActives.filter((f) => dansPeriode(f.issue_date, debut, fin));
  const avoirsPeriode = data.credits
    .filter(avoirActif)
    .filter((a) => dansPeriode(a.issue_date, debut, fin));

  const caBrut = somme(facturesPeriode.map((f) => numerique(f.amount_ttc)));
  const avoirs = somme(avoirsPeriode.map((a) => numerique(a.amount_ttc)));
  const nbFactures = facturesPeriode.length;

  const paiementsParFacture = indexerPaiements(data.payments);
  const delais: number[] = [];
  for (const f of facturesPeriode) {
    const emission = dateValide(f.issue_date);
    const encaissement = dateEncaissement(f, paiementsParFacture);
    if (emission && encaissement && encaissement >= emission) {
      delais.push(joursEntre(emission, encaissement));
    }
  }

  const devisPeriode = data.quotes.filter((q) => dansPeriode(q.created_at, debut, fin));
  const devisAcceptes = devisPeriode.filter((q) => q.status === 'accepted').length;

  const leadsPeriode = data.leads.filter((l) => dansPeriode(l.created_at, debut, fin));
  const leadsAssures = leadsPeriode.filter((l) => (l.insurance ?? '').trim() !== '').length;

  return {
    periode: {
      debut: debut.toISOString(),
      fin: fin.toISOString(),
      libelle: `Année ${maintenant.getFullYear()} · TTC`,
    },

    caNet: caBrut - avoirs,
    avoirs,
    caBrut,
    benefice: somme(facturesPeriode.map((f) => numerique(f.estimated_margin))),
    encours: somme(facturesActives.map(resteDu)),
    nbFactures,
    panierMoyen: nbFactures ? caBrut / nbFactures : null,
    delaiPaiementJours: delais.length ? Math.round(somme(delais) / delais.length) : null,
    devisAcceptes,

    retards: tranchesRetard(facturesActives, maintenant),
    assureurs: classementAssureurs(facturesActives, data, paiementsParFacture),
    marques: topMarques(facturesPeriode, leadsPeriode),

    tauxConversionDevis: taux(devisAcceptes, devisPeriode.length),
    tauxLeadsAssures: taux(leadsAssures, leadsPeriode.length),
    formules: repartitionFormules(facturesPeriode),
  };
}
