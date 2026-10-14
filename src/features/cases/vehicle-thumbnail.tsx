import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Car } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fetchVehicle3DModel, vehicle3DQueryKey } from '@/services/vehicle-3d-service';

interface VehicleThumbnailProps {
  make: string | null | undefined;
  model: string | null | undefined;
  className?: string;
}

type VisibilityListener = () => void;

const visibilityListeners = new Map<Element, VisibilityListener>();
let sharedObserver: IntersectionObserver | null = null;

function getSharedObserver(): IntersectionObserver | null {
  if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return null;
  if (!sharedObserver) {
    sharedObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        visibilityListeners.get(entry.target)?.();
        visibilityListeners.delete(entry.target);
        sharedObserver?.unobserve(entry.target);
      });
    }, { rootMargin: '320px 0px' });
  }
  return sharedObserver;
}

export function VehicleThumbnail({ make, model, className }: VehicleThumbnailProps) {
  const cleanMake = make?.trim() ?? '';
  const cleanModel = model?.trim() ?? '';
  const canSearch = Boolean(cleanMake && cleanModel);
  const containerRef = useRef<HTMLSpanElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    if (!canSearch || shouldLoad) return;
    const element = containerRef.current;
    const observer = getSharedObserver();
    if (!element || !observer) {
      setShouldLoad(true);
      return;
    }
    visibilityListeners.set(element, () => setShouldLoad(true));
    observer.observe(element);
    return () => {
      visibilityListeners.delete(element);
      observer.unobserve(element);
    };
  }, [canSearch, shouldLoad]);

  const query = useQuery({
    queryKey: vehicle3DQueryKey(cleanMake, cleanModel),
    queryFn: () => fetchVehicle3DModel(cleanMake, cleanModel),
    enabled: canSearch && shouldLoad,
    staleTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });
  const imageUrl = query.data?.model?.thumbnailUrl ?? null;

  useEffect(() => setImageFailed(false), [imageUrl]);

  return (
    <span
      ref={containerRef}
      className={cn(
        'relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-gradient-to-br from-muted/30 to-muted/70 text-muted-foreground',
        className,
      )}
      aria-hidden
    >
      {imageUrl && !imageFailed ? (
        <img
          src={imageUrl}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <Car className="h-5 w-5 opacity-55" strokeWidth={1.6} />
      )}
      {query.isFetching && (
        <span className="absolute inset-0 animate-pulse bg-muted/45" />
      )}
    </span>
  );
}
