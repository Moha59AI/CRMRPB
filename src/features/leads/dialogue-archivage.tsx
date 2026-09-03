import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { messageErreurBase } from '@/lib/erreurs';
import { compterLeadsArchivables, archiverLeadsAnciens } from '@/services/leads-service';

/**
 * Archivage en lot.
 *
 * Le compte s'affiche avant d'agir, et se recalcule à chaque changement de
 * délai. Archiver trois cents leads d'un clic sans savoir combien on en
 * enterre serait une mauvaise surprise, et le rattrapage se ferait un par un.
 *
 * La distinction jamais contactés / déjà contactés n'est pas décorative :
 * enterrer un lead qu'on n'a jamais appelé n'est pas du rangement, c'est
 * renoncer à une affaire. La case est donc décochée par défaut, et ce qu'elle
 * emporte est chiffré.
 */

interface DialogueArchivageProps {
  ouvert: boolean;
  onOuvertChange: (v: boolean) => void;
}

function formaterDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

export function DialogueArchivage({ ouvert, onOuvertChange }: DialogueArchivageProps) {
  const queryClient = useQueryClient();
  const [jours, setJours] = useState('2');
  const [inclureJamaisContactes, setInclure] = useState(false);

  const nbJours = Math.max(0, Number(jours) || 0);

  const { data: compte, isLoading } = useQuery({
    queryKey: ['leads-archivables', nbJours],
    queryFn: () => compterLeadsArchivables(nbJours),
    enabled: ouvert,
  });

  const emportes = compte
    ? inclureJamaisContactes ? compte.total : compte.deja_contactes
    : 0;

  const mutation = useMutation({
    mutationFn: () => archiverLeadsAnciens(nbJours, inclureJamaisContactes),
    onSuccess: (n) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['relances'] });
      queryClient.invalidateQueries({ queryKey: ['relances-compteurs'] });
      queryClient.invalidateQueries({ queryKey: ['leads-archivables'] });
      toast.success(`${n} lead${n > 1 ? 's' : ''} archivé${n > 1 ? 's' : ''}`, {
        description: "Ils restent rattachés à leur client et se retrouvent dans les archives.",
      });
      onOuvertChange(false);
    },
    onError: (e: Error) => toast.error(messageErreurBase(e.message)),
  });

  return (
    <Dialog open={ouvert} onOpenChange={onOuvertChange}>
      <DialogContent className="sm:rounded-2xl sm:max-w-md">
        <DialogHeader>
          <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            <Archive className="h-5 w-5 text-muted-foreground" />
          </div>
          <DialogTitle>Archiver les leads anciens</DialogTitle>
          <DialogDescription>
            Un lead archivé sort de la liste et de la file de relances. Il reste
            rattaché à son client et se retrouve — ce n'est pas une suppression.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="archivage-jours" className="text-xs text-muted-foreground">
              Archiver les leads arrivés il y a plus de
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="archivage-jours"
                type="number" min={0} inputMode="numeric"
                value={jours}
                onChange={(e) => setJours(e.target.value)}
                className="w-24 rounded-lg tabular"
              />
              <span className="text-sm text-muted-foreground">
                jour{nbJours > 1 ? 's' : ''}
              </span>
            </div>
          </div>

          {isLoading && <Skeleton className="h-20 w-full rounded-xl" />}

          {compte && (
            <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-3">
              <p className="text-sm text-foreground">
                <span className="text-lg font-semibold tabular">{emportes}</span>{' '}
                lead{emportes > 1 ? 's' : ''} sera{emportes > 1 ? 'ont' : ''} archivé
                {emportes > 1 ? 's' : ''}
              </p>

              {compte.total > 0 && (
                <p className="text-xs text-muted-foreground">
                  Du {formaterDate(compte.plus_ancien)} au {formaterDate(compte.plus_recent)}
                </p>
              )}

              <label className="flex items-start gap-2.5">
                <Checkbox
                  checked={inclureJamaisContactes}
                  onCheckedChange={(v) => setInclure(v === true)}
                  className="mt-0.5"
                />
                <span className="text-xs leading-relaxed text-muted-foreground">
                  Inclure les {compte.jamais_contactes} lead
                  {compte.jamais_contactes > 1 ? 's' : ''} jamais contacté
                  {compte.jamais_contactes > 1 ? 's' : ''}
                </span>
              </label>

              {/* Ce que la case emporte vraiment, dit avant qu'on clique. */}
              {inclureJamaisContactes && compte.jamais_contactes > 0 && (
                <div className="flex items-start gap-2 rounded-lg bg-due-soft px-2.5 py-2">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-due" />
                  <p className="text-xs leading-snug text-due">
                    {compte.jamais_contactes} de ces leads n'ont jamais été appelés.
                    Les archiver, c'est renoncer à les rappeler — pas seulement
                    ranger la liste.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button" variant="ghost" className="rounded-full"
            onClick={() => onOuvertChange(false)}
          >
            Annuler
          </Button>
          <Button
            type="button" className="rounded-full"
            disabled={mutation.isPending || emportes === 0}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Archiver {emportes > 0 ? emportes : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
