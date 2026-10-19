import type { ReactNode } from 'react';
import { Activity, Sparkles, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModuleHeroProps {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  footer?: ReactNode;
  className?: string;
}

/**
 * En-tête cockpit commun à tous les modules.
 *
 * Il donne la même hiérarchie visuelle à chaque écran sans imposer de donnée
 * artificielle : le titre, le contexte et les vraies actions du module sont
 * les seuls éléments affichés. Les pages très métier peuvent ajouter un rail
 * d'indicateurs dans `footer`.
 */
export function ModuleHero({
  title,
  description,
  eyebrow = 'Pilotage opérationnel',
  icon: Icon = Sparkles,
  action,
  footer,
  className,
}: ModuleHeroProps) {
  return (
    <section
      data-module-hero
      className={cn(
        'crm-module-hero relative isolate overflow-hidden rounded-[1.5rem] border border-white/10 bg-secondary text-secondary-foreground shadow-[0_24px_60px_-32px_rgba(2,8,23,0.85)]',
        className,
      )}
    >
      <span
        className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-primary/25 blur-3xl"
        aria-hidden
      />
      <span
        className="pointer-events-none absolute -bottom-24 left-1/3 h-48 w-48 rounded-full bg-white/[0.06] blur-3xl"
        aria-hidden
      />
      <Icon
        className="pointer-events-none absolute -bottom-10 right-5 h-44 w-44 rotate-[-8deg] text-white/[0.035] sm:h-56 sm:w-56"
        strokeWidth={1.1}
        aria-hidden
      />

      <div className="relative grid gap-5 px-5 py-5 sm:px-7 sm:py-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-8">
        <div className="flex min-w-0 items-start gap-4 sm:gap-5">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-primary text-primary-foreground shadow-[0_14px_30px_-14px_rgba(22,163,74,0.95)] sm:h-14 sm:w-14">
            <Icon className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={2} aria-hidden />
          </span>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-secondary-foreground/60 sm:text-[10px]">
                {eyebrow}
              </p>
              <span className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-primary sm:text-[10px]">
                <Activity className="h-3 w-3" /> Espace en direct
              </span>
            </div>
            <h1 className="mt-2 text-balance text-2xl font-semibold tracking-tight text-secondary-foreground sm:text-3xl">
              {title}
            </h1>
            {description && (
              <div className="mt-1.5 max-w-3xl text-xs leading-relaxed text-secondary-foreground/62 sm:text-sm">
                {description}
              </div>
            )}
          </div>
        </div>

        {action && (
          <div className="crm-module-actions flex w-full min-w-0 flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-black/15 p-2.5 shadow-inner backdrop-blur-sm lg:w-auto lg:max-w-[48rem] lg:justify-end">
            {action}
          </div>
        )}
      </div>

      {footer && (
        <div className="relative border-t border-white/10 bg-black/10 px-5 py-3 sm:px-7">
          {footer}
        </div>
      )}
    </section>
  );
}
