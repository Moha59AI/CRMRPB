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
  /**
   * Variante courte quand la zone de travail est étroite malgré une barre
   * latérale encore visible (fenêtre CRM, petite tablette ou demi-écran).
   */
  compactWorkArea?: boolean;
}

/**
 * En-tete compact commun a tous les modules.
 *
 * La reference Bolt privilegie la zone de travail : le titre n'est plus une
 * grande banniere sombre, mais un repere editorial court. Les actions restent
 * visibles a droite et le contenu utile remonte nettement dans l'ecran.
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
  compactWorkArea = false,
}: ModuleHeroProps) {
  return (
    <section
      data-module-hero
      className={cn(
        'crm-module-hero relative border-b border-border/80 bg-transparent',
        compactMobile && 'crm-module-hero--compact-mobile',
        className,
      )}
    >
      <div className={cn(
        'grid gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:gap-6 sm:py-4',
        compactMobile && 'max-md:grid-cols-[minmax(0,1fr)_auto] max-md:items-center max-md:gap-2 max-md:py-2',
        compactWorkArea && 'max-[1399px]:grid-cols-[minmax(0,1fr)_auto] max-[1399px]:items-center max-[1399px]:gap-3 max-[1399px]:py-2.5',
      )}>
        <div className={cn(
          'flex min-w-0 items-center gap-3',
          compactMobile && 'max-md:gap-2',
        )}>
          <span className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#cfe3d2] bg-[#e8f4e5] text-[#376848] shadow-sm sm:h-10 sm:w-10',
            compactMobile && 'max-md:h-8 max-md:w-8',
          )}>
            <Icon className="h-4.5 w-4.5" strokeWidth={2} aria-hidden />
          </span>

          <div className="min-w-0">
            <div className={cn(
              'flex items-center gap-2',
              compactMobile && 'max-md:hidden',
              compactWorkArea && 'max-[1399px]:hidden',
            )}>
              <p className="truncate text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                {eyebrow}
              </p>
              <span className="hidden items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-[#5d8e68] min-[440px]:flex">
                <Activity className="h-2.5 w-2.5" /> En direct
              </span>
            </div>
            <div className="mt-0.5 flex min-w-0 items-baseline gap-2.5">
              <h1 className={cn(
                'truncate font-display text-2xl font-bold tracking-[-0.055em] text-foreground sm:text-[1.75rem]',
                compactMobile && 'max-md:text-lg',
                compactWorkArea && 'max-[1399px]:text-xl',
              )}>
                {title}
              </h1>
            </div>
            {description && (
              <div className={cn(
                'mt-0.5 max-w-3xl truncate text-[11px] leading-relaxed text-muted-foreground sm:text-xs',
                compactMobile && 'max-md:hidden',
                compactWorkArea && 'max-[1399px]:hidden',
              )}>
                {description}
              </div>
            )}
          </div>
        </div>

        {action && (
          <div className={cn(
            'crm-module-actions flex min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end',
            compactMobile && 'max-md:flex-nowrap',
            compactWorkArea && 'max-[1399px]:flex-nowrap',
          )}>
            {action}
          </div>
        )}
      </div>

      {footer && (
        <div className="overflow-x-auto border-t border-border/70 py-2.5 scrollbar-thin">
          {footer}
        </div>
      )}
    </section>
  );
}
