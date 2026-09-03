import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2, Loader2, AlertTriangle, Unlink } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { messageErreurBase } from '@/lib/erreurs';
import { impactSuppressionArchives, supprimerLeadsArchives } from '@/services/leads-service';

/**
 * Vider les archives.
 *
 * Le décompte s'affiche avant, et il distingue deux choses qui ne se valent
 * pas : ce qui est détruit et ce qui devient orphelin. Une note d'appel perdue
 * ne se retrouve nulle part ; une communication sans lien reste consultable
 * dans l'historique général.
 *
 * Supprimer trois cents leads sans savoir qu'on emporte cent notes d'appel
 * serait une perte silencieuse — et définitive.
 */

interface DialogueSuppressionArchivesProps {
  ouvert: boolean;
  onOuvertChange: (v: boolean) => void;
}

export function DialogueSuppressionArchives({
  ouvert, onOuvertChange,
}: DialogueSuppressionArchivesProps) {
  const queryClient = useQueryClient();

  const { data: impact, isLoading } = useQuery({
    queryKey: ['impact-suppression-archives'],
    queryFn: impactSuppressionArchives,
    enabled: ouvert,
  });

  const mutation = useMutation({
    mutationFn: supprimerLeadsArchives,
    onSuccess: (n) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['relances'] });
      queryClient.invalidateQueries({ queryKey: ['impact-suppression-archives'] });
      queryClient.invalidateQueries({ queryKey: ['journal-audit'] });
      toast.success(`${n} lead${n > 1 ? 's' : ''} supprimé${n > 1 ? 's' : ''}`);
      onOuvertChange(false);
    },
    onError: (e: Error) => toast.error(messageErreurBase(e.message)),
  });

  const rien = !impact || impact.leads === 0;

  return (
    <AlertDialog open={ouvert} onOpenChange={onOuvertChange}>
      <AlertDialogContent className="sm:rounded-2xl">
        <AlertDialogHeader>
          <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
            <Trash2 className="h-5 w-5 text-destructive" />
          </div>
          <AlertDialogTitle>Vider les archives</AlertDialogTitle>
          <AlertDialogDescription>
            Cette suppression est définitive. Contrairement à l'archivage, rien ne
            se récupère ensuite.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {isLoading && <Skeleton className="h-28 w-full rounded-xl" />}

        {impact && (
          <div className="space-y-3">
            <p className="text-sm text-foreground">
              <span className="text-lg font-semibold tabular">{impact.leads}</span>{' '}
              lead{impact.leads > 1 ? 's' : ''} archivé{impact.leads > 1 ? 's' : ''}
              {' '}sera{impact.leads > 1 ? 'ont' : ''} supprimé{impact.leads > 1 ? 's' : ''}
            </p>

            {(impact.notes > 0 || impact.taches > 0) && (
              <Categorie
                icone={<AlertTriangle className="h-3.5 w-3.5" />}
                titre="Détruits avec eux"
                grave
                lignes={[
                  impact.notes > 0 ? `${impact.notes} note${impact.notes > 1 ? 's' : ''} d'appel` : null,
                  impact.taches > 0 ? `${impact.taches} tâche${impact.taches > 1 ? 's' : ''}` : null,
                ]}
              />
            )}

            {(impact.communications > 0 || impact.rendez_vous > 0 || impact.dossiers > 0) && (
              <Categorie
                icone={<Unlink className="h-3.5 w-3.5" />}
                titre="Conservés, mais sans lien"
                lignes={[
                  impact.communications > 0
                    ? `${impact.communications} appel${impact.communications > 1 ? 's' : ''} ou SMS`
                    : null,
                  impact.rendez_vous > 0
                    ? `${impact.rendez_vous} rendez-vous` : null,
                  impact.dossiers > 0
                    ? `${impact.dossiers} dossier${impact.dossiers > 1 ? 's' : ''} vitrage` : null,
                ]}
              />
            )}

            {rien && (
              <p className="text-xs text-muted-foreground">
                Aucun lead archivé. Archivez d'abord ce que vous voulez supprimer.
              </p>
            )}
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel className="rounded-full">Annuler</AlertDialogCancel>
          <AlertDialogAction
            className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={mutation.isPending || rien}
            onClick={(e) => { e.preventDefault(); mutation.mutate(); }}
          >
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Supprimer définitivement
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function Categorie({
  icone, titre, lignes, grave,
}: {
  icone: React.ReactNode;
  titre: string;
  lignes: (string | null)[];
  grave?: boolean;
}) {
  const visibles = lignes.filter((l): l is string => l !== null);
  if (visibles.length === 0) return null;

  return (
    <div
      className={cn(
        'rounded-xl px-3 py-2',
        grave ? 'bg-destructive/10' : 'bg-muted/50',
      )}
    >
      <p
        className={cn(
          'flex items-center gap-1.5 text-xs font-medium',
          grave ? 'text-destructive' : 'text-muted-foreground',
        )}
      >
        {icone}
        {titre}
      </p>
      <ul className="mt-1 space-y-0.5">
        {visibles.map((l) => (
          <li key={l} className="text-xs text-muted-foreground">{l}</li>
        ))}
      </ul>
    </div>
  );
}
