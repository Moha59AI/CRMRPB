import type { CSSProperties } from 'react';
import { supabase } from '@/lib/supabase';
import type { LeadStatus } from '@/types';
import type { LeadJourneyStageKey } from './lead-shared';

export const LEAD_COLOR_KEYS = [
  'nouveau',
  'nrp',
  'qualifie',
  'documents_requested',
  'documents_received',
  'rdv',
  'perdu',
  'cloture',
] as const;

export type LeadColorKey = typeof LEAD_COLOR_KEYS[number];
export type LeadStageColors = Record<LeadColorKey, string>;

export const DEFAULT_LEAD_STAGE_COLORS: LeadStageColors = {
  nouveau: '#38bdf8',
  nrp: '#ef4444',
  qualifie: '#f59e0b',
  documents_requested: '#fb923c',
  documents_received: '#10b981',
  rdv: '#3b82f6',
  perdu: '#64748b',
  cloture: '#14b8a6',
};

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function normaliserLeadStageColors(value: unknown): LeadStageColors {
  const record = value && typeof value === 'object'
    ? value as Partial<Record<LeadColorKey, unknown>>
    : {};

  return Object.fromEntries(
    LEAD_COLOR_KEYS.map((key) => {
      const candidate = record[key];
      return [
        key,
        typeof candidate === 'string' && HEX_COLOR.test(candidate)
          ? candidate.toLowerCase()
          : DEFAULT_LEAD_STAGE_COLORS[key],
      ];
    }),
  ) as LeadStageColors;
}

export async function fetchLeadStageColors(): Promise<LeadStageColors> {
  const { data, error } = await supabase
    .from('lead_pipeline_settings')
    .select('colors')
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return normaliserLeadStageColors(data?.colors);
}

export async function saveLeadStageColors(colors: LeadStageColors): Promise<void> {
  const normalized = normaliserLeadStageColors(colors);
  const { error } = await supabase.rpc('save_lead_pipeline_colors', {
    p_colors: normalized,
  });

  if (error) throw new Error(error.message);
}

export function colorKeyForStatus(status: string): LeadColorKey | null {
  if (status === 'new' || status === 'to_call' || status === 'calling') return 'nouveau';
  if (status === 'nrp') return 'nrp';
  if (status === 'interested') return 'qualifie';
  if (status === 'documents_requested') return 'documents_requested';
  if (status === 'documents_received') return 'documents_received';
  if (status === 'appointment_scheduled') return 'rdv';
  if (status === 'lost') return 'perdu';
  if (status === 'converted') return 'cloture';
  return null;
}

export function colorKeyForStage(stage: LeadJourneyStageKey): LeadColorKey {
  if (stage === 'documents') return 'documents_requested';
  if (stage === 'onify_ready') return 'documents_received';
  return stage;
}

export function leadColorVariable(key: LeadColorKey): string {
  return `var(--lead-color-${key.replace(/_/g, '-')}, ${DEFAULT_LEAD_STAGE_COLORS[key]})`;
}

export function leadStatusColorStyle(status: LeadStatus | string): CSSProperties {
  const key = colorKeyForStatus(status);
  return {
    '--lead-status-color': key ? leadColorVariable(key) : '#94a3b8',
  } as CSSProperties;
}

export function leadStageColorStyle(stage: LeadJourneyStageKey): CSSProperties {
  return {
    '--lead-status-color': leadColorVariable(colorKeyForStage(stage)),
  } as CSSProperties;
}

export function applyLeadStageColors(colors: LeadStageColors): void {
  for (const key of LEAD_COLOR_KEYS) {
    document.documentElement.style.setProperty(
      `--lead-color-${key.replace(/_/g, '-')}`,
      colors[key],
    );
  }
}
