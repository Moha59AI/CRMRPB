import {
  CheckCircle2, Eye, Monitor, Smartphone, Tablet, UploadCloud,
} from 'lucide-react';
import { formatDateTime } from '@/features/leads/lead-shared';
import { cn } from '@/lib/utils';
import type {
  ClientDocumentActivity, ClientDocumentItem,
} from '@/services/client-documents-service';

const activityLabels = {
  link_opened: 'Lien ouvert par le client',
  upload_started: 'Envoi commencé',
  document_uploaded: 'Document déposé',
  request_completed: 'Dossier documentaire complété',
} as const;

const deviceLabels = {
  mobile: 'téléphone',
  tablet: 'tablette',
  desktop: 'ordinateur',
  unknown: 'appareil non identifié',
} as const;

function DeviceIcon({ device }: { device: keyof typeof deviceLabels }) {
  if (device === 'mobile') return <Smartphone className="h-3.5 w-3.5" />;
  if (device === 'tablet') return <Tablet className="h-3.5 w-3.5" />;
  return <Monitor className="h-3.5 w-3.5" />;
}

export function ClientDocumentActivityTimeline({
  activity,
  lastOpenedAt,
  items,
  className,
}: {
  activity: ClientDocumentActivity[];
  lastOpenedAt: string | null;
  items: ClientDocumentItem[];
  className?: string;
}) {
  const documentLabels = new Map(items.map((item) => [item.document_type, item.label]));
  const events: ClientDocumentActivity[] = activity.length > 0
    ? activity
    : lastOpenedAt
      ? [{
          id: `legacy-${lastOpenedAt}`,
          request_id: 'legacy',
          event_type: 'link_opened',
          document_type: null,
          device_type: 'unknown',
          created_at: lastOpenedAt,
        }]
      : [];

  return (
    <div className={cn('bg-muted/20', className)}>
      <div className="flex items-center gap-2">
        <Eye className="h-4 w-4 text-primary" />
        <h4 className="text-sm font-semibold">Activité du lien</h4>
      </div>
      {events.length > 0 ? (
        <div className="mt-3 space-y-3">
          {events.map((event) => {
            const detail = event.document_type
              ? documentLabels.get(event.document_type) ?? event.document_type
              : null;
            const EventIcon = event.event_type === 'link_opened' ? Eye
              : event.event_type === 'upload_started' ? UploadCloud
                : CheckCircle2;
            return (
              <div key={event.id} className="flex items-start gap-3">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-card text-primary">
                  <EventIcon className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {activityLabels[event.event_type]}
                    {detail ? ` — ${detail}` : ''}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span>{formatDateTime(event.created_at)}</span>
                    <span className="inline-flex items-center gap-1">
                      <DeviceIcon device={event.device_type} />
                      {deviceLabels[event.device_type]}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">Le client n’a pas encore ouvert ce lien.</p>
      )}
    </div>
  );
}

