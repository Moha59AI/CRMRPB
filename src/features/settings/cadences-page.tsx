import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, RotateCcw, Loader2, Lock, Info } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/features/auth/auth-context';
import { messageErreurBase } from '@/lib/erreurs';
import { statusLabels } from '@/features/leads/lead-shared';
import {
  fetchCadences, definirCadence, reinitialiserCadences,
  decomposer, enMinutes, formaterDelai, type Cadence, type Unite,
} from '@/services/cadences-service';
import type { LeadStatus } from '@/types';

/**
 * Réglage des cadences de relance.
 *
 * C'est le paramètre qui agit le plus directement sur les conversions, et
 * celui qu'on veut essayer plusieurs fois avant de trancher. Il vivait dans
 * un `CASE` SQL : changer un seul nombre imposait une migration.
 *
 * Les deux notions sont séparées à l'écran parce qu'elles ne se règlent pas
 * de la même façon : un délai par statut se pose une fois, une cadence de
 * rappel se lit comme une suite — 2 h, puis 1 j, puis 3 j — et ne se comprend
 * qu'en voyant les échelons les uns sous les autres.
 */

/** Statuts dont le délai ne dépend pas du nombre de tentatives. */
const STATUTS_SIMPLES: LeadStatus[] = [
  'new', 'to_call', 'calling', 'interested',
  'documents_requested', 'documents_received',
];

const EXPLICATION: Partial<Record<LeadStatus, string>> = {
  new: "Un lead qui vient d'arriver. Zéro le place en tête de file immédiatement.",
  to_call: 'Marqué à appeler, en attente de son tour.',
  calling: 'Appel entamé puis interrompu.',
  interested: "Le client s'est montré intéressé mais n'a pas conclu.",
  documents_requested: 'Carte grise et attestation demandées, sans retour.',
  documents_received: 'Pièces reçues, dossier Glass à créer dans Onify.',
};

export function CadencesPage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const modifiable = profile?.role === 'admin' || profile?.role === 'manager';

  const { data: cadences, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['cadences'],
    queryFn: fetchCadences,
  });

  const rafraichir = () => {
    queryClient.invalidateQueries({ queryKey: ['cadences'] });
    // La file de relances est recalculee a partir de ces delais.
    queryClient.invalidateQueries({ queryKey: ['relances'] });
    queryClient.invalidateQueries({ queryKey: ['relances-compteurs'] });
  };

  const maj = useMutation({
    mutationFn: ({ statut, tentative, minutes }:
      { statut: LeadStatus; tentative: number; minutes: number | null }) =>
      definirCadence(statut, tentative, minutes),
    onSuccess: () => {
      rafraichir();
      toast.success('Cadence enregistrée');
    },
    onError: (e: Error) => toast.error(messageErreurBase(e.message)),
  });

  const reinit = useMutation({
    mutationFn: reinitialiserCadences,
    onSuccess: () => {
      rafraichir();
      toast.success('Cadences remises aux valeurs par défaut');
    },
    onError: (e: Error) => toast.error(messageErreurBase(e.message)),
  });

  const trouver = (statut: LeadStatus, tentative = 0) =>
    (cadences ?? []).find((c) => c.statut === statut && c.tentative_min === tentative);

  const echelonsNrp = (cadences ?? [])
    .filter((c) => c.statut === 'nrp')
    .sort((a, b) => a.tentative_min - b.tentative_min);

  return (
    <>
      <PageHeader
        title="Cadences de relance"
        description="Quand un lead revient dans la file, et quand il en sort"
        action={
          modifiable ? (
            <Button
              variant="outline" className="rounded-full"
              onClick={() => reinit.mutate()} disabled={reinit.isPending}
            >
              {reinit.isPending
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <RotateCcw className="mr-2 h-4 w-4" />}
              Valeurs par défaut
            </Button>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="h-3.5 w-3.5" />
              Lecture seule
            </span>
          )
        }
      />

      <div className="space-y-6 overflow-y-auto p-6">
        <div className="flex items-start gap-2.5 rounded-xl border border-border bg-muted/30 px-4 py-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Le délai court à partir du dernier contact, ou de la réception du lead
            s'il n'a jamais été appelé. Un changement s'applique immédiatement à
            toute la file — y compris aux leads déjà en attente.
          </p>
        </div>

        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
        )}

        {isError && (
          <Card className="rounded-xl border border-destructive/30">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">
                {messageErreurBase((error as Error)?.message ?? '')}
              </p>
              <Button variant="outline" className="mt-3 rounded-full" onClick={() => refetch()}>
                Réessayer
              </Button>
            </CardContent>
          </Card>
        )}

        {cadences && (
          <>
            <Card className="rounded-xl border border-border">
              <CardHeader>
                <CardTitle className="text-sm">Délai par situation</CardTitle>
                <CardDescription className="text-xs">
                  Combien de temps attendre avant qu'un lead réapparaisse dans les relances.
                </CardDescription>
              </CardHeader>
              <CardContent className="divide-y divide-border">
                {STATUTS_SIMPLES.map((statut) => {
                  const c = trouver(statut);
                  if (!c) return null;
                  return (
                    <LigneCadence
                      key={statut}
                      titre={statusLabels[statut] ?? statut}
                      explication={EXPLICATION[statut]}
                      cadence={c}
                      modifiable={modifiable}
                      enCours={maj.isPending}
                      onEnregistrer={(minutes) =>
                        maj.mutate({ statut, tentative: 0, minutes })}
                      autoriserSortie={false}
                    />
                  );
                })}
              </CardContent>
            </Card>

            <Card className="rounded-xl border border-border">
              <CardHeader>
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted/40">
                    <BellRing className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="space-y-1">
                    <CardTitle className="text-sm">Rappels après un sans-réponse</CardTitle>
                    <CardDescription className="text-xs">
                      Un échelon par tentative. Le dernier décide quand cesser de rappeler.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="divide-y divide-border">
                {echelonsNrp.map((c) => (
                  <LigneCadence
                    key={c.tentative_min}
                    titre={`Après ${c.tentative_min} tentative${c.tentative_min > 1 ? 's' : ''}`}
                    explication={
                      c.sort_de_file
                        ? "Le lead quitte les relances. Rappeler indéfiniment un numéro qui ne répond pas encombre la file."
                        : undefined
                    }
                    cadence={c}
                    modifiable={modifiable}
                    enCours={maj.isPending}
                    onEnregistrer={(minutes) =>
                      maj.mutate({ statut: 'nrp', tentative: c.tentative_min, minutes })}
                    autoriserSortie
                  />
                ))}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </>
  );
}

