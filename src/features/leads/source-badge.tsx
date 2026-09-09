import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { LeadSource } from '@/types';
import { sourceLabels } from './lead-shared';

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0">
      <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2.1H12v4h5.4a4.7 4.7 0 0 1-2 3v2.6h3.3c1.9-1.8 2.9-4.4 2.9-7.5Z" />
      <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.7-2.3l-3.3-2.6c-.9.6-2 1-3.4 1a5.9 5.9 0 0 1-5.5-4.1H3.1v2.7A10.1 10.1 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.5 14a6 6 0 0 1 0-3.9V7.4H3.1a10.1 10.1 0 0 0 0 9.3L6.5 14Z" />
      <path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A9.8 9.8 0 0 0 12 2a10.1 10.1 0 0 0-8.9 5.4l3.4 2.7A5.9 5.9 0 0 1 12 6Z" />
    </svg>
  );
}

function MetaMark() {
  return (
    <span aria-hidden="true" className="text-[15px] font-bold leading-none text-[#0866ff]">
      ∞
    </span>
  );
}

export function SourceBadge({ source, className }: { source: LeadSource; className?: string }) {
  const vientDuWeb = source === 'google_ads' || source === 'webhook';
  const vientDeMeta = source === 'meta';

  return (
    <Badge
      variant="outline"
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold',
        vientDuWeb && 'border-blue-200 bg-white text-blue-800',
        vientDeMeta && 'border-[#0866ff]/20 bg-[#0866ff]/5 text-[#0758d3]',
        !vientDuWeb && !vientDeMeta && 'border-border bg-muted/40 text-muted-foreground',
        className,
      )}
    >
      {vientDuWeb && <GoogleMark />}
      {vientDeMeta && <MetaMark />}
      {vientDuWeb ? 'Web · Google Ads' : vientDeMeta ? 'Meta Lead Ads' : (sourceLabels[source] ?? source)}
    </Badge>
  );
}
