import { useCallback, useEffect, useMemo, useState } from 'react';
import { fondDepuis } from '@/features/dossier/dossier-constants';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import {
  CheckCircle2, Search, Loader2, X, Play, AlertTriangle,
  CalendarClock, UserRoundSearch, FileText,
} from 'lucide-react';
import { DialogueResultatAppel, type ChoixResultat } from './components/dialogue-resultat-appel';
import { resultatParCle } from './resultat-appel';
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
import { SessionRelance } from './components/session-relance';
import {
  fetchRelances, compterRelances, reporterRelance, marquerRelanceTraitee,
  journaliserAction,
  enregistrerResultatAppel,
  type Relance, type RelanceKind, type UrgencyLevel, type RelanceSort,
  type CompteursRelances,
} from '@/services/relances-service';
import { archiverLeadsSelectionnes } from '@/services/leads-service';
import { createClientDocumentRequest } from '@/services/client-documents-service';
import { fetchReglagesEntreprise } from '@/services/admin-service';
import { preparerSmsNrp } from './preparer-sms-nrp';

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
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();

  const [filtre, setFiltre] = useState<CleFiltre>('toutes');
  const [recherche, setRecherche] = useState('');
  const [rechercheDifferee, setRechercheDifferee] = useState('');
  const [tri, setTri] = useState<RelanceSort>('priorite');
  const [page, setPage] = useState(0);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [enCours, setEnCours] = useState<string | null>(null);
  const [session, setSession] = useState<Relance[] | null>(null);
  const [preparationSession, setPreparationSession] = useState(false);

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

  const { data: reglages } = useQuery({
    queryKey: ['reglages-entreprise'],
    queryFn: fetchReglagesEntreprise,
    staleTime: 5 * 60_000,
  });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['relances', filtresRequete],
    queryFn: () => fetchRelances(filtresRequete),
    placeholderData: keepPreviousData,
  });

  // Memoise pour la meme raison : sans cela ouvrirDossier serait recree a
  // chaque rendu et RelanceRow perdrait son memo.
  const relances = useMemo(() => data?.relances ?? [], [data]);
  const total = data?.total ?? 0;

  // Qualifier l'appel est ce qui fait avancer le lead. Sans ce dialogue, le
  // statut ne changeait pas et le lead revenait en tete de file aussitot.
  const [appelAQualifier, setAppelAQualifier] = useState<Relance | null>(null);
  const [contexteQualif, setContexteQualif] = useState<'appel' | 'traitement'>('appel');

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

  const archiver = useMutation({
    mutationFn: async (cibles: Relance[]) => {
      const ids = [...new Set(
        cibles
          .filter(estRelanceLeadArchivable)
          .map((r) => r.leadId as string),
      )];
      if (ids.length === 0) throw new Error('Aucun lead archivable dans cette sélection');
      return archiverLeadsSelectionnes(ids);
    },
    onSuccess: (nombre) => {
      setSelection(new Set());
      rafraichir();
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success(`${nombre} lead${nombre > 1 ? 's' : ''} archivé${nombre > 1 ? 's' : ''}`);
    },
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
      .catch((e: Error) => toast.error(e.message));
    // Le dialogue s'ouvre tout de suite : demander le resultat plus tard
    // reviendrait a ne jamais le demander.
    setContexteQualif('appel');
    setAppelAQualifier(r);
  };

  const qualifierAppel = useMutation({
    mutationFn: async (choix: ChoixResultat) => {
      if (!appelAQualifier?.leadId) return;
      const resultat = resultatParCle(choix.cle);
      await enregistrerResultatAppel({
        leadId: appelAQualifier.leadId,
        statut: resultat.statut,
        prochaineAction: choix.prochaineAction,
        note: choix.note,
      });
      const sms = choix.envoyerSmsNrp
        ? await preparerSmsNrp(appelAQualifier, reglages?.telephone)
        : null;
      return { resultat, sms };
    },
    onSuccess: (resultatEnregistre) => {
      const nom = appelAQualifier?.titre ?? 'Le lead';
      setAppelAQualifier(null);
      rafraichir();
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      const resultat = resultatEnregistre?.resultat;
      toast.success(
        resultat?.sortDeFile
          ? `${nom} quitte les relances`
          : `${nom} — ${resultat?.label.toLowerCase()}`,
      );
      if (resultatEnregistre?.sms) {
        window.location.href = `sms:${resultatEnregistre.sms.phone}?body=${encodeURIComponent(resultatEnregistre.sms.message)}`;
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const envoyerSms = (r: Relance) => {
    if (!r.phone) return;
    window.location.href = `sms:${r.phone}`;
    journaliserAction(r, 'sms_outbound', 'SMS depuis les relances')
      .then(rafraichir)
      .catch((e: Error) => toast.error(e.message));
  };

  const demanderDocuments = async (r: Relance) => {
    if (!r.phone) {
      toast.error('Aucun téléphone sur cette fiche');
      return;
    }
    if (!r.leadId) {
      toast.error('Cette relance n’a pas de lead associé');
      return;
    }
    try {
      const request = await createClientDocumentRequest(r.leadId);
      const prenom = r.titre.split(' ')[0];
      const message = `Bonjour ${prenom}, il nous manque encore vos documents pour avancer sur votre dossier pare-brise. Déposez-les ici : ${request.url} — Relais Pare-Brise`;
      window.location.href = `sms:${r.phone}?body=${encodeURIComponent(message)}`;
      await journaliserAction(r, 'sms_outbound', message);
      rafraichir();
      queryClient.invalidateQueries({ queryKey: ['client-document-request', r.leadId] });
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  // La liste transmise permet d'enchainer les dossiers sans revenir ici, et
  // `background` fait que cette page reste montee derriere la fiche.
  const ouvrirDossier = useCallback((leadId: string) => {
    const liste = relances.map((r) => r.leadId).filter((id): id is string => !!id);
    navigate(`/interventions/${leadId}`, {
      state: { background: fondDepuis(location), liste, mode: 'relance' },
    });
  }, [relances, navigate, location]);

  const ouvrir = (r: Relance) => {
    if (r.leadId) ouvrirDossier(r.leadId);
    else toast.info('Cette relance n’a pas de fiche client associée');
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

  const relancesSelectionnees = relances.filter((r) => selection.has(r.id));
  const nbLeadsSelectionnes = relancesSelectionnees.filter(estRelanceLeadArchivable).length;

  // La session travaille sur une file large, triee par priorite, independante
  // de la pagination de la liste : on ne veut pas s'arreter au bout de 50.
  const demarrerSession = async () => {
    setPreparationSession(true);
    try {
      const { relances: file } = await fetchRelances({
        ...filtresRequete, limit: 200, offset: 0,
      });
      if (file.length === 0) {
        toast.info('Aucune relance à traiter dans ce filtre');
        return;
      }
      setSession(file);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPreparationSession(false);
    }
  };

  const changerFiltre = (cle: CleFiltre) => {
    setFiltre(cle);
    setPage(0);
    setSelection(new Set());
  };

  const pageMax = Math.max(0, Math.ceil(total / PAR_PAGE) - 1);

  if (session) {
    return (
      <SessionRelance
        file={session}
        telephoneEntreprise={reglages?.telephone}
        onFermer={() => { setSession(null); rafraichir(); }}
        onTermine={() => { setSession(null); rafraichir(); }}
        onOuvrirFiche={ouvrirDossier}
      />
    );
  }

  return (
    <>
      <PageHeader
        title="Relances"
        description="La file d’actions commerciale, classée par priorité."
      />

      <ResumeRelances compteurs={compteurs} filtre={filtre} onFiltrer={changerFiltre} />

      {/* Filtres compacts et cliquables, avec compteurs réels */}
      <div className="flex flex-nowrap items-center gap-1 overflow-x-auto border-b border-border px-4 py-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {FILTRES.map(({ cle, label, compteur }) => {
          const n = compteur && compteurs ? compteurs[compteur] : undefined;
          const actif = filtre === cle;
          return (
            <button
              key={cle}
              type="button"
              onClick={() => changerFiltre(cle)}
              className={cn(
                'flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors duration-100 md:min-h-0 md:px-2.5 md:py-1.5',
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
      <div className="grid grid-cols-2 items-center gap-2 border-b border-border px-4 py-3 sm:flex sm:flex-wrap sm:py-2">
        <div className="relative col-span-2 min-w-0 sm:max-w-xs sm:flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Nom, téléphone, immatriculation…"
            className="rounded-lg pl-9 pr-11 text-sm md:h-8"
          />
          {recherche && (
            <button
              type="button" onClick={() => setRecherche('')}
              className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground md:h-8 md:w-8"
            >
              <X className="h-3.5 w-3.5" />
              <span className="sr-only">Effacer la recherche</span>
            </button>
          )}
        </div>

        <Select value={tri} onValueChange={(v) => { setTri(v as RelanceSort); setPage(0); }}>
          <SelectTrigger className="w-full rounded-lg text-sm sm:w-48 md:h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="plus_recent">Arrivés en dernier</SelectItem>
            <SelectItem value="plus_ancien">Arrivés en premier</SelectItem>
            <SelectItem value="priorite">Priorité calculée</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex min-w-0 items-center justify-end gap-2 sm:ml-auto">
          <Button size="sm" className="w-full rounded-full sm:w-auto md:h-8"
            onClick={() => void demarrerSession()} disabled={preparationSession || total === 0}>
            {preparationSession
              ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              : <Play className="mr-1.5 h-3.5 w-3.5" />}
            Démarrer ma session
          </Button>
          {isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          {total > 0 && (
            <span className="hidden whitespace-nowrap text-xs text-muted-foreground tabular sm:inline">
              {page * PAR_PAGE + 1}–{Math.min((page + 1) * PAR_PAGE, total)} sur {total}
            </span>
          )}
        </div>
      </div>

      {/* Actions groupées */}
      {selection.size > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto border-b border-border bg-accent/40 px-4 py-2 animate-slide-in [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <span className="shrink-0 text-sm font-medium tabular">
            {selection.size} sélectionnée{selection.size > 1 ? 's' : ''}
          </span>
          <Button variant="outline" size="sm" className="shrink-0 rounded-full md:h-7" onClick={reporterSelection}>
            Reporter à demain
          </Button>
          {nbLeadsSelectionnes > 0 && (
            <Button
              variant="outline" size="sm"
              className="shrink-0 rounded-full md:h-7"
              disabled={archiver.isPending}
              onClick={() => archiver.mutate(relancesSelectionnees)}
            >
              Archiver {nbLeadsSelectionnes} lead{nbLeadsSelectionnes > 1 ? 's' : ''}
            </Button>
          )}
          <Button variant="ghost" size="sm" className="shrink-0 rounded-full md:h-7"
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
                onArchiver={(x) => lancer(x, (cible) => archiver.mutate([cible]))}
                onTraiter={(x) => {
                  // Sur un lead, « traite » ne veut rien dire : reporter d'un
                  // jour le ramenait identique le lendemain, indefiniment.
                  // Taches et rendez-vous, eux, ont un etat final reel.
                  if (x.leadId && !x.taskId && !x.appointmentId) {
                    setContexteQualif('traitement');
                    setAppelAQualifier(x);
                  } else {
                    lancer(x, traiter.mutate);
                  }
                }}
              />
            ))}

            {pageMax > 0 && (
              <div className="flex items-center justify-center gap-2 py-4">
                <Button variant="outline" size="sm" className="rounded-full md:h-8"
                  disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  Précédent
                </Button>
                <span className="text-xs text-muted-foreground tabular">
                  Page {page + 1} / {pageMax + 1}
                </span>
                <Button variant="outline" size="sm" className="rounded-full md:h-8"
                  disabled={page >= pageMax} onClick={() => setPage((p) => p + 1)}>
                  Suivant
                </Button>
              </div>
            )}
          </>
        )}
      </div>


      <DialogueResultatAppel
        ouvert={appelAQualifier !== null}
        onOuvertChange={(o) => !o && setAppelAQualifier(null)}
        nom={appelAQualifier?.titre ?? ''}
        contexte={contexteQualif}
        telephone={appelAQualifier?.phone}
        enCours={qualifierAppel.isPending}
        onValider={(choix) => qualifierAppel.mutate(choix)}
      />

    </>
  );
}

function estRelanceLeadArchivable(relance: Relance): boolean {
  return !!relance.leadId
    && !relance.taskId
    && !relance.appointmentId
    && !relance.caseId;
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

function ResumeRelances({
  compteurs, filtre, onFiltrer,
}: {
  compteurs?: CompteursRelances;
  filtre: CleFiltre;
  onFiltrer: (filtre: CleFiltre) => void;
}) {
  const cartes: {
    cle: CleFiltre; label: string; valeur: number; aide: string;
    icone: typeof AlertTriangle; style: string;
  }[] = [
    {
      cle: 'urgent', label: 'En retard', valeur: compteurs?.urgent ?? 0,
      aide: 'À résorber en premier', icone: AlertTriangle,
      style: 'text-urgent bg-urgent-soft',
    },
    {
      cle: 'due', label: "Aujourd’hui", valeur: compteurs?.due ?? 0,
      aide: 'Échéances du jour', icone: CalendarClock,
      style: 'text-due bg-due-soft',
    },
    {
      cle: 'nouveau', label: 'Jamais appelés', valeur: compteurs?.nouveau ?? 0,
      aide: 'À contacter sans attendre', icone: UserRoundSearch,
      style: 'text-primary bg-primary/10',
    },
    {
      cle: 'documents', label: 'Documents', valeur: compteurs?.documents ?? 0,
      aide: 'Dossiers à débloquer', icone: FileText,
      style: 'text-muted-foreground bg-muted',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 border-b border-border px-4 py-3 lg:grid-cols-4">
      {cartes.map(({ cle, label, valeur, aide, icone: Icone, style }) => (
        <button
          key={cle}
          type="button"
          onClick={() => onFiltrer(cle)}
          className={cn(
            'flex min-h-[116px] min-w-0 items-start gap-2 rounded-xl border px-3 py-3 text-left transition-colors sm:min-h-0 sm:items-center sm:gap-3 sm:py-2.5',
            filtre === cle ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-muted/40',
          )}
        >
          <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', style)}>
            <Icone className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xl font-semibold tabular text-foreground">{valeur}</span>
            <span className="block text-sm font-medium leading-tight text-foreground">{label}</span>
            <span className="mt-1 hidden text-xs leading-tight text-muted-foreground sm:block">{aide}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
