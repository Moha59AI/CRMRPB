import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, UserPlus } from 'lucide-react';
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
import { creerInvitation } from '@/services/invitations-service';
import { roleLabels, roleDescriptions } from '@/config/roles';
import type { UserRole } from '@/types';

const ROLES: UserRole[] = ['admin', 'manager', 'advisor', 'technician', 'accountant'];

const schema = z.object({
  email: z.string().min(1, 'Adresse requise').email('Adresse invalide'),
  role: z.enum(['admin', 'manager', 'advisor', 'technician', 'accountant']),
});

type Formulaire = z.infer<typeof schema>;

interface DialogueInvitationProps {
  ouvert: boolean;
  onOuvertChange: (ouvert: boolean) => void;
}

export function DialogueInvitation({ ouvert, onOuvertChange }: DialogueInvitationProps) {
  const queryClient = useQueryClient();

  const {
    register, handleSubmit, setValue, watch, reset,
    formState: { errors },
  } = useForm<Formulaire>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', role: 'advisor' },
  });

  const role = watch('role');

  const mutation = useMutation({
    mutationFn: (v: Formulaire) => creerInvitation(v.email, v.role),
    onSuccess: (_invitation, v) => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      queryClient.invalidateQueries({ queryKey: ['invitations'] });
      queryClient.invalidateQueries({ queryKey: ['etat-systeme'] });
      toast.success(`Invitation envoyée à ${v.email}`, {
        description: 'IONOS a accepté le message. Le lien permet de choisir le mot de passe du CRM.',
      });
      reset();
      onOuvertChange(false);
    },
    onError: (e: Error) => toast.error("L'invitation a échoué", { description: e.message }),
  });

  return (
    <Dialog open={ouvert} onOpenChange={onOuvertChange}>
      <DialogContent className="sm:rounded-2xl sm:max-w-md">
        <DialogHeader>
          <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <UserPlus className="h-5 w-5 text-primary" />
          </div>
          <DialogTitle>Inviter quelqu'un</DialogTitle>
          <DialogDescription>
            La personne recevra un email Relais Pare-Brise avec un lien sécurisé pour choisir
            son mot de passe et accéder au CRM.
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

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => onOuvertChange(false)}
            >
              Annuler
            </Button>
            <Button type="submit" className="rounded-full" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Envoyer l'invitation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
