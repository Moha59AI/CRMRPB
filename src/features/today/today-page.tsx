import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, BadgeEuro, Calendar as CalendarIcon, Car, CheckSquare, ChevronLeft,
  ChevronRight, ClipboardList, FileText, Landmark, LineChart, PiggyBank, Plus, Receipt,
  ShieldCheck, Target, ThumbsDown, ThumbsUp, Timer, Wallet, type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useAuth } from '@/features/auth/auth-context';
import { fetchAppointments, fetchTasks } from '@/services/planning-service';
import { enregistrerObjectifAnnuel, fetchReglagesEntreprise } from '@/services/admin-service';
import {
  calculerIndicateurs, fetchDonneesAccueil,
  type LigneAssureur, type LigneMarque, type MoisEvolution, type Taux,
} from './indicateurs-accueil';
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useMouvementReduit, useNombreAnime } from '@/lib/animation';
import type { Appointment, Task } from '@/types';

/**
 * Accueil : le chiffre d'un coup d'oeil, l'agenda a portee de main.
 *
 * Bandeau de CA en tete, grille d'indicateurs au centre, colonne de droite
 * pour ce qui arrive (calendrier, rendez-vous, taches, objectif). La
 * structure vient de ce que les centres bris de glace attendent d'un
 * tableau de bord ; l'habillage reste le notre -- voir DESIGN.md.
 *
 * Aucun indicateur n'est invente : ce qui ne se calcule pas s'affiche comme
 * tel, avec la raison.
 */

// ─────────────────────────────────────────────────────────────────────
// Formatage
// ─────────────────────────────────────────────────────────────────────

const euros = new Intl.NumberFormat('fr-FR', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
});
const entier = new Intl.NumberFormat('fr-FR');
const pourcent = (t: Taux) => (t.valeur === null ? '—' : `${Math.round(t.valeur * 100)} %`);

