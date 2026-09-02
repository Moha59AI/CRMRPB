import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Shield, Plus, Pencil, Trash2, Loader2, PhoneCall, EyeOff, Eye,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmerSuppression } from '@/components/ConfirmerSuppression';
import { ChampAdresse } from '@/components/ChampAdresse';
import { useAuth } from '@/features/auth/auth-context';
import { messageErreurBase } from '@/lib/erreurs';
import {
  fetchInsurers, creerAssureur, modifierAssureur, supprimerAssureur,
  compterDossiersAssureur, ASSUREUR_VIDE, type SaisieAssureur,
} from '@/services/insurers-service';
import type { Insurer } from '@/types';

/**
 * Gestion des assureurs.
 *
 * La table existait, la fiche dossier proposait une liste déroulante — vide,
 * faute d'écran pour la remplir. Ajouter un assureur demandait le SQL Editor.
 *
 * Trois informations méritent d'être stockées parce qu'elles reviennent à
 * chaque dossier : la franchise habituelle (première question du client au
 * téléphone), le numéro de convention (qui conditionne la prise en charge
 * directe) et la ligne sinistre, qui n'est pas le standard.
 */

const schema = z.object({
  name: z.string().min(1, "Le nom de l'assureur est requis"),
  phone: z.string(),
  email: z.string().email('Adresse invalide').or(z.literal('')),
  claims_phone: z.string(),
  claims_email: z.string().email('Adresse invalide').or(z.literal('')),
  agreement_number: z.string(),
  franchise: z.string(),
  notes: z.string(),
});

type Formulaire = z.infer<typeof schema>;

