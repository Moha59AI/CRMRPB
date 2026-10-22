import type { ReactNode } from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

interface ModuleToolbarProps {
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  filters?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function ModuleToolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Rechercher…',
  filters,
  actions,
  className,
}: ModuleToolbarProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-sm lg:flex-row lg:items-center',
        className,
      )}
    >
      {onSearchChange && (
        <div className="relative min-w-0 flex-1 lg:max-w-md">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={searchValue ?? ''}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            className="h-10 rounded-lg pl-9"
            aria-label={searchPlaceholder}
          />
        </div>
      )}
      {filters && (
        <div className="flex max-w-full items-center gap-2 overflow-x-auto pb-0.5 scrollbar-thin [&>*]:shrink-0 lg:flex-wrap lg:overflow-visible lg:pb-0">
          {filters}
        </div>
      )}
      {actions && (
        <div className="grid w-full grid-cols-2 gap-2 [&>*]:min-w-0 sm:flex sm:w-auto sm:flex-wrap sm:items-center lg:ml-auto">
          {actions}
        </div>
      )}
    </div>
  );
}
