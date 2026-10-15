import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModuleEmptyStateProps {
  icon?: LucideIcon;
  iconNode?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function ModuleEmptyState({
  icon: Icon = Inbox,
  iconNode,
  title,
  description,
  action,
  className,
}: ModuleEmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center px-6 py-16 text-center animate-fade-in',
        className,
      )}
    >
      <span
        className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-muted/50 text-muted-foreground"
        aria-hidden
      >
        {iconNode ?? <Icon className="h-7 w-7" strokeWidth={1.6} />}
      </span>
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
