import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Car,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '@/features/auth/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

const loginSchema = z.object({
  email: z.string().email('Adresse e-mail invalide'),
  password: z.string().min(6, 'Le mot de passe doit contenir au moins 6 caractères'),
});

type LoginForm = z.infer<typeof loginSchema>;

function messageConnexion(error: string) {
  if (error.toLowerCase().includes('invalid login credentials')) {
    return 'Adresse e-mail ou mot de passe incorrect.';
  }
  if (error.toLowerCase().includes('email not confirmed')) {
    return "Votre adresse e-mail n'est pas encore confirmée.";
  }
  return 'Connexion impossible. Vérifiez vos informations et réessayez.';
}

export function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    setSubmitting(true);
    setAuthError(null);

    try {
      const { error } = await signIn(data.email, data.password);
      if (error) {
        const message = messageConnexion(error);
        setAuthError(message);
        toast.error(message);
        return;
      }

      toast.success('Connexion réussie');
      navigate('/today');
    } catch {
      const message = 'Connexion momentanément indisponible. Réessayez dans un instant.';
      setAuthError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8faf8] lg:grid lg:grid-cols-[minmax(0,1.08fr)_minmax(460px,0.92fr)]">
      <section className="relative hidden min-h-screen overflow-hidden bg-[#eef7ef] lg:block">
        <img
          src="/login-collage.jpg"
          alt="Des clients et un technicien Relais Pare-Brise"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-x-8 bottom-8 rounded-[26px] border border-white/70 bg-white/[0.88] p-5 shadow-[0_24px_70px_-30px_rgba(16,24,20,0.45)] backdrop-blur-md xl:inset-x-12 xl:bottom-10 xl:p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-white shadow-lg shadow-emerald-950/10">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-base font-semibold text-slate-950">Chaque dossier, au même endroit</p>
              <p className="mt-1 max-w-xl text-sm leading-6 text-slate-600">
                Leads, documents, rendez-vous et suivi client restent réunis pour faire avancer
                chaque intervention sans perdre d’information.
              </p>
            </div>
          </div>
        </div>
      </section>

      <main className="flex min-h-screen items-center justify-center px-5 py-8 sm:px-10 lg:min-h-0 lg:px-12 xl:px-20">
        <div className="animate-fade-in w-full max-w-md">
          <div className="mb-7 overflow-hidden rounded-[26px] bg-[#eef7ef] shadow-[var(--shadow-2)] lg:hidden">
            <img
              src="/login-collage.jpg"
              alt="Des clients Relais Pare-Brise"
              className="h-40 w-full object-cover object-center sm:h-48"
            />
          </div>

          <div className="mb-9">
            <div className="mb-8 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary shadow-lg shadow-emerald-950/10">
                <Car className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-base font-bold tracking-[-0.025em] text-slate-950">Relais Pare-Brise</p>
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">CRM équipe</p>
              </div>
            </div>

            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              Votre espace de travail
            </p>
            <h1 className="text-balance text-3xl font-bold text-slate-950 sm:text-[2.15rem]">
              Heureux de vous revoir.
            </h1>
            <p className="mt-3 max-w-sm text-sm leading-6 text-slate-600">
              Connectez-vous pour retrouver vos leads, vos dossiers et les priorités du jour.
            </p>
          </div>

          {authError && (
            <div
              role="alert"
              className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
            >
              {authError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-semibold text-slate-800">
                Adresse e-mail
              </Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="vous@relaisparebrise.fr"
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={errors.email ? 'email-error' : undefined}
                  {...register('email')}
                  className="h-12 rounded-xl border-slate-200 bg-white pl-11 text-slate-950 shadow-sm placeholder:text-slate-400 focus-visible:border-primary focus-visible:ring-primary/20 md:h-12"
                />
              </div>
              {errors.email && (
                <p id="email-error" className="text-xs font-medium text-destructive">
                  {errors.email.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="password" className="text-sm font-semibold text-slate-800">
                  Mot de passe
                </Label>
                <Link
                  to="/forgot-password"
                  className="text-xs font-medium text-primary transition-colors hover:text-primary/80"
                >
                  Mot de passe oublié ?
                </Link>
              </div>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="password"
                  type={passwordVisible ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Votre mot de passe"
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={errors.password ? 'password-error' : undefined}
                  {...register('password')}
                  className="h-12 rounded-xl border-slate-200 bg-white px-11 text-slate-950 shadow-sm placeholder:text-slate-400 focus-visible:border-primary focus-visible:ring-primary/20 md:h-12"
                />
                <button
                  type="button"
                  onClick={() => setPasswordVisible((visible) => !visible)}
                  className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                  aria-label={passwordVisible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  aria-pressed={passwordVisible}
                >
                  {passwordVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && (
                <p id="password-error" className="text-xs font-medium text-destructive">
                  {errors.password.message}
                </p>
              )}
            </div>

            <Button
              type="submit"
              disabled={submitting}
              className="h-12 w-full rounded-xl text-sm font-semibold shadow-lg shadow-emerald-950/10 md:h-12"
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {submitting ? 'Connexion en cours…' : 'Se connecter'}
            </Button>
          </form>

          <div className="mt-7 flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-3">
            <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
            <p className="text-xs leading-5 text-slate-500">
              Accès sécurisé réservé à l’équipe. Les comptes sont créés uniquement sur invitation.
            </p>
          </div>

          <p className="mt-6 text-center text-[11px] text-slate-400">
            Relais Pare-Brise · Votre activité, clairement pilotée
          </p>
        </div>
      </main>
    </div>
  );
}
