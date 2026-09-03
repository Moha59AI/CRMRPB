import { type ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <div className="gutter-x flex flex-col gap-3 border-b border-border py-3.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:py-5">
      <div className="min-w-0">
        <h1 className="truncate text-lg font-semibold text-foreground">{title}</h1>
        {/*
          La description explique l'écran à qui le découvre. Sur téléphone,
          elle coûte une ligne en haut d'un écran qui en a peu, à quelqu'un qui
          connaît déjà son outil — l'en-tête mangeait le tiers de la hauteur
          avant que la première donnée apparaisse.
        */}
        {description && (
          <p className="mt-1 hidden text-sm text-muted-foreground sm:block">{description}</p>
        )}
      </div>
      {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}
