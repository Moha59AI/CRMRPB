import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Car, ArrowLeft, MailCheck } from 'lucide-react';
import { useAuth } from '@/features/auth/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

const forgotSchema = z.object({
  email: z.string().email('Adresse e-mail invalide'),
});

type ForgotForm = z.infer<typeof forgotSchema>;

export function ForgotPasswordPage() {
  const { resetPassword } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotForm>({
    resolver: zodResolver(forgotSchema),
  });

  const onSubmit = async (data: ForgotForm) => {
    setSubmitting(true);
    const { error } = await resetPassword(data.email);
    setSubmitting(false);

    if (error) {
      toast.error(error);
    } else {
      setSent(true);
      toast.success('E-mail de réinitialisation envoyé');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <Car className="h-6 w-6 text-primary-foreground" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-semibold text-foreground">Mot de passe oublié</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Recevez un lien de réinitialisation par e-mail
            </p>
          </div>
        </div>

        {sent ? (
          <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-muted/50 p-8 text-center">
            <MailCheck className="h-10 w-10 text-primary" />
            <div>
              <p className="font-medium text-foreground">Vérifiez votre boîte de réception</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Un e-mail avec un lien de réinitialisation a été envoyé.
              </p>
            </div>
            <Link to="/login">
              <Button variant="outline" className="rounded-full">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Retour à la connexion
              </Button>
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Adresse e-mail</Label>
              <Input
                id="email"
                type="email"
                placeholder="vous@exemple.fr"
                {...register('email')}
                className="rounded-xl"
              />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>

            <Button type="submit" disabled={submitting} className="w-full rounded-full">
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Envoyer le lien
            </Button>
          </form>
        )}

        {!sent && (
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
