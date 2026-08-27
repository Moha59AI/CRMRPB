import { type LucideIcon, Construction } from 'lucide-react';

interface ModulePlaceholderProps {
  title: string;
  description: string;
  icon?: LucideIcon;
  developmentStatus?: 'not_started' | 'in_progress' | 'planned';
  futureComponents?: string[];
}

const statusConfig = {
  not_started: { label: 'Non développé', className: 'bg-muted text-muted-foreground' },
  in_progress: { label: 'En développement', className: 'bg-warning/10 text-warning' },
  planned: { label: 'Planifié', className: 'bg-accent text-accent-foreground' },
};

export function ModulePlaceholder({
  title,
  description,
  icon: Icon = Construction,
  developmentStatus = 'not_started',
  futureComponents = [],
}: ModulePlaceholderProps) {
  const status = statusConfig[developmentStatus];

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="max-w-lg text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-muted/50">
          <Icon className="h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
        </div>

        <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>

        <div className="mt-4">
          <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${status.className}`}>
            {status.label}
          </span>
        </div>

        {futureComponents.length > 0 && (
          <div className="mt-8 rounded-xl border border-border bg-card p-6 text-left">
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Composants prévus
            </p>
            <ul className="space-y-2">
              {futureComponents.map((comp, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-border" />
                  {comp}
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="mt-6 text-xs text-muted-foreground">
          Ce module sera développé par Claude Code dans une prochaine étape.
        </p>
      </div>
    </div>
  );
}
