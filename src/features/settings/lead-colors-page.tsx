import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Palette, RotateCcw, Save } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { messageErreurBase } from '@/lib/erreurs';
import {
  DEFAULT_LEAD_STAGE_COLORS,
  LEAD_COLOR_KEYS,
  fetchLeadStageColors,
  normaliserLeadStageColors,
  saveLeadStageColors,
  type LeadColorKey,
  type LeadStageColors,
} from '@/features/leads/lead-color-settings';

const ETAPES: Array<{ key: LeadColorKey; label: string; description: string }> = [
  { key: 'nouveau', label: 'Nouveau lead', description: 'Nouveau, à appeler et appel en cours' },
  { key: 'nrp', label: 'NRP', description: 'Client non joint' },
  { key: 'qualifie', label: 'Qualifié', description: 'Besoin confirmé' },
  { key: 'documents_requested', label: 'Attente documents', description: 'Lien envoyé, pièces attendues' },
  { key: 'documents_received', label: 'Documents reçus', description: 'Toutes les pièces obligatoires reçues' },
  { key: 'rdv', label: 'RDV pris', description: 'Créneau planifié' },
  { key: 'perdu', label: 'Perdu', description: 'Lead sorti du parcours' },
  { key: 'cloture', label: 'Clôturé', description: 'Dossier terminé' },
];

export function LeadColorsPage() {
  const queryClient = useQueryClient();
  const [colors, setColors] = useState<LeadStageColors>(DEFAULT_LEAD_STAGE_COLORS);

  const query = useQuery({
    queryKey: ['lead-stage-colors'],
    queryFn: fetchLeadStageColors,
    retry: false,
  });

  useEffect(() => {
    if (query.data) setColors(normaliserLeadStageColors(query.data));
  }, [query.data]);

  const save = useMutation({
    mutationFn: saveLeadStageColors,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['lead-stage-colors'] });
      toast.success('Couleurs du pipeline enregistrées');
    },
    onError: (error: Error) => toast.error(messageErreurBase(error.message)),
  });

  const updateColor = (key: LeadColorKey, value: string) => {
    if (!/^#[0-9a-f]{6}$/i.test(value)) return;
    setColors((current) => ({ ...current, [key]: value.toLowerCase() }));
  };

  return (
    <>
      <PageHeader
        title="Couleurs du pipeline"
        description="Choisissez la couleur de chaque étape du parcours lead"
        action={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <Button
              variant="outline"
              className="min-h-11 flex-1 rounded-full sm:min-h-9 sm:flex-none"
              onClick={() => setColors({ ...DEFAULT_LEAD_STAGE_COLORS })}
              disabled={save.isPending}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Valeurs par défaut
            </Button>
            <Button
              className="min-h-11 flex-1 rounded-full sm:min-h-9 sm:flex-none"
              onClick={() => save.mutate(colors)}
              disabled={save.isPending || query.isLoading || query.isError}
            >
              {save.isPending
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <Save className="mr-2 h-4 w-4" />}
              Enregistrer
            </Button>
          </div>
        }
      />

      <div className="overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-4xl space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3">
            <Palette className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p className="text-sm text-muted-foreground">
              Les couleurs s’appliquent à toute l’équipe dans le tableau, la liste mobile,
              le pipeline et les pastilles de statut. L’aperçu se met à jour avant l’enregistrement.
            </p>
          </div>

          {query.isLoading && (
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 8 }).map((_, index) => (
                <Skeleton key={index} className="h-28 rounded-xl" />
              ))}
            </div>
          )}

          {query.isError && (
            <Card className="border-destructive/30">
              <CardContent className="p-5 text-center">
                <p className="font-medium text-destructive">Réglage indisponible</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  La migration des couleurs du pipeline doit être appliquée dans Supabase.
                </p>
                <Button variant="outline" className="mt-4 rounded-full" onClick={() => query.refetch()}>
                  Réessayer
                </Button>
              </CardContent>
            </Card>
          )}

          {query.data && (
            <div className="grid gap-3 sm:grid-cols-2">
              {ETAPES.map((stage) => (
                <Card key={stage.key} className="overflow-hidden">
                  <CardContent className="flex items-center gap-4 p-4">
                    <label
                      className="relative h-14 w-14 shrink-0 cursor-pointer overflow-hidden rounded-xl border-2 shadow-sm"
                      style={{ backgroundColor: colors[stage.key], borderColor: colors[stage.key] }}
                      title={`Choisir la couleur de ${stage.label}`}
                    >
                      <input
                        type="color"
                        value={colors[stage.key]}
                        onChange={(event) => updateColor(stage.key, event.target.value)}
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                        aria-label={`Couleur de ${stage.label}`}
                      />
                    </label>

                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-foreground">{stage.label}</p>
                      <p className="mb-2 truncate text-xs text-muted-foreground">{stage.description}</p>
                      <div className="flex items-center gap-2">
                        <Input
                          value={colors[stage.key]}
                          onChange={(event) => updateColor(stage.key, event.target.value)}
                          className="h-8 w-28 font-mono text-xs uppercase"
                          aria-label={`Code couleur de ${stage.label}`}
                        />
                        <span
                          className="rounded-full border px-2.5 py-1 text-[11px] font-semibold"
                          style={{
                            color: colors[stage.key],
                            borderColor: colors[stage.key],
                            backgroundColor: `color-mix(in srgb, ${colors[stage.key]} 14%, transparent)`,
                          }}
                        >
                          Aperçu
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {query.data && (
            <p className="text-center text-xs text-muted-foreground">
              {LEAD_COLOR_KEYS.length} situations personnalisables, dont une couleur distincte
              lorsque tous les documents sont reçus.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