export function InsurersPage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const peutEcrire = profile?.role === 'admin' || profile?.role === 'manager';
  const peutSupprimer = profile?.role === 'admin';

  const [dialogueOuvert, setDialogueOuvert] = useState(false);
  const [enEdition, setEnEdition] = useState<Insurer | null>(null);
  const [aSupprimer, setASupprimer] = useState<Insurer | null>(null);
  const [voirInactifs, setVoirInactifs] = useState(false);

  const { data: assureurs, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['assureurs', voirInactifs],
    queryFn: () => fetchInsurers({ inclureInactifs: voirInactifs }),
  });

  // Combien de dossiers referencent l'assureur qu'on s'apprete a supprimer :
  // le chiffre change la decision, il doit etre affiche avant.
  const { data: nbDossiers } = useQuery({
    queryKey: ['assureur-dossiers', aSupprimer?.id],
    queryFn: () => compterDossiersAssureur(aSupprimer?.id as string),
    enabled: !!aSupprimer,
  });

  const rafraichir = () => {
    queryClient.invalidateQueries({ queryKey: ['assureurs'] });
    queryClient.invalidateQueries({ queryKey: ['insurers-all'] });
  };

  const basculerActif = useMutation({
    mutationFn: ({ id, actif }: { id: string; actif: boolean }) =>
      modifierAssureur(id, { actif }),
    onSuccess: (_r, v) => {
      rafraichir();
      toast.success(v.actif ? 'Assureur réactivé' : 'Assureur masqué des listes');
    },
    onError: (e: Error) => toast.error(messageErreurBase(e.message)),
  });

  const suppression = useMutation({
    mutationFn: (id: string) => supprimerAssureur(id),
    onSuccess: () => {
      rafraichir();
      setASupprimer(null);
      toast.success('Assureur supprimé');
    },
    onError: (e: Error) => {
      setASupprimer(null);
      toast.error(messageErreurBase(e.message));
    },
  });

  return (
    <>
      <PageHeader
        title="Assureurs"
        description="Franchises, conventions et lignes sinistre"
        action={
          peutEcrire ? (
            <Button
              className="rounded-full"
              onClick={() => { setEnEdition(null); setDialogueOuvert(true); }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Nouvel assureur
            </Button>
          ) : undefined
        }
      />

      <div className="space-y-4 overflow-y-auto p-6">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            La franchise renseignée ici est proposée à la qualification d'un lead.
            Elle reste modifiable : un contrat peut y déroger.
          </p>
          <Button
            variant="outline" size="sm" className="shrink-0 rounded-full"
            onClick={() => setVoirInactifs((v) => !v)}
          >
            {voirInactifs ? <Eye className="mr-1.5 h-3.5 w-3.5" /> : <EyeOff className="mr-1.5 h-3.5 w-3.5" />}
            {voirInactifs ? 'Masquer les inactifs' : 'Voir les inactifs'}
          </Button>
        </div>

        <Card className="rounded-xl border border-border">
          <CardContent className="p-0">
            {isLoading && (
              <div className="space-y-2 p-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-lg" />
                ))}
              </div>
            )}

            {isError && (
              <div className="flex flex-col items-center justify-center p-12 text-center">
                <Shield className="mb-3 h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
                <p className="text-sm text-muted-foreground">
                  {messageErreurBase((error as Error)?.message ?? '')}
                </p>
                <Button variant="outline" className="mt-4 rounded-full" onClick={() => refetch()}>
                  Réessayer
                </Button>
              </div>
            )}

            {!isLoading && !isError && assureurs && assureurs.length === 0 && (
              <div className="flex flex-col items-center justify-center p-12 text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-muted/50">
                  <Shield className="h-7 w-7 text-muted-foreground" strokeWidth={1.5} />
                </div>
                <h3 className="text-sm font-semibold text-foreground">Aucun assureur</h3>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Ajoutez-les une fois : ils apparaîtront ensuite dans chaque dossier,
                  avec leur franchise habituelle.
                </p>
              </div>
            )}

            {!isLoading && !isError && assureurs && assureurs.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="px-4 text-xs">Assureur</TableHead>
                    <TableHead className="px-4 text-xs">Franchise</TableHead>
                    <TableHead className="px-4 text-xs">Convention</TableHead>
                    <TableHead className="px-4 text-xs">Ligne sinistre</TableHead>
                    {peutEcrire && <TableHead className="px-4 text-right text-xs">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assureurs.map((a) => (
                    <TableRow key={a.id} className={a.actif ? 'hover:bg-muted/40' : 'opacity-55'}>
                      <TableCell className="px-4">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">{a.name}</span>
                          {!a.actif && (
                            <Badge
                              variant="outline"
                              className="rounded-full text-[10px] font-normal text-muted-foreground"
                            >
                              Inactif
                            </Badge>
                          )}
                        </div>
                        {a.phone && (
                          <p className="mt-0.5 text-xs text-muted-foreground tabular">{a.phone}</p>
                        )}
                      </TableCell>

                      <TableCell className="px-4 text-sm tabular text-foreground">
                        {a.default_franchise != null
                          ? `${a.default_franchise.toLocaleString('fr-FR')} €`
                          : <span className="text-muted-foreground">—</span>}
                      </TableCell>

                      <TableCell className="px-4 text-sm text-muted-foreground tabular">
                        {a.agreement_number || '—'}
                      </TableCell>

                      <TableCell className="px-4 text-sm">
                        {a.claims_phone ? (
                          <a
                            href={`tel:${a.claims_phone}`}
                            className="flex items-center gap-1.5 text-primary tabular hover:underline"
                          >
                            <PhoneCall className="h-3 w-3" />
                            {a.claims_phone}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>

                      {peutEcrire && (
                        <TableCell className="px-4">
                          <div className="flex items-center justify-end gap-1">
                            <Switch
                              checked={a.actif}
                              disabled={basculerActif.isPending}
                              onCheckedChange={(v) => basculerActif.mutate({ id: a.id, actif: v })}
                              aria-label={`${a.name} actif`}
                            />
                            <Button
                              variant="ghost" size="sm" className="rounded-full"
                              onClick={() => { setEnEdition(a); setDialogueOuvert(true); }}
                              aria-label={`Modifier ${a.name}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            {peutSupprimer && (
                              <Button
                                variant="ghost" size="sm"
                                className="rounded-full text-muted-foreground hover:text-destructive"
                                onClick={() => setASupprimer(a)}
                                aria-label={`Supprimer ${a.name}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <DialogueAssureur
        ouvert={dialogueOuvert}
        onOuvertChange={setDialogueOuvert}
        assureur={enEdition}
        onEnregistre={rafraichir}
      />

      <ConfirmerSuppression
        ouvert={aSupprimer !== null}
        onOuvertChange={(o) => !o && setASupprimer(null)}
        nom={aSupprimer?.name ?? ''}
        consequence={
          nbDossiers && nbDossiers > 0
            ? `${nbDossiers} dossier${nbDossiers > 1 ? 's' : ''} référence${nbDossiers > 1 ? 'nt' : ''} cet assureur et perdra${nbDossiers > 1 ? 'ont' : ''} l'information.`
            : "Cet assureur n'est référencé par aucun dossier."
        }
        alternative={
          <>
            Le désactiver le retire des listes sans toucher aux dossiers existants —
            c'est presque toujours ce qu'il faut faire.
          </>
        }
        enCours={suppression.isPending}
        onConfirmer={() => aSupprimer && suppression.mutate(aSupprimer.id)}
      />
    </>
  );
}

function DialogueAssureur({
  ouvert, onOuvertChange, assureur, onEnregistre,
}: {
  ouvert: boolean;
  onOuvertChange: (v: boolean) => void;
  assureur: Insurer | null;
  onEnregistre: () => void;
}) {
  const [adresse, setAdresse] = useState('');

  const { register, handleSubmit, reset, formState: { errors } } = useForm<Formulaire>({
    resolver: zodResolver(schema),
  });

  // Le dialogue sert a creer et a modifier : les valeurs se recalent a chaque
  // ouverture, sinon on editerait l'assureur precedent.
  const preparer = (v: boolean) => {
    if (v) {
      reset({
        name: assureur?.name ?? '',
        phone: assureur?.phone ?? '',
        email: assureur?.email ?? '',
        claims_phone: assureur?.claims_phone ?? '',
        claims_email: assureur?.claims_email ?? '',
        agreement_number: assureur?.agreement_number ?? '',
        franchise: assureur?.default_franchise != null ? String(assureur.default_franchise) : '',
        notes: assureur?.notes ?? '',
      });
      setAdresse(assureur?.address ?? '');
    }
    onOuvertChange(v);
  };

  const mutation = useMutation({
    mutationFn: (v: Formulaire) => {
      const saisie: SaisieAssureur = {
        ...ASSUREUR_VIDE,
        name: v.name.trim(),
        phone: v.phone.trim() || null,
        email: v.email.trim() || null,
        address: adresse.trim() || null,
        claims_phone: v.claims_phone.trim() || null,
        claims_email: v.claims_email.trim() || null,
        agreement_number: v.agreement_number.trim() || null,
        // Une franchise vide n'est pas zero : zero signifie « prise en charge
        // totale », l'absence signifie « on ne sait pas ».
        default_franchise: v.franchise.trim() === '' ? null : Number(v.franchise),
        notes: v.notes.trim() || null,
        actif: assureur?.actif ?? true,
      };

      return assureur
        ? modifierAssureur(assureur.id, saisie)
        : creerAssureur(saisie).then(() => undefined);
    },
    onSuccess: () => {
      onEnregistre();
      toast.success(assureur ? 'Assureur modifié' : 'Assureur ajouté');
      onOuvertChange(false);
    },
    onError: (e: Error) => toast.error(messageErreurBase(e.message)),
  });

  return (
    <Dialog open={ouvert} onOpenChange={preparer}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{assureur ? 'Modifier l’assureur' : 'Nouvel assureur'}</DialogTitle>
          <DialogDescription>
            Ces informations reviennent à chaque dossier : les saisir une fois évite
            de les rechercher à chaque appel.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4" noValidate>
          <Champ label="Nom" erreur={errors.name?.message}>
            <Input className="rounded-lg" placeholder="AXA, MAIF, Groupama…" {...register('name')} />
          </Champ>

          <div className="grid grid-cols-2 gap-3">
            <Champ label="Franchise habituelle (€)">
              <Input
                type="number" min={0} step="0.01" inputMode="decimal"
                className="rounded-lg tabular" placeholder="Non connue"
                {...register('franchise')}
              />
            </Champ>
            <Champ label="Numéro de convention">
              <Input className="rounded-lg tabular" {...register('agreement_number')} />
            </Champ>
          </div>

          <div className="rounded-xl border border-border p-3">
            <p className="mb-2 text-xs font-medium text-foreground">Déclaration de sinistre</p>
            <div className="grid grid-cols-2 gap-3">
              <Champ label="Téléphone">
                <Input className="rounded-lg tabular" {...register('claims_phone')} />
              </Champ>
              <Champ label="Email" erreur={errors.claims_email?.message}>
                <Input type="email" className="rounded-lg" {...register('claims_email')} />
              </Champ>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Champ label="Téléphone (standard)">
              <Input className="rounded-lg tabular" {...register('phone')} />
            </Champ>
            <Champ label="Email (standard)" erreur={errors.email?.message}>
              <Input type="email" className="rounded-lg" {...register('email')} />
            </Champ>
          </div>

          <ChampAdresse
            label="Adresse"
            valeur={adresse}
            onValeurChange={setAdresse}
            onChoisir={(a) => setAdresse(
              [a.address, a.postal_code, a.city].filter(Boolean).join(' '),
            )}
          />

          <Champ label="Notes">
            <Textarea
              rows={2} className="rounded-lg"
              placeholder="Particularités de prise en charge, interlocuteur…"
              {...register('notes')}
            />
          </Champ>

          <DialogFooter>
            <Button
              type="button" variant="ghost" className="rounded-full"
              onClick={() => onOuvertChange(false)}
            >
              Annuler
            </Button>
            <Button type="submit" className="rounded-full" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {assureur ? 'Enregistrer' : 'Ajouter'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Champ({
  label, erreur, children,
}: { label: string; erreur?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
      {erreur && <p className="text-xs text-destructive">{erreur}</p>}
    </div>
  );
}
