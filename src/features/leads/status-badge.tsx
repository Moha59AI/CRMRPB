// Pastille de statut d'un lead.
//
// Isolee des constantes : un fichier qui exporte a la fois des composants et
// des valeurs desactive le Fast Refresh de Vite.

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { statusLabels, statusStyles } from './lead-shared';

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn('rounded-full text-[10px] font-medium', statusStyles[status] ?? 'bg-muted text-muted-foreground border-border', className)}
    >
      {statusLabels[status] ?? status}
    </Badge>
  );
}