function LigneCadence({
  titre, explication, cadence, modifiable, enCours, onEnregistrer, autoriserSortie,
}: {
  titre: string;
  explication?: string;
  cadence: Cadence;
  modifiable: boolean;
  enCours: boolean;
  onEnregistrer: (minutes: number | null) => void;
  autoriserSortie: boolean;
}) {
  const initial = decomposer(cadence.delai_minutes);
  const [valeur, setValeur] = useState(String(initial.valeur));
  const [unite, setUnite] = useState<Unite>(initial.unite);
  const [sortie, setSortie] = useState(cadence.sort_de_file);

  const courant = cadence.delai_minutes;
  const saisi = sortie ? null : enMinutes(Number(valeur) || 0, unite);
  const modifie = saisi !== courant;

  return (
    <div className="flex flex-wrap items-start justify-between gap-4 py-4 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{titre}</p>
        {explication && (
          <p className="mt-0.5 text-xs text-muted-foreground">{explication}</p>
        )}
        {!modifie && (
          <p className="mt-1 text-xs text-muted-foreground">
            Actuellement : <span className="text-foreground">{formaterDelai(courant)}</span>
          </p>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {autoriserSortie && (
          <div className="mr-2 flex items-center gap-2">
            <Switch
              checked={sortie}
              disabled={!modifiable}
              onCheckedChange={setSortie}
              aria-label={`${titre} — sort de la file`}
            />
            <Label className="text-xs text-muted-foreground">Sort de la file</Label>
          </div>
        )}

        {!sortie && (
          <>
            <Input
              type="number" min={0} inputMode="numeric"
              value={valeur}
              disabled={!modifiable}
              onChange={(e) => setValeur(e.target.value)}
              className="h-8 w-20 rounded-lg tabular"
              aria-label={`${titre} — durée`}
            />
            <Select
              value={unite}
              disabled={!modifiable}
              onValueChange={(v) => setUnite(v as Unite)}
            >
              <SelectTrigger className="h-8 w-24 rounded-lg text-xs" aria-label={`${titre} — unité`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="minutes">minutes</SelectItem>
                <SelectItem value="heures">heures</SelectItem>
                <SelectItem value="jours">jours</SelectItem>
              </SelectContent>
            </Select>
          </>
        )}

        {modifiable && modifie && (
          <Button
            size="sm" className="h-8 rounded-full"
            disabled={enCours}
            onClick={() => onEnregistrer(saisi)}
          >
            {enCours && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
            Enregistrer
          </Button>
        )}
      </div>
    </div>
  );
}
