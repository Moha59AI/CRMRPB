import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Box, Car, Database, ExternalLink, Rotate3D } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchVehicle3DModel } from '@/services/vehicle-3d-service';

interface Vehicle3DViewerProps {
  make: string | null | undefined;
  model: string | null | undefined;
  registration?: string | null;
}

function sketchfabEmbedUrl(url: string): string {
  try {
    const embed = new URL(url);
    embed.searchParams.set('autostart', '1');
    embed.searchParams.set('preload', '1');
    embed.searchParams.set('ui_infos', '0');
    embed.searchParams.set('ui_controls', '1');
    embed.searchParams.set('ui_help', '0');
    embed.searchParams.set('ui_watermark_link', '1');
    return embed.toString();
  } catch {
    return url;
  }
}

export function Vehicle3DViewer({ make, model, registration }: Vehicle3DViewerProps) {
  const cleanMake = make?.trim() ?? '';
  const cleanModel = model?.trim() ?? '';
  const enabled = Boolean(cleanMake && cleanModel);
  const query = useQuery({
    queryKey: ['vehicle-3d-model', cleanMake.toLocaleLowerCase('fr-FR'), cleanModel.toLocaleLowerCase('fr-FR')],
    queryFn: () => fetchVehicle3DModel(cleanMake, cleanModel),
    enabled,
    staleTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });
  const vehicle = [cleanMake, cleanModel].filter(Boolean).join(' ');
  const embedUrl = useMemo(
    () => query.data?.model?.embedUrl ? sketchfabEmbedUrl(query.data.model.embedUrl) : null,
    [query.data?.model?.embedUrl],
  );

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Rotate3D className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">Vue 3D du véhicule</h3>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {vehicle || 'Marque et modèle à renseigner'}{registration ? ` · ${registration}` : ''}
            </p>
          </div>
        </div>
        <Badge variant="outline" className="gap-1.5 rounded-full text-[11px]">
          <Database className="h-3 w-3" aria-hidden />
          Base 3D vérifiée
        </Badge>
      </div>

      {!enabled ? (
        <div className="flex min-h-[260px] flex-col items-center justify-center px-6 py-10 text-center">
          <Car className="h-10 w-10 text-muted-foreground/45" aria-hidden />
          <p className="mt-3 text-sm font-medium text-foreground">Véhicule non identifiable</p>
          <p className="mt-1 max-w-md text-xs text-muted-foreground">
            La marque et le modèle doivent d’abord être présents dans Onify pour rechercher la bonne vue 3D.
          </p>
        </div>
      ) : query.isLoading ? (
        <div className="space-y-3 p-4 sm:p-5">
          <Skeleton className="aspect-video min-h-[260px] w-full rounded-xl" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : query.isError ? (
        <div className="flex min-h-[260px] flex-col items-center justify-center px-6 py-10 text-center">
          <Box className="h-10 w-10 text-muted-foreground/45" aria-hidden />
          <p className="mt-3 text-sm font-medium text-foreground">Vue 3D momentanément indisponible</p>
          <p className="mt-1 max-w-md text-xs text-muted-foreground">
            Le dossier reste utilisable. La recherche du modèle pourra être relancée en rouvrant cette fiche.
          </p>
        </div>
      ) : query.data?.model && embedUrl ? (
        <>
          <div className="relative aspect-video min-h-[280px] w-full bg-[#e8ece9] sm:min-h-[360px]">
            <iframe
              title={`Vue 3D ${vehicle}`}
              src={embedUrl}
              className="absolute inset-0 h-full w-full border-0"
              allow="autoplay; fullscreen; xr-spatial-tracking"
              allowFullScreen
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
          <div className="flex flex-col gap-2 border-t border-border px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <p className="min-w-0 truncate">
              <span className="font-medium text-foreground">{query.data.model.title}</span>
              {query.data.model.authorName ? ` · ${query.data.model.authorName}` : ''}
              {query.data.model.licenseLabel ? ` · ${query.data.model.licenseLabel}` : ''}
            </p>
            <a
              href={query.data.model.viewerUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex shrink-0 items-center gap-1 font-medium text-primary hover:underline"
            >
              Voir la source
              <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          </div>
        </>
      ) : (
        <div className="flex min-h-[280px] flex-col items-center justify-center px-6 py-10 text-center">
          <Car className="h-11 w-11 text-muted-foreground/45" aria-hidden />
          <p className="mt-3 text-sm font-medium text-foreground">Aucun modèle 3D exact trouvé</p>
          <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
            La base ne contient pas encore une représentation fiable de {vehicle}. Le CRM n’affiche pas un autre véhicule à sa place.
          </p>
        </div>
      )}
    </section>
  );
}
