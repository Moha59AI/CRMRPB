import type { ReactNode } from 'react';
import { useEstMobile } from '@/hooks/use-media-query';
import { cn } from '@/lib/utils';

interface ResponsiveDataViewProps {
  desktop: ReactNode;
  mobile: ReactNode;
  forceMobile?: boolean;
  className?: string;
}

/**
 * Monte uniquement la vue utile. Les longues listes ne sont donc jamais
 * dupliquées dans le navigateur entre le tableau ordinateur et les cartes mobile.
 */
export function ResponsiveDataView({
  desktop,
  mobile,
  forceMobile,
  className,
}: ResponsiveDataViewProps) {
  const estMobile = useEstMobile();
  const afficherMobile = forceMobile ?? estMobile;

  return (
    <div className={cn('min-w-0', className)}>
      {afficherMobile ? mobile : desktop}
    </div>
  );
}