function heure(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function jourCourt(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}

function memeJour(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function initiales(nom: string): string {
  return nom.split(/[\s-]+/).filter(Boolean).slice(0, 2).map((m) => m[0]?.toLocaleUpperCase('fr-FR') ?? '').join('');
}

// ─────────────────────────────────────────────────────────────────────
// Briques
// ─────────────────────────────────────────────────────────────────────

/** Carte de base : rayon, bordure et ombre du langage visuel. */
function Carte({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section className={cn('relative overflow-hidden rounded-2xl border border-border bg-card shadow-md', className)}>
      {children}
    </section>
  );
}

function TitreCarte({ icon: Icon, children, action }: { icon: LucideIcon; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface text-primary">
        <Icon className="h-4 w-4" strokeWidth={1.75} />
      </span>
      <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{children}</h2>
      {action}
    </div>
  );
}

/** Icone estompee en fond de carte : signe la famille de l'indicateur sans peser. */
function Filigrane({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <Icon
      aria-hidden
      className="pointer-events-none absolute -bottom-3 -right-3 h-20 w-20 text-foreground/[0.045]"
      strokeWidth={1.25}
    />
  );
}

function StatCle({
  icon, label, valeur, complement, chargement, href,
}: {
  icon: LucideIcon; label: string; valeur: ReactNode; complement?: ReactNode;
  chargement?: boolean; href?: string;
}) {
  const contenu = (
    <Carte className={cn('p-4', href && 'transition-shadow hover:shadow-lg')}>
      <Filigrane icon={icon} />
      <TitreCarte icon={icon}>{label}</TitreCarte>
      <div className="mt-3">
        {chargement ? (
          <Skeleton className="h-8 w-28" />
        ) : (
          <p className="text-[26px] font-semibold leading-none tracking-tight text-foreground tabular-nums">{valeur}</p>
        )}
        {complement && <div className="mt-2 text-xs text-muted-foreground">{complement}</div>}
      </div>
    </Carte>
  );
  return href ? <Link to={href} className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{contenu}</Link> : contenu;
}

function Pastille({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-surface px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      {children}
    </span>
  );
}

function Chip({ nom }: { nom: string }) {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-[10px] font-semibold text-muted-foreground">
      {initiales(nom) || '?'}
    </span>
  );
}

/** Anneau de progression, en SVG pur : assez leger pour en poser plusieurs. */
function Anneau({ part, taille = 44 }: { part: number | null; taille?: number }) {
  const rayon = (taille - 6) / 2;
  const circonference = 2 * Math.PI * rayon;
  const cible = part === null ? 0 : Math.max(0, Math.min(1, part));
  // L'anneau se remplit depuis zero : on voit la proportion se construire,
  // ce qui la rend plus lisible qu'un arc deja pose.
  const fraction = useNombreAnime(cible, 1100);
  return (
    <svg width={taille} height={taille} viewBox={`0 0 ${taille} ${taille}`} className="shrink-0" aria-hidden>
      <circle cx={taille / 2} cy={taille / 2} r={rayon} fill="none" stroke="hsl(var(--border))" strokeWidth={5} />
      <circle
        cx={taille / 2} cy={taille / 2} r={rayon} fill="none"
        stroke="hsl(var(--primary))" strokeWidth={5} strokeLinecap="round"
        strokeDasharray={circonference}
        strokeDashoffset={circonference * (1 - fraction)}
        style={{ transition: 'stroke 200ms ease' }}
        transform={`rotate(-90 ${taille / 2} ${taille / 2})`}
      />
    </svg>
  );
}

function Vide({ children }: { children: ReactNode }) {
  return <p className="rounded-xl bg-surface px-3 py-3 text-xs leading-relaxed text-muted-foreground">{children}</p>;
}

// ─────────────────────────────────────────────────────────────────────
// Bandeau
// ─────────────────────────────────────────────────────────────────────

/**
 * Un montant qui monte jusqu'a sa valeur.
 *
 * `tabular-nums` est indispensable : sans chasse fixe, la largeur du nombre
 * change a chaque image et le montant tressaute pendant toute la montee.
 */
function ChiffreQuiMonte({ valeur, className }: { valeur: number; className?: string }) {
  const affiche = useNombreAnime(valeur);
  return (
    <p className={className} aria-label={euros.format(valeur)}>
      {euros.format(Math.round(affiche))}
    </p>
  );
}

function BandeauCa({
  chargement, caNet, avoirs, periode, benefice, encours, delai, devisAcceptes,
}: {
  chargement: boolean; caNet: number; avoirs: number; periode: string;
  benefice: number; encours: number; delai: number | null; devisAcceptes: number;
}) {
  const colonnes: { icon: LucideIcon; label: string; valeur: ReactNode; note?: string }[] = [
    { icon: PiggyBank, label: 'Bénéfice net', valeur: euros.format(benefice), note: 'marge estimée' },
    { icon: Wallet, label: 'Encours clients', valeur: euros.format(encours), note: 'reste à encaisser' },
    {
      icon: Timer, label: 'Délai de paiement',
      valeur: delai === null ? '—' : `${delai} j`,
      note: delai === null ? 'aucune date de paiement saisie' : 'entre émission et encaissement',
    },
    { icon: ClipboardList, label: 'Devis acceptés', valeur: entier.format(devisAcceptes), note: 'sur l’année' },
  ];

  return (
    <Carte className="grid grid-cols-1 lg:grid-cols-[1.35fr_2fr]">
      <div className="gutter-x flex flex-col justify-between gap-5 py-5 lg:border-r lg:border-border">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">CA net (après avoirs)</p>
          {chargement ? (
            <Skeleton className="mt-2 h-12 w-56" />
          ) : (
            <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <ChiffreQuiMonte
                valeur={caNet}
                className="text-[40px] font-semibold leading-none tracking-tight text-foreground tabular-nums"
              />
              <Pastille>Avoirs : {euros.format(avoirs)}</Pastille>
            </div>
          )}
          <p className="mt-2 text-xs text-faint">{periode}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" className="rounded-full">
            <Link to="/billing"><FileText className="mr-1.5 h-3.5 w-3.5" />Nouveau devis</Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="rounded-full">
            <Link to="/billing"><Receipt className="mr-1.5 h-3.5 w-3.5" />Nouvelle facture</Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="rounded-full">
            <Link to="/leads"><Plus className="mr-1.5 h-3.5 w-3.5" />Nouveau lead</Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 divide-border md:grid-cols-4 md:divide-x">
        {colonnes.map((c) => (
          <div key={c.label} className="flex flex-col justify-center gap-1.5 px-5 py-5">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-surface text-primary">
              <c.icon className="h-3.5 w-3.5" strokeWidth={1.75} />
            </span>
            <p className="text-xs text-muted-foreground">{c.label}</p>
            {chargement ? (
              <Skeleton className="h-7 w-24" />
            ) : (
              <p className="text-[22px] font-semibold leading-none tracking-tight text-foreground tabular-nums">{c.valeur}</p>
            )}
            {c.note && <p className="text-[11px] text-faint">{c.note}</p>}
          </div>
        ))}
      </div>
    </Carte>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Cartes de la grille
// ─────────────────────────────────────────────────────────────────────

/**
 * Douze mois de chiffre d'affaires, et ce qui est rentre.
 *
 * L'accueil disait combien on a facture cette annee, jamais comment cela a
 * evolue. Un total ne montre ni la saison, ni le mois ou l'on a decroche.
 *
 * L'aire pleine est le facture ; la ligne est l'encaisse. L'ecart entre les
 * deux se lit d'un coup d'oeil : c'est l'argent du travail deja fait qui
 * n'est pas encore rentre.
 */
export function CarteEvolution({ evolution, chargement }: {
  evolution: MoisEvolution[];
  chargement: boolean;
}) {
  const reduit = useMouvementReduit();
  const aDesPaiements = evolution.some((m) => m.encaisse > 0);

  return (
    <Carte className="p-4">
      <TitreCarte icon={LineChart}>Évolution sur 12 mois</TitreCarte>
      {chargement ? (
        <Skeleton className="mt-4 h-[220px] w-full rounded-xl" />
      ) : (
        <>
          <div className="mt-4 h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={evolution} margin={{ top: 4, right: 10, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="aireCa" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 3" />
                <XAxis
                  dataKey="libelle" tickLine={false} axisLine={false}
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  // Sur 375 px, douze mois se chevauchent. Recharts saute les
                  // etiquettes trop serrees et garde les deux extremites, qui
                  // sont celles qui situent la periode.
                  interval="preserveStartEnd"
                  minTickGap={22}
                />
                <YAxis
                  tickLine={false} axisLine={false} width={56}
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)} k€` : `${v} €`)}
                />
                <Tooltip
                  cursor={{ stroke: 'hsl(var(--border))', strokeWidth: 1 }}
                  contentStyle={{
                    borderRadius: 14,
                    border: '1px solid hsl(var(--border))',
                    background: 'hsl(var(--card))',
                    boxShadow: 'var(--shadow-2)',
                    fontSize: 12,
                  }}
                  labelStyle={{ color: 'hsl(var(--muted-foreground))', marginBottom: 4 }}
                  formatter={(valeur: number, nom: string) => [
                    euros.format(valeur),
                    nom === 'caNet' ? 'Facturé' : 'Encaissé',
                  ]}
                />
                <Area
                  dataKey="caNet" type="monotone"
                  stroke="hsl(var(--chart-1))" strokeWidth={2.5}
                  fill="url(#aireCa)"
                  isAnimationActive={!reduit}
                  animationDuration={1100}
                  animationEasing="ease-out"
                />
                {aDesPaiements && (
                  <Area
                    dataKey="encaisse" type="monotone"
                    stroke="hsl(var(--chart-2))" strokeWidth={2} strokeDasharray="4 3"
                    fill="transparent"
                    isAnimationActive={!reduit}
                    animationDuration={1300}
                    animationEasing="ease-out"
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-4 rounded-full" style={{ background: 'hsl(var(--chart-1))' }} aria-hidden />Facturé
            </span>
            {aDesPaiements ? (
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded-full" style={{ background: 'hsl(var(--chart-2))' }} aria-hidden />Encaissé
              </span>
            ) : (
              <span className="text-faint">
                Aucune date de paiement saisie : la courbe d’encaissement reste vide.
              </span>
            )}
          </div>
        </>
      )}
    </Carte>
  );
}

function CarteRetards({ retards, chargement }: { retards: ReturnType<typeof calculerIndicateurs>['retards']; chargement: boolean }) {
  const tranches = retards.tranches.filter((t) => t.factures > 0);
  return (
    <Carte className="p-4">
      <Filigrane icon={AlertTriangle} />
      <TitreCarte
        icon={AlertTriangle}
        action={!chargement && retards.factures > 0 && (
          <Pastille>{entier.format(retards.factures)} · {euros.format(retards.total)}</Pastille>
        )}
      >
        Factures en retard
      </TitreCarte>
      <div className="mt-3 divide-y divide-border">
        {chargement ? (
          [0, 1, 2].map((i) => <Skeleton key={i} className="my-2 h-9 w-full" />)
        ) : tranches.length === 0 ? (
          <Vide>Aucune facture en retard. Tout ce qui est dû est encore dans les délais.</Vide>
        ) : (
          tranches.map((t) => (
            <Link
              key={t.cle} to="/finance"
              className="flex items-center justify-between gap-3 py-2.5 transition-colors hover:bg-surface/60 -mx-1 px-1 rounded-md"
            >
              <div className="flex items-center gap-2.5">
                <span className={cn(
                  'h-2 w-2 rounded-full',
                  t.cle === '1_7' ? 'bg-upcoming' : t.cle === '8_30' ? 'bg-due' : 'bg-urgent',
                )} />
                <div>
                  <p className="text-sm font-medium text-foreground">{t.label}</p>
                  <p className="text-[11px] text-muted-foreground">{entier.format(t.factures)} facture{t.factures > 1 ? 's' : ''}</p>
                </div>
              </div>
              <p className="text-sm font-semibold tabular-nums text-foreground">{euros.format(t.montant)}</p>
            </Link>
          ))
        )}
      </div>
    </Carte>
  );
}

function CarteAssureurs({
  icon, titre, lignes, sansDonnees, chargement, tri,
}: {
  icon: LucideIcon; titre: string; lignes: LigneAssureur[]; sansDonnees: boolean;
  chargement: boolean; tri: 'delai' | 'rang';
}) {
  return (
    <Carte className="p-4">
      <Filigrane icon={icon} />
      <TitreCarte icon={icon}>{titre}</TitreCarte>
      <div className="mt-3 divide-y divide-border">
        {chargement ? (
          [0, 1, 2].map((i) => <Skeleton key={i} className="my-2 h-8 w-full" />)
        ) : sansDonnees ? (
          <Vide>
            Se remplit dès qu'une facture rattachée à un dossier assuré porte une date de paiement.
            Aujourd'hui aucune n'en a.
          </Vide>
        ) : (
          lignes.map((l, i) => (
            <div key={l.id} className="flex items-center gap-2.5 py-2">
              {tri === 'rang' && <span className="w-4 text-center text-[11px] text-faint tabular-nums">{i + 1}</span>}
              <Chip nom={l.nom} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{l.nom}</p>
                <p className="text-[11px] text-muted-foreground">{entier.format(l.dossiers)} dossier{l.dossiers > 1 ? 's' : ''}</p>
              </div>
              <p className="text-sm font-semibold tabular-nums text-foreground">{l.delaiJours} j</p>
            </div>
          ))
        )}
      </div>
    </Carte>
  );
}

function CarteMarques({ marques, chargement }: { marques: LigneMarque[]; chargement: boolean }) {
  const max = marques[0]?.interventions ?? 0;
  return (
    <Carte className="p-4">
      <Filigrane icon={Car} />
      <TitreCarte icon={Car}>Top véhicules</TitreCarte>
      <div className="mt-3 divide-y divide-border">
        {chargement ? (
          [0, 1, 2].map((i) => <Skeleton key={i} className="my-2 h-8 w-full" />)
        ) : marques.length === 0 ? (
          <Vide>Aucune marque connue sur les factures de l'année.</Vide>
        ) : (
          marques.map((m) => (
            <div key={m.marque} className="flex items-center gap-2.5 py-2">
              <Chip nom={m.marque} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{m.marque}</p>
                <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-surface">
                  <div className="h-full rounded-full bg-primary/70" style={{ width: `${max ? (m.interventions / max) * 100 : 0}%` }} />
                </div>
              </div>
              <p className="text-sm font-semibold tabular-nums text-foreground">{entier.format(m.interventions)}</p>
            </div>
          ))
        )}
      </div>
    </Carte>
  );
}

function CarteTaux({
  icon, titre, taux, legende, chargement,
}: { icon: LucideIcon; titre: string; taux: Taux; legende: string; chargement: boolean }) {
  return (
    <Carte className="p-4">
      <Filigrane icon={icon} />
      <TitreCarte icon={icon}>{titre}</TitreCarte>
      <div className="mt-3 flex items-center gap-4">
        {chargement ? (
          <Skeleton className="h-11 w-11 rounded-full" />
        ) : (
          <Anneau part={taux.valeur} />
        )}
        <div className="min-w-0 flex-1">
          {chargement ? (
            <Skeleton className="h-7 w-16" />
          ) : (
            <p className="text-[22px] font-semibold leading-none tracking-tight text-foreground tabular-nums">{pourcent(taux)}</p>
          )}
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {taux.denominateur === 0
              ? legende.replace('{n}', '0').replace('{d}', '0') + ' — rien à mesurer'
              : legende.replace('{n}', entier.format(taux.numerateur)).replace('{d}', entier.format(taux.denominateur))}
          </p>
        </div>
      </div>
    </Carte>
  );
}

function CarteFormules({ formules, chargement }: { formules: { label: string; part: number; nombre: number }[]; chargement: boolean }) {
  return (
    <Carte className="p-4">
      <Filigrane icon={BadgeEuro} />
      <TitreCarte icon={BadgeEuro}>Répartition des formules</TitreCarte>
      <div className="mt-3 space-y-2.5">
        {chargement ? (
          [0, 1].map((i) => <Skeleton key={i} className="h-5 w-full" />)
        ) : formules.length === 0 ? (
          <Vide>Aucune formule renseignée sur les factures de l'année.</Vide>
        ) : (
          formules.map((f, i) => (
            <div key={f.label}>
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2 text-foreground">
                  <span className={cn('h-2 w-2 rounded-full', i === 0 ? 'bg-primary' : 'bg-muted-foreground/50')} />
                  {f.label}
                  <span className="text-faint">· {entier.format(f.nombre)}</span>
                </span>
                <span className="font-semibold tabular-nums text-foreground">{Math.round(f.part * 100)} %</span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface">
                <div className={cn('h-full rounded-full', i === 0 ? 'bg-primary' : 'bg-muted-foreground/50')} style={{ width: `${f.part * 100}%` }} />
              </div>
            </div>
          ))
        )}
      </div>
    </Carte>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Colonne de droite
// ─────────────────────────────────────────────────────────────────────

function MiniCalendrier({ rendezVous }: { rendezVous: Appointment[] }) {
  const aujourdHui = useMemo(() => new Date(), []);
  const [mois, setMois] = useState(() => new Date(aujourdHui.getFullYear(), aujourdHui.getMonth(), 1));

  const joursOccupes = useMemo(() => {
    const s = new Set<string>();
    for (const r of rendezVous) {
      const d = new Date(r.start_time);
      if (d.getFullYear() === mois.getFullYear() && d.getMonth() === mois.getMonth()) s.add(String(d.getDate()));
    }
    return s;
  }, [rendezVous, mois]);

  // Lundi en tete : (getDay() + 6) % 7
  const decalage = (mois.getDay() + 6) % 7;
  const nbJours = new Date(mois.getFullYear(), mois.getMonth() + 1, 0).getDate();
  const cases: (number | null)[] = [...Array<null>(decalage).fill(null), ...Array.from({ length: nbJours }, (_, i) => i + 1)];

  return (
    <Carte className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold capitalize text-foreground">
          {mois.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
        </p>
        <div className="flex gap-0.5">
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" aria-label="Mois précédent"
            onClick={() => setMois(new Date(mois.getFullYear(), mois.getMonth() - 1, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" aria-label="Mois suivant"
            onClick={() => setMois(new Date(mois.getFullYear(), mois.getMonth() + 1, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-y-1 text-center">
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((j, i) => (
          <span key={i} className="text-[10px] font-semibold uppercase text-faint">{j}</span>
        ))}
        {cases.map((jour, i) => {
          if (jour === null) return <span key={`v${i}`} />;
          const date = new Date(mois.getFullYear(), mois.getMonth(), jour);
          const estAujourdHui = memeJour(date, aujourdHui);
          const occupe = joursOccupes.has(String(jour));
          return (
            <Link
              key={jour} to="/calendar"
              className={cn(
                'relative mx-auto flex h-8 w-8 items-center justify-center rounded-full text-xs tabular-nums transition-colors',
                estAujourdHui ? 'bg-primary font-semibold text-primary-foreground' : 'text-foreground hover:bg-surface',
              )}
            >
              {jour}
              {occupe && !estAujourdHui && <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-primary" />}
            </Link>
          );
        })}
      </div>
    </Carte>
  );
}

function CarteEvenements({ rendezVous, chargement }: { rendezVous: Appointment[]; chargement: boolean }) {
  return (
    <Carte className="p-4">
      <TitreCarte icon={CalendarIcon}>Événements à venir</TitreCarte>
      <div className="mt-3 space-y-2">
        {chargement ? (
          <Skeleton className="h-12 w-full" />
        ) : rendezVous.length === 0 ? (
          <Vide>Aucun événement à venir. Rien de prévu aujourd'hui ni demain.</Vide>
        ) : (
          rendezVous.slice(0, 4).map((r) => (
            <Link key={r.id} to="/calendar" className="flex items-start gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-surface">
              <div className="w-11 shrink-0 text-center">
                <p className="text-[11px] font-medium text-muted-foreground">{jourCourt(r.start_time).split(' ')[0]}</p>
                <p className="text-sm font-semibold tabular-nums text-foreground">{heure(r.start_time)}</p>
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{r.title}</p>
                {r.address && <p className="truncate text-[11px] text-muted-foreground">{r.address}</p>}
              </div>
            </Link>
          ))
        )}
        <Button asChild variant="outline" size="sm" className="w-full rounded-full">
          <Link to="/calendar"><CalendarIcon className="mr-1.5 h-3.5 w-3.5" />Accéder à mon agenda</Link>
        </Button>
      </div>
    </Carte>
  );
}

function CarteTaches({ taches, chargement }: { taches: Task[]; chargement: boolean }) {
  return (
    <Carte className="p-4">
      <TitreCarte icon={CheckSquare}>Tâches à venir</TitreCarte>
      <div className="mt-3 space-y-2">
        {chargement ? (
          <Skeleton className="h-12 w-full" />
        ) : taches.length === 0 ? (
          <Vide>Aucune tâche à venir. Rien de prévu aujourd'hui ni demain.</Vide>
        ) : (
          taches.slice(0, 4).map((t) => (
            <Link key={t.id} to="/follow-up" className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-surface">
              <span className={cn(
                'h-2 w-2 shrink-0 rounded-full',
                t.priority === 'urgent' ? 'bg-urgent' : t.priority === 'high' ? 'bg-due' : 'bg-upcoming',
              )} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{t.title}</p>
                {t.due_at && <p className="text-[11px] text-muted-foreground">{jourCourt(t.due_at)} · {heure(t.due_at)}</p>}
              </div>
            </Link>
          ))
        )}
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm" className="flex-1 rounded-full">
            <Link to="/follow-up"><FileText className="mr-1.5 h-3.5 w-3.5" />Note rapide</Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="flex-1 rounded-full">
            <Link to="/follow-up"><Plus className="mr-1.5 h-3.5 w-3.5" />Planifier</Link>
          </Button>
        </div>
      </div>
    </Carte>
  );
}

function CarteObjectif({ caNet, objectif, chargement }: { caNet: number; objectif: number | null; chargement: boolean }) {
  const queryClient = useQueryClient();
  const [edition, setEdition] = useState(false);
  const [saisie, setSaisie] = useState('');

  const enregistrer = useMutation({
    mutationFn: (valeur: number | null) => enregistrerObjectifAnnuel(valeur),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reglages-entreprise'] });
      setEdition(false);
      toast.success('Objectif enregistré');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const soumettre = () => {
    const n = Number(saisie.replace(/\s/g, '').replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) {
      toast.error('Saisissez un montant supérieur à zéro');
      return;
    }
    enregistrer.mutate(Math.round(n));
  };

  const part = objectif ? Math.min(1, caNet / objectif) : null;

  return (
    <Carte className="p-4">
      <Filigrane icon={Target} />
      <TitreCarte icon={Target}>Objectif annuel</TitreCarte>
      <div className="mt-3">
        {chargement ? (
          <Skeleton className="h-10 w-full" />
        ) : edition || objectif === null ? (
          <div className="space-y-2">
            {!edition ? (
              <>
                <Button variant="outline" size="sm" className="rounded-full" onClick={() => { setSaisie(''); setEdition(true); }}>
                  <Target className="mr-1.5 h-3.5 w-3.5" />Renseigner mon objectif
                </Button>
                <p className="text-[11px] text-muted-foreground">Définissez votre objectif annuel de CA net pour suivre votre progression.</p>
              </>
            ) : (
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); soumettre(); }}>
                <Input
                  autoFocus inputMode="numeric" placeholder="ex. 250 000"
                  value={saisie} onChange={(e) => setSaisie(e.target.value)}
                  className="h-9 rounded-lg"
                />
                <Button type="submit" size="sm" className="rounded-full" disabled={enregistrer.isPending}>OK</Button>
                <Button type="button" size="sm" variant="ghost" className="rounded-full" onClick={() => setEdition(false)}>Annuler</Button>
              </form>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <Anneau part={part} taille={52} />
            <div className="min-w-0 flex-1">
              <p className="text-[22px] font-semibold leading-none tracking-tight text-foreground tabular-nums">
                {part === null ? '—' : `${Math.round(part * 100)} %`}
              </p>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {euros.format(caNet)} sur {euros.format(objectif)}
              </p>
              <button type="button" className="mt-1 text-[11px] text-primary hover:underline"
                onClick={() => { setSaisie(String(objectif)); setEdition(true); }}>
                Modifier
              </button>
            </div>
          </div>
        )}
      </div>
    </Carte>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────

export function TodayPage() {
  const { profile } = useAuth();
  const [maintenant, setMaintenant] = useState(() => new Date());

  // L'heure est affichee : on la tient a jour a la minute, pas plus.
  useEffect(() => {
    const t = setInterval(() => setMaintenant(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const donnees = useQuery({ queryKey: ['accueil', 'indicateurs'], queryFn: fetchDonneesAccueil });
  const indicateurs = useMemo(
    () => (donnees.data ? calculerIndicateurs(donnees.data, maintenant) : null),
    [donnees.data, maintenant],
  );

  const fenetre = useMemo(() => {
    const debut = new Date(maintenant); debut.setHours(0, 0, 0, 0);
    const fin = new Date(debut); fin.setDate(fin.getDate() + 2); // aujourd'hui + demain
    return { debut: debut.toISOString(), fin: fin.toISOString() };
  }, [maintenant]);

  const calendrier = useMemo(() => {
    const debut = new Date(maintenant.getFullYear(), maintenant.getMonth() - 1, 1);
    const fin = new Date(maintenant.getFullYear(), maintenant.getMonth() + 2, 0, 23, 59, 59);
    return { debut: debut.toISOString(), fin: fin.toISOString() };
  }, [maintenant]);

  const rendezVous = useQuery({
    queryKey: ['accueil', 'rdv', calendrier.debut, calendrier.fin],
    queryFn: () => fetchAppointments({ startDate: calendrier.debut, endDate: calendrier.fin }),
  });
  const taches = useQuery({
    queryKey: ['accueil', 'taches'],
    queryFn: () => fetchTasks({ status: 'pending' }),
  });
  const reglages = useQuery({
    queryKey: ['reglages-entreprise'],
    queryFn: fetchReglagesEntreprise,
    staleTime: 5 * 60_000,
  });

  const rdvAVenir = useMemo(
    () => (rendezVous.data ?? [])
      .filter((r) => r.status !== 'cancelled' && r.start_time >= fenetre.debut && r.start_time < fenetre.fin)
      .sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [rendezVous.data, fenetre],
  );
  const tachesAVenir = useMemo(
    () => (taches.data ?? [])
      .filter((t) => !t.due_at || t.due_at < fenetre.fin)
      .sort((a, b) => (a.due_at ?? '').localeCompare(b.due_at ?? '')),
    [taches.data, fenetre],
  );

  const chargement = donnees.isLoading;
  const prenom = profile?.first_name?.trim();
  const dateLongue = maintenant.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="gutter-x gutter-y space-y-5">
      {/* En-tete */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[28px]">
            Bonjour{prenom ? `, ${prenom}` : ''}.
          </h1>
          <p className="mt-0.5 text-sm capitalize text-muted-foreground">{dateLongue}</p>
        </div>
        <p className="text-sm tabular-nums text-muted-foreground">
          {maintenant.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>

      {donnees.isError && (
        <div className="rounded-2xl border border-urgent/30 bg-urgent-soft px-4 py-3 text-sm text-urgent">
          Les indicateurs n'ont pas pu être chargés : {(donnees.error as Error).message}
          <Button variant="link" size="sm" className="ml-2 h-auto p-0 text-urgent underline" onClick={() => donnees.refetch()}>Réessayer</Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_300px]">
        {/* Colonne principale */}
        <div className="min-w-0 space-y-5">
          <BandeauCa
            chargement={chargement}
            caNet={indicateurs?.caNet ?? 0}
            avoirs={indicateurs?.avoirs ?? 0}
            periode={indicateurs?.periode.libelle ?? `Année ${maintenant.getFullYear()} · TTC`}
            benefice={indicateurs?.benefice ?? 0}
            encours={indicateurs?.encours ?? 0}
            delai={indicateurs?.delaiPaiementJours ?? null}
            devisAcceptes={indicateurs?.devisAcceptes ?? 0}
          />

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <StatCle
              icon={LineChart} label="Chiffre d'affaires" chargement={chargement} href="/finance"
              valeur={euros.format(indicateurs?.caBrut ?? 0)}
              complement={<Pastille>{entier.format(indicateurs?.nbFactures ?? 0)} factures</Pastille>}
            />
            <StatCle
              icon={Landmark} label="Panier moyen" chargement={chargement}
              valeur={indicateurs?.panierMoyen === null || indicateurs?.panierMoyen === undefined ? '—' : euros.format(indicateurs.panierMoyen)}
              complement={<Pastille>{entier.format(indicateurs?.nbFactures ?? 0)} factures</Pastille>}
            />
            <StatCle
              icon={Receipt} label="Nombre de factures" chargement={chargement} href="/billing"
              valeur={entier.format(indicateurs?.nbFactures ?? 0)}
              complement="sur l'année en cours"
            />
            <CarteTaux
              icon={ShieldCheck} titre="Leads assurés" chargement={chargement}
              taux={indicateurs?.tauxLeadsAssures ?? { valeur: null, numerateur: 0, denominateur: 0 }}
              legende="{n} sur {d} leads de l'année"
            />
          </div>

          <CarteEvolution
            evolution={indicateurs?.evolution ?? []}
            chargement={chargement}
          />

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.25fr_1fr]">
            <CarteRetards
              retards={indicateurs?.retards ?? { tranches: [], total: 0, factures: 0 }}
              chargement={chargement}
            />
            <CarteAssureurs
              icon={Timer} titre="Délai de paiement par assurance" tri="delai" chargement={chargement}
              lignes={indicateurs?.assureurs.parDelai ?? []}
              sansDonnees={indicateurs?.assureurs.sansDonnees ?? true}
            />
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            <CarteAssureurs
              icon={ThumbsUp} titre="Meilleures assurances" tri="rang" chargement={chargement}
              lignes={indicateurs?.assureurs.meilleurs ?? []}
              sansDonnees={indicateurs?.assureurs.sansDonnees ?? true}
            />
            <CarteAssureurs
              icon={ThumbsDown} titre="Pires assurances" tri="rang" chargement={chargement}
              lignes={indicateurs?.assureurs.pires ?? []}
              sansDonnees={indicateurs?.assureurs.sansDonnees ?? true}
            />
            <CarteMarques marques={indicateurs?.marques ?? []} chargement={chargement} />
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <CarteTaux
              icon={ClipboardList} titre="Taux de conversion des devis" chargement={chargement}
              taux={indicateurs?.tauxConversionDevis ?? { valeur: null, numerateur: 0, denominateur: 0 }}
              legende="{n} acceptés sur {d} devis"
            />
            <CarteFormules formules={indicateurs?.formules ?? []} chargement={chargement} />
          </div>
        </div>

        {/* Colonne de droite */}
        <aside className="space-y-5">
          <MiniCalendrier rendezVous={rendezVous.data ?? []} />
          <CarteEvenements rendezVous={rdvAVenir} chargement={rendezVous.isLoading} />
          <CarteTaches taches={tachesAVenir} chargement={taches.isLoading} />
          <CarteObjectif
            caNet={indicateurs?.caNet ?? 0}
            objectif={reglages.data?.objectif_annuel ?? null}
            chargement={chargement || reglages.isLoading}
          />
        </aside>
      </div>
    </div>
  );
}
