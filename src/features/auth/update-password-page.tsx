import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Car, ArrowLeft, ShieldCheck, ShieldAlert } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

const updateSchema = z
  .object({
    password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères'),
    confirmation: z.string(),
  })
  .refine((valeurs) => valeurs.password === valeurs.confirmation, {
    message: 'Les deux mots de passe ne correspondent pas',
    path: ['confirmation'],
  });

type UpdateForm = z.infer<typeof updateSchema>;

/** Le lien du courriel doit avoir ouvert une session de récupération. */
type EtatSession = 'verification' | 'pret' | 'invalide';

export function UpdatePasswordPage() {
  const navigate = useNavigate();
  const [etat, setEtat] = useState<EtatSession>('verification');
  const [submitting, setSubmitting] = useState(false);
  const [termine, setTermine] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UpdateForm>({
    resolver: zodResolver(updateSchema),
  });

  useEffect(() => {
    let actif = true;

    // Le client Supabase est configuré avec detectSessionInUrl : il consomme le
    // fragment du lien et émet PASSWORD_RECOVERY. On écoute cet évènement
    // *avant* d'interroger la session, sinon on peut arriver trop tôt et
    // conclure à tort que le lien est invalide.
    const { data: abonnement } = supabase.auth.onAuthStateChange((event, session) => {
      if (!actif) return;
      if (event === 'PASSWORD_RECOVERY' || session) setEtat('pret');
    });

    // Un lien expiré ou déjà utilisé revient avec une erreur dans le fragment.
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    if (fragment.get('error')) {
      setEtat('invalide');
      return () => {
        actif = false;
        abonnement.subscription.unsubscribe();
      };
    }

    supabase.auth.getSession().then(({ data }) => {
      if (!actif) return;
      setEtat((precedent) => (precedent === 'pret' ? precedent : data.session ? 'pret' : 'invalide'));
    });

    return () => {
      actif = false;
      abonnement.subscription.unsubscribe();
    };
  }, []);

  const onSubmit = async (valeurs: UpdateForm) => {
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password: valeurs.password });
    setSubmitting(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    setTermine(true);
    toast.success('Mot de passe modifié');

    // La session ouverte par le lien ne sert qu'à ce changement : on la ferme
    // pour que l'utilisateur se reconnecte avec son nouveau mot de passe.
    await supabase.auth.signOut();
    window.setTimeout(() => navigate('/login', { replace: true }), 1800);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <Car className="h-6 w-6 text-primary-foreground" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-semibold text-foreground">Nouveau mot de passe</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Choisissez le mot de passe de votre compte
            </p>
          </div>
        </div>

        {etat === 'verification' && (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-muted/50 p-8 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Vérification du lien…</p>
          </div>
        )}

        {etat === 'invalide' && (
          <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-muted/50 p-8 text-center">
            <ShieldAlert className="h-10 w-10 text-destructive" />
            <div>
              <p className="font-medium text-foreground">Lien invalide ou expiré</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Les liens de réinitialisation ont une durée de validité limitée et ne
                servent qu’une fois. Demandez-en un nouveau.
              </p>
            </div>
            <Link to="/forgot-password">
              <Button variant="outline" className="rounded-full">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Demander un nouveau lien
              </Button>
            </Link>
          </div>
        )}

        {etat === 'pret' && termine && (
          <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-muted/50 p-8 text-center">
            <ShieldCheck className="h-10 w-10 text-primary" />
            <div>
              <p className="font-medium text-foreground">Mot de passe modifié</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.
              </p>
            </div>
            <Link to="/login">
              <Button variant="outline" className="rounded-full">
                Aller à la connexion
              </Button>
            </Link>
          </div>
        )}

        {etat === 'pret' && !termine && (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Nouveau mot de passe</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                {...register('password')}
                className="rounded-xl"
              />
              {errors.password && (
                <p className="text-xs text-destructive">{errors.password.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmation">Confirmer le mot de passe</Label>
              <Input
                id="confirmation"
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                {...register('confirmation')}
                className="rounded-xl"
              />
              {errors.confirmation && (
                <p className="text-xs text-destructive">{errors.confirmation.message}</p>
              )}
            </div>

            <Button type="submit" disabled={submitting} className="w-full rounded-full">
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enregistrer le mot de passe
            </Button>
          </form>
        )}

        {etat !== 'invalide' && !termine && (
          <div className="mt-6 text-center">
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Retour à la connexion
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
