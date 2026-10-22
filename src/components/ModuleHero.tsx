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
  /** Variante courte pour les ecrans de travail tres denses sur telephone. */
  compactMobile?: boolean;
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
  compactMobile = false,
}: ModuleHeroProps) {
  return (
    <section
      data-module-hero
      className={cn(
        'crm-module-hero relative isolate overflow-hidden rounded-[1.5rem] border border-white/10 bg-secondary text-secondary-foreground shadow-[0_24px_60px_-32px_rgba(2,8,23,0.85)]',
        compactMobile && 'crm-module-hero--compact-mobile',
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

      <div className={cn(
        'relative grid gap-3.5 px-4 py-4 sm:gap-5 sm:px-7 sm:py-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-8',
        compactMobile && 'max-md:grid-cols-[minmax(0,1fr)_auto] max-md:items-center max-md:gap-2 max-md:px-3 max-md:py-2.5',
      )}>
        <div className={cn('flex min-w-0 items-start gap-3 sm:gap-5', compactMobile && 'max-md:items-center max-md:gap-2')}>
          <span className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-primary text-primary-foreground shadow-[0_14px_30px_-14px_rgba(22,163,74,0.95)] sm:h-14 sm:w-14 sm:rounded-2xl',
            compactMobile && 'max-md:h-9 max-md:w-9',
          )}>
            <Icon className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={2} aria-hidden />
          </span>

          <div className="min-w-0">
            <div className={cn('flex flex-wrap items-center gap-2', compactMobile && 'max-md:hidden')}>
              <p className="max-w-full truncate rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-secondary-foreground/60 sm:text-[10px] sm:tracking-[0.18em]">
                {eyebrow}
              </p>
              <span className="hidden items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-primary min-[380px]:flex sm:text-[10px]">
                <Activity className="h-3 w-3" /> Espace en direct
              </span>
            </div>
            <h1 className={cn(
              'mt-2 break-words text-xl font-semibold tracking-tight text-secondary-foreground min-[380px]:text-2xl sm:text-3xl',
              compactMobile && 'max-md:mt-0 max-md:truncate max-md:text-lg',
            )}>
              {title}
            </h1>
            {description && (
              <div className={cn(
                'mt-1.5 max-w-3xl text-xs leading-relaxed text-secondary-foreground/62 sm:text-sm',
                compactMobile && 'max-md:hidden',
              )}>
                {description}
              </div>
            )}
          </div>
        </div>

        {action && (
          <div className={cn(
            'crm-module-actions flex w-full min-w-0 flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-black/15 p-2 shadow-inner backdrop-blur-sm sm:rounded-2xl sm:p-2.5 lg:w-auto lg:max-w-[48rem] lg:justify-end',
            compactMobile && 'max-md:w-auto max-md:flex-nowrap max-md:border-0 max-md:bg-transparent max-md:p-0 max-md:shadow-none',
          )}>
            {action}
          </div>
        )}
      </div>

      {footer && (
        <div className="relative overflow-x-auto border-t border-white/10 bg-black/10 px-4 py-3 scrollbar-thin sm:px-7">
          {footer}
        </div>
      )}
    </section>
  );
}
