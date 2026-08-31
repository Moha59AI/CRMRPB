import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { CheckCircle2, Search, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { RelanceRow } from './components/relance-row';
import {
  fetchRelances, compterRelances, reporterRelance, marquerRelanceTraitee,
  journaliserAction,
  type Relance, type RelanceKind, type UrgencyLevel, type RelanceSort,
  type CompteursRelances,
} from '@/services/relances-service';

const PAR_PAGE = 50;

type CleFiltre = 'toutes' | UrgencyLevel | RelanceKind;

const FILTRES: { cle: CleFiltre; label: string; compteur: keyof CompteursRelances | null }[] = [
  { cle: 'toutes', label: 'Toutes', compteur: 'total' },
  { cle: 'urgent', label: 'En retard', compteur: 'urgent' },
  { cle: 'due', label: "Aujourd'hui", compteur: 'due' },
  { cle: 'upcoming', label: 'À venir', compteur: 'upcoming' },
  // Les filtres suivants suivent le parcours du lead, pas le type d'objet :
  // c'est ainsi qu'on travaille une file d'appels.
  { cle: 'nouveau', label: 'Jamais appelés', compteur: 'nouveau' },
  { cle: 'rappel', label: 'À rappeler', compteur: 'rappel' },
  { cle: 'documents', label: 'Documents', compteur: 'documents' },
  { cle: 'rdv', label: 'RDV à confirmer', compteur: 'rdv' },
];

const URGENCES: CleFiltre[] = ['urgent', 'due', 'upcoming'];

export function RelancesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [filtre, setFiltre] = useState<CleFiltre>('toutes');
  const [recherche, setRecherche] = useState('');
  const [rechercheDifferee, setRechercheDifferee] = useState('');
  const [tri, setTri] = useState<RelanceSort>('priorite');
  const [page, setPage] = useState(0);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [enCours, setEnCours] = useState<string | null>(null);

  // Anti-rebond : la recherche part en base, inutile d'interroger à chaque frappe.
  useEffect(() => {
    const t = window.setTimeout(() => {
      setRechercheDifferee(recherche);
      setPage(0);
    }, 300);
    return () => window.clearTimeout(t);
  }, [recherche]);

  const filtresRequete = useMemo(() => ({
    search: rechercheDifferee,
    urgencies: URGENCES.includes(filtre) ? [filtre as UrgencyLevel] : undefined,
    kinds: filtre !== 'toutes' && !URGENCES.includes(filtre)
      ? [filtre as RelanceKind] : undefined,
    sort: tri,
    limit: PAR_PAGE,
    offset: page * PAR_PAGE,
  }), [filtre, rechercheDifferee, tri, page]);

  const { data: compteurs } = useQuery({
    queryKey: ['relances-compteurs'],
    queryFn: () => compterRelances(),
  });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['relances', filtresRequete],
    queryFn: () => fetchRelances(filtresRequete),
    placeholderData: keepPreviousData,
  });

  const relances = data?.relances ?? [];
  const total = data?.total ?? 0;

  const rafraichir = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['relances'] });
    queryClient.invalidateQueries({ queryKey: ['relances-compteurs'] });
  }, [queryClient]);

  const reporter = useMutation({
    mutationFn: (r: Relance) => reporterRelance(r, 1),
    onSuccess: (_d, r) => { toast.success(`${r.titre} reporté à demain`); rafraichir(); },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setEnCours(null),
  });

  const traiter = useMutation({
    mutationFn: marquerRelanceTraitee,
    onSuccess: (_d, r) => { toast.success(`${r.titre} traité`); rafraichir(); },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setEnCours(null),
  });

  // Le fondu de sortie dure le temps de l'animation avant que la ligne parte
  // vraiment : l'utilisateur voit ce qu'il vient de faire.
  const lancer = (r: Relance, action: (r: Relance) => void) => {
    setEnCours(r.id);
    window.setTimeout(() => action(r), 260);
  };

  const appeler = (r: Relance) => {
    if (!r.phone) return;
    window.location.href = `tel:${r.phone}`;
    journaliserAction(r, 'call_outbound', 'Appel depuis les relances')
      .then(rafraichir)
      .catch((e: Error) => toast.error(e.message));
  };

  const envoyerSms = (r: Relance) => {
    if (!r.phone) return;
    window.location.href = `sms:${r.phone}`;
    journaliserAction(r, 'sms_outbound', 'SMS depuis les relances')
      .then(rafraichir)
      .catch((e: Error) => toast.error(e.message));
  };

  const demanderDocuments = (r: Relance) => {
    if (!r.phone) {
      toast.error('Aucun téléphone sur cette fiche');
      return;
    }
    const prenom = r.titre.split(' ')[0];
    const message = `Bonjour ${prenom}, il nous manque encore vos documents pour avancer sur votre dossier pare-brise. Relais Pare-Brise`;
    window.location.href = `sms:${r.phone}?body=${encodeURIComponent(message)}`;
    journaliserAction(r, 'sms_outbound', message)
      .then(rafraichir)
      .catch((e: Error) => toast.error(e.message));
  };

  const ouvrir = (r: Relance) => {
    if (r.leadId) navigate(`/leads?lead=${r.leadId}`);
    else if (r.caseId) navigate(`/cases?case=${r.caseId}`);
    else toast.info('Cette relance n’a pas de fiche associée');
  };

  const basculerSelection = useCallback((id: string, valeur: boolean) => {
    setSelection((s) => {
      const copie = new Set(s);
      if (valeur) copie.add(id); else copie.delete(id);
      return copie;
    });
  }, []);

  const reporterSelection = async () => {
    const cibles = relances.filter((r) => selection.has(r.id));
    const echecs: string[] = [];
    for (const r of cibles) {
      try { await reporterRelance(r, 1); } catch { echecs.push(r.titre); }
    }
    setSelection(new Set());
    rafraichir();
    if (echecs.length) toast.error(`${echecs.length} relance(s) non reportée(s)`);
    else toast.success(`${cibles.length} relance(s) reportée(s) à demain`);
  };

  const changerFiltre = (cle: CleFiltre) => {
    setFiltre(cle);
    setPage(0);
    setSelection(new Set());
  };

  const pageMax = Math.max(0, Math.ceil(total / PAR_PAGE) - 1);

  return (
    <>
      <PageHeader
        title="Relances"
        description="Tout ce qui attend une action de votre part, au même endroit."
      />

      {/* Filtres compacts et cliquables, avec compteurs réels */}
      <div className="flex flex-wrap items-center gap-1 border-b border-border px-4 py-2">
        {FILTRES.map(({ cle, label, compteur }) => {
          const n = compteur && compteurs ? compteurs[compteur] : undefined;
          const actif = filtre === cle;
          return (
            <button
              key={cle}
              type="button"
              onClick={() => changerFiltre(cle)}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors duration-100',
                actif ? 'bg-secondary text-secondary-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              {label}
              {n !== undefined && n > 0 && (
                <span className={cn('tabular text-xs', actif ? 'opacity-80' : 'opacity-60')}>
                  {n}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Barre d'outils */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Nom, téléphone, immatriculation…"
            className="h-8 rounded-lg pl-8 text-sm"
          />
          {recherche && (
            <button
              type="button" onClick={() => setRecherche('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
              <span className="sr-only">Effacer la recherche</span>
            </button>
          )}
        </div>

        <Select value={tri} onValueChange={(v) => { setTri(v as RelanceSort); setPage(0); }}>
          <SelectTrigger className="h-8 w-48 rounded-lg text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="priorite">Priorité recommandée</SelectItem>
            <SelectItem value="plus_ancien">Plus ancien</SelectItem>
            <SelectItem value="plus_recent">Plus récent</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-2">
          {isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          {total > 0 && (
            <span className="text-xs text-muted-foreground tabular">
              {page * PAR_PAGE + 1}–{Math.min((page + 1) * PAR_PAGE, total)} sur {total}
            </span>
          )}
        </div>
      </div>

      {/* Actions groupées */}
      {selection.size > 0 && (
        <div className="flex items-center gap-3 border-b border-border bg-accent/40 px-4 py-2 animate-slide-in">
          <span className="text-sm font-medium tabular">
            {selection.size} sélectionnée{selection.size > 1 ? 's' : ''}
          </span>
          <Button variant="outline" size="sm" className="h-7 rounded-full" onClick={reporterSelection}>
            Reporter à demain
          </Button>
          <Button variant="ghost" size="sm" className="h-7 rounded-full"
            onClick={() => setSelection(new Set())}>
            Annuler
          </Button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {isLoading ? (
          <div className="space-y-px p-3">
            {Array.from({ length: 10 }, (_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : relances.length === 0 ? (
          <EtatVide filtre={filtre} recherche={rechercheDifferee} />
        ) : (
          <>
            {relances.map((r) => (
              <RelanceRow
                key={r.id}
                relance={r}
                selectionnee={selection.has(r.id)}
                enCours={enCours === r.id}
                onSelection={basculerSelection}
                onAppeler={appeler}
                onSms={envoyerSms}
                onDemanderDocuments={demanderDocuments}
                onOuvrir={ouvrir}
                onReporter={(x) => lancer(x, reporter.mutate)}
                onTraiter={(x) => lancer(x, traiter.mutate)}
              />
            ))}

            {pageMax > 0 && (
              <div className="flex items-center justify-center gap-2 py-4">
                <Button variant="outline" size="sm" className="h-8 rounded-full"
                  disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  Précédent
                </Button>
                <span className="text-xs text-muted-foreground tabular">
                  Page {page + 1} / {pageMax + 1}
                </span>
                <Button variant="outline" size="sm" className="h-8 rounded-full"
                  disabled={page >= pageMax} onClick={() => setPage((p) => p + 1)}>
                  Suivant
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

function EtatVide({ filtre, recherche }: { filtre: CleFiltre; recherche: string }) {
  const message = recherche
    ? `Aucune relance ne correspond à « ${recherche} ».`
    : filtre === 'toutes'
      ? 'Aucun lead en attente, aucune tâche en retard et aucun rendez-vous à confirmer dans les sept prochains jours.'
      : 'Rien dans cette catégorie pour le moment.';

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center animate-fade-in">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-done-soft">
        <CheckCircle2 className="h-6 w-6 text-done" />
      </div>
      <h2 className="text-base font-semibold text-foreground">
        {recherche ? 'Aucun résultat' : 'Rien à relancer'}
      </h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
