import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface ModuleErrorStateProps {
  title?: string;
  description?: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export function ModuleErrorState({
  title = 'Chargement impossible',
  description = 'Une erreur est survenue. Réessayez dans un instant.',
  onRetry,
  retryLabel = 'Réessayer',
  className,
}: ModuleErrorStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-16 text-center', className)}>
      <span
        className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-urgent-soft text-urgent"
        aria-hidden
      >
        <AlertTriangle className="h-7 w-7" strokeWidth={1.8} />
      </span>
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {onRetry && (
        <Button variant="outline" className="mt-4 rounded-full" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
