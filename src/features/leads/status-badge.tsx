// Pastille de statut d'un lead.
//
// Isolee des constantes : un fichier qui exporte a la fois des composants et
// des valeurs desactive le Fast Refresh de Vite.

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { statusLabels } from './lead-shared';
import { leadStatusColorStyle } from './lead-color-settings';

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'lead-status-badge whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none',
        className,
      )}
      style={leadStatusColorStyle(status)}
    >
      {statusLabels[status] ?? status}
    </Badge>
  );
}
