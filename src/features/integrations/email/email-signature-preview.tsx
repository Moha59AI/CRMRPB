import { cn } from '@/lib/utils';

type EmailSignaturePreviewProps = {
  signature: string;
  senderName?: string;
  className?: string;
  compact?: boolean;
  showLabel?: boolean;
};

function signatureParts(signature: string, senderName: string) {
  const lines = signature
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const greeting = lines.find((line) => /^cordialement[,.]?$/i.test(line)) ?? 'Cordialement,';
  const identity = senderName.trim()
    || lines.find((line) => !/^cordialement[,.]?$/i.test(line))
    || 'Relais Pare-Brise';
  const details = lines.filter((line) => (
    !/^cordialement[,.]?$/i.test(line)
    && !/^service client$/i.test(line)
    && line.localeCompare(identity, 'fr', { sensitivity: 'base' }) !== 0
  ));
  return { greeting, identity, details };
}

export function EmailSignaturePreview({
  signature,
  senderName = 'Relais Pare-Brise',
  className,
  compact = false,
  showLabel = true,
}: EmailSignaturePreviewProps) {
  if (!signature.trim()) {
    return (
      <div className={cn('rounded-xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground', className)}>
        Aucune signature ne sera ajoutée.
      </div>
    );
  }

  const { greeting, identity, details } = signatureParts(signature, senderName);

  return (
    <div className={cn('rounded-xl border border-primary/20 bg-gradient-to-br from-primary/[0.07] via-background to-background p-4', className)}>
      {showLabel && (
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
          Aperçu de la signature
        </p>
      )}
      <p className="text-xs text-muted-foreground">{greeting}</p>
      <div className={cn('mt-3 flex items-center gap-3', compact ? 'sm:gap-3' : 'sm:gap-4')}>
        <div className={cn(
          'flex shrink-0 items-center justify-center rounded-2xl bg-primary font-black tracking-[-0.08em] text-primary-foreground shadow-sm',
          compact ? 'h-11 w-11 text-[11px]' : 'h-14 w-14 text-sm',
        )}>
          RPB
        </div>
        <div className="min-w-0 border-l-2 border-primary/70 pl-3 sm:pl-4">
          <p className={cn('truncate font-bold text-foreground', compact ? 'text-sm' : 'text-base')}>
            {identity}
          </p>
          <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
            Service client · Relais Pare-Brise
          </p>
          {details.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              {details.map((detail) => (
                <span key={detail} className="break-all">{detail}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
