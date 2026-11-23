import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, Eye, EyeOff, Loader2, UserPlus, WandSparkles } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { creerAccesAvecMotDePasse, creerInvitation } from '@/services/invitations-service';
import { roleLabels, roleDescriptions } from '@/config/roles';
import type { UserRole } from '@/types';

const ROLES: UserRole[] = ['admin', 'manager', 'advisor', 'technician', 'accountant'];

const schema = z.object({
  email: z.string().min(1, 'Adresse requise').email('Adresse invalide'),
  role: z.enum(['admin', 'manager', 'advisor', 'technician', 'accountant']),
  mode: z.enum(['password', 'invitation']),
  password: z.string(),
  confirmation: z.string(),
}).superRefine((valeurs, contexte) => {
  if (valeurs.mode !== 'password') return;
  if (valeurs.password.length < 12
    || valeurs.password.length > 72
    || !/[a-z]/.test(valeurs.password)
    || !/[A-Z]/.test(valeurs.password)
    || !/\d/.test(valeurs.password)
    || !/[^A-Za-z0-9]/.test(valeurs.password)) {
    contexte.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['password'],
      message: '12 caractères minimum avec majuscule, minuscule, chiffre et symbole',
    });
  }
  if (valeurs.confirmation !== valeurs.password) {
    contexte.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['confirmation'],
      message: 'Les deux mots de passe ne correspondent pas',
    });
  }
});

type Formulaire = z.infer<typeof schema>;

interface DialogueInvitationProps {
  ouvert: boolean;
  onOuvertChange: (ouvert: boolean) => void;
}

function genererMotDePasseInitial(): string {
  const groupes = [
    'ABCDEFGHJKLMNPQRSTUVWXYZ',
    'abcdefghijkmnopqrstuvwxyz',
    '23456789',
    '!@#$%&*+-_=',
  ];
  const tous = groupes.join('');
  const aleatoire = globalThis.crypto.getRandomValues(new Uint32Array(40));
  let index = 0;
  const caracteres = groupes.map((groupe) => groupe[aleatoire[index++] % groupe.length]);
  while (caracteres.length < 16) {
    caracteres.push(tous[aleatoire[index++] % tous.length]);
  }
  for (let i = caracteres.length - 1; i > 0; i -= 1) {
    const cible = aleatoire[index++] % (i + 1);
    [caracteres[i], caracteres[cible]] = [caracteres[cible], caracteres[i]];
  }
  return caracteres.join('');
}

