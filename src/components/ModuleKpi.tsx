import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type KpiTone = 'primary' | 'warning' | 'urgent' | 'due' | 'upcoming' | 'done' | 'neutral';

const toneStyles: Record<KpiTone, { icon: string; ring: string }> = {
  primary: { icon: 'bg-primary/10 text-primary', ring: 'ring-primary/20' },
  warning: { icon: 'bg-warning/10 text-warning', ring: 'ring-warning/20' },
  urgent: { icon: 'bg-urgent-soft text-urgent', ring: 'ring-urgent/20' },
  due: { icon: 'bg-due-soft text-due', ring: 'ring-due/20' },
  upcoming: { icon: 'bg-upcoming-soft text-upcoming', ring: 'ring-upcoming/20' },
  done: { icon: 'bg-done-soft text-done', ring: 'ring-done/20' },
  neutral: { icon: 'bg-muted text-muted-foreground', ring: 'ring-border' },
};

export interface ModuleKpiProps {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  hint?: ReactNode;
  tone?: KpiTone;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}

export function ModuleKpi({
  label,
  value,
  icon: Icon,
  hint,
  tone = 'neutral',
  active = false,
  onClick,
  className,
}: ModuleKpiProps) {
  const styles = toneStyles[tone];
  const classes = cn(
    'app-card-motion flex min-w-0 items-center gap-3 rounded-xl border bg-card p-4 text-left shadow-sm',
    active ? 'border-primary bg-primary/5 ring-1 ring-primary/15' : 'border-border',
    onClick && 'w-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    className,
  );
  const content = (
    <>
      {Icon && (
        <span
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1',
            styles.icon,
            styles.ring,
          )}
          aria-hidden
        >
          <Icon className="h-5 w-5" strokeWidth={1.9} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-muted-foreground">{label}</span>
        <span className="tabular mt-0.5 block text-xl font-semibold leading-tight text-foreground">
          {value}
        </span>
        {hint && <span className="mt-0.5 block truncate text-xs text-faint">{hint}</span>}
      </span>
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={classes} onClick={onClick} aria-pressed={active}>
        {content}
      </button>
    );
  }

  return <div className={classes}>{content}</div>;
}

export function ModuleKpiGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4', className)}>
      {children}
    </div>
  );
}
