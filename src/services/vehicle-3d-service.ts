import { supabase } from '@/lib/supabase';

export interface Vehicle3DModel {
  id: string;
  make: string;
  model: string;
  provider: 'sketchfab';
  providerModelId: string;
  title: string;
  embedUrl: string;
  viewerUrl: string;
  thumbnailUrl: string | null;
  authorName: string | null;
  authorUrl: string | null;
  licenseLabel: string | null;
  lastCheckedAt: string;
}

type Vehicle3DResponse = {
  model: Vehicle3DModel | null;
  cached?: boolean;
  reason?: 'vehicle_incomplete' | 'not_found';
  error?: string;
};

export async function fetchVehicle3DModel(
  make: string,
  model: string,
): Promise<Vehicle3DResponse> {
  const { data, error } = await supabase.functions.invoke<Vehicle3DResponse>('vehicle-3d-match', {
    body: { make, model },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data ?? { model: null, reason: 'not_found' };
}