export function DialogueInvitation({ ouvert, onOuvertChange }: DialogueInvitationProps) {
  const queryClient = useQueryClient();
  const [passwordVisible, setPasswordVisible] = useState(false);

  const {
    register, handleSubmit, setValue, watch, reset, clearErrors,
    formState: { errors },
  } = useForm<Formulaire>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: '',
      role: 'advisor',
      mode: 'password',
      password: '',
      confirmation: '',
    },
  });

  const role = watch('role');
  const mode = watch('mode');
  const motDePasse = watch('password');

  const mutation = useMutation({
    mutationFn: (v: Formulaire) => v.mode === 'password'
      ? creerAccesAvecMotDePasse(v.email, v.role, v.password)
      : creerInvitation(v.email, v.role),
    onSuccess: (acces, v) => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      queryClient.invalidateQueries({ queryKey: ['invitations'] });
      queryClient.invalidateQueries({ queryKey: ['etat-systeme'] });
      if (acces.mode === 'password') {
        toast.success(`Compte créé pour ${v.email}`, {
          description: 'Le mot de passe est actif. Transmettez-le à la personne par un canal sécurisé.',
        });
      } else {
        toast.success(`Invitation envoyée à ${v.email}`, {
          description: 'IONOS a accepté le message. Le lien permet de choisir le mot de passe du CRM.',
        });
      }
      reset();
      setPasswordVisible(false);
      onOuvertChange(false);
    },
    onError: (e: Error) => toast.error("La création de l'accès a échoué", { description: e.message }),
  });

  const changerMode = (prochainMode: Formulaire['mode']) => {
    setValue('mode', prochainMode, { shouldValidate: true });
    if (prochainMode === 'invitation') clearErrors(['password', 'confirmation']);
  };

  const genererMotDePasse = () => {
    const valeur = genererMotDePasseInitial();
    setValue('password', valeur, { shouldDirty: true, shouldValidate: true });
    setValue('confirmation', valeur, { shouldDirty: true, shouldValidate: true });
    setPasswordVisible(true);
  };

  const copierMotDePasse = async () => {
    if (!motDePasse) return;
    try {
      await navigator.clipboard.writeText(motDePasse);
      toast.success('Mot de passe copié');
    } catch {
      toast.error("Le mot de passe n'a pas pu être copié");
    }
  };

  const changerOuverture = (prochainEtat: boolean) => {
    if (!prochainEtat) {
      reset();
      setPasswordVisible(false);
    }
    onOuvertChange(prochainEtat);
  };

  return (
    <Dialog open={ouvert} onOpenChange={changerOuverture}>
      <DialogContent className="sm:rounded-2xl sm:max-w-md">
        <DialogHeader>
          <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <UserPlus className="h-5 w-5 text-primary" />
          </div>
          <DialogTitle>Créer un utilisateur</DialogTitle>
          <DialogDescription>
            Créez directement son mot de passe initial, ou laissez la personne le choisir depuis
            un lien sécurisé reçu par email.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit((v) => mutation.mutate(v))}
          className="space-y-4"
          noValidate
        >
          <div className="space-y-1.5">
            <Label htmlFor="email-invitation" className="text-xs text-muted-foreground">
              Adresse email
            </Label>
            <Input
              id="email-invitation"
              type="email"
              autoComplete="off"
              placeholder="prenom@exemple.fr"
              className="rounded-lg"
              aria-invalid={!!errors.email}
              {...register('email')}
            />
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Rôle</Label>
            <Select
              value={role}
              onValueChange={(v) => setValue('role', v as UserRole, { shouldValidate: true })}
            >
              <SelectTrigger className="rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {roleLabels[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{roleDescriptions[role]}</p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Activation du compte</Label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button
                type="button"
                variant={mode === 'password' ? 'default' : 'outline'}
                className="h-auto min-h-11 justify-start rounded-xl px-3 py-2 text-left"
                aria-pressed={mode === 'password'}
                onClick={() => changerMode('password')}
              >
                Je crée le mot de passe
              </Button>
              <Button
                type="button"
                variant={mode === 'invitation' ? 'default' : 'outline'}
                className="h-auto min-h-11 justify-start rounded-xl px-3 py-2 text-left"
                aria-pressed={mode === 'invitation'}
                onClick={() => changerMode('invitation')}
              >
                Envoyer un lien par email
              </Button>
            </div>
          </div>

          {mode === 'password' ? (
            <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/[0.04] p-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="mot-de-passe-initial" className="text-xs text-muted-foreground">
                    Mot de passe initial
                  </Label>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 rounded-lg px-2 text-xs"
                      onClick={genererMotDePasse}
                    >
                      <WandSparkles className="mr-1.5 h-3.5 w-3.5" />
                      Générer
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-lg"
                      disabled={!motDePasse}
                      onClick={copierMotDePasse}
                      aria-label="Copier le mot de passe"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="relative">
                  <Input
                    id="mot-de-passe-initial"
                    type={passwordVisible ? 'text' : 'password'}
                    autoComplete="new-password"
                    className="rounded-lg pr-11 font-mono"
                    aria-invalid={!!errors.password}
                    {...register('password')}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2"
                    onClick={() => setPasswordVisible((visible) => !visible)}
                    aria-label={passwordVisible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  >
                    {passwordVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                {errors.password ? (
                  <p className="text-xs text-destructive">{errors.password.message}</p>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    12 caractères minimum, avec majuscule, minuscule, chiffre et symbole.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirmation-mot-de-passe" className="text-xs text-muted-foreground">
                  Confirmer le mot de passe
                </Label>
                <Input
                  id="confirmation-mot-de-passe"
                  type={passwordVisible ? 'text' : 'password'}
                  autoComplete="new-password"
                  className="rounded-lg font-mono"
                  aria-invalid={!!errors.confirmation}
                  {...register('confirmation')}
                />
                {errors.confirmation && (
                  <p className="text-xs text-destructive">{errors.confirmation.message}</p>
                )}
              </div>

              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Le mot de passe n'est ni enregistré dans le CRM, ni envoyé par email. Supabase Auth
                en conserve uniquement une empreinte sécurisée.
              </p>
            </div>
          ) : (
            <p className="rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
              Un lien personnel permettra à l'utilisateur de choisir son mot de passe.
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => changerOuverture(false)}
            >
              Annuler
            </Button>
            <Button type="submit" className="rounded-full" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === 'password' ? 'Créer le compte' : "Envoyer l'invitation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
