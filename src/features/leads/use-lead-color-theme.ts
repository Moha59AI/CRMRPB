import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  applyLeadStageColors,
  DEFAULT_LEAD_STAGE_COLORS,
  fetchLeadStageColors,
} from './lead-color-settings';

/** Charge une fois les couleurs de l'espace et les expose comme variables CSS. */
export function useLeadColorTheme(): void {
  const { data } = useQuery({
    queryKey: ['lead-stage-colors'],
    queryFn: fetchLeadStageColors,
    retry: false,
  });

  useEffect(() => {
    applyLeadStageColors(data ?? DEFAULT_LEAD_STAGE_COLORS);
  }, [data]);
}
