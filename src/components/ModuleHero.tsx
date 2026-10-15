import type { ReactNode } from 'react';
import { Sparkles, type LucideIcon } from 'lucide-react';
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
        'crm-module-hero relative isolate overflow-hidden rounded-2xl bg-secondary text-secondary-foreground shadow-lg',
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

      <div className="relative grid gap-4 px-4 py-4 sm:px-5 sm:py-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-6">
        <div className="flex min-w-0 items-start gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-primary text-primary-foreground shadow-md sm:h-12 sm:w-12">
            <Icon className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={1.9} aria-hidden />
          </span>

          <div className="min-w-0 pt-0.5">
            <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-secondary-foreground/55 sm:text-[10px]">
              {eyebrow}
            </p>
            <h1 className="mt-1 text-balance text-xl font-semibold tracking-tight text-secondary-foreground sm:text-2xl">
              {title}
            </h1>
            {description && (
              <div className="mt-1 max-w-3xl text-xs leading-relaxed text-secondary-foreground/65 sm:text-sm">
                {description}
              </div>
            )}
          </div>
        </div>

        {action && (
          <div className="crm-module-actions flex w-full min-w-0 flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.07] p-2.5 backdrop-blur-sm lg:w-auto lg:max-w-[48rem] lg:justify-end">
            {action}
          </div>
        )}
      </div>

      {footer && (
        <div className="relative border-t border-white/10 px-4 py-3 sm:px-5">
          {footer}
        </div>
      )}
    </section>
  );
}
