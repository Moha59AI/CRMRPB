import type { Lead } from '@/types';

export interface MetaAttributionLisible {
  campagne: string | null;
  ensemble: string | null;
  publicite: string | null;
  formulaire: string | null;
  lead: string | null;
}

function objet(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function texte(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function entiteMeta(nom: string | null, id: string | null): string | null {
  if (nom && id) return `${nom} · ID ${id}`;
  if (nom) return nom;
  if (id) return `ID ${id}`;
  return null;
}

/**
 * Lit les nouveaux payloads structures, tout en restant compatible avec les
 * leads Meta deja en base qui ne contiennent que les champs Graph a la racine.
 */
export function lireAttributionMeta(lead: Lead): MetaAttributionLisible {
  const raw = objet(lead.raw_payload) ?? {};
  const attribution = objet(raw.meta_attribution) ?? {};
  const campagne = objet(attribution.campaign) ?? {};
  const ensemble = objet(attribution.adset) ?? {};
  const publicite = objet(attribution.ad) ?? {};
  const formulaire = objet(attribution.form) ?? {};

  return {
    campagne: entiteMeta(
      texte(campagne.name) ?? texte(raw.campaign_name) ?? texte(lead.campaign_name),
      texte(lead.meta_campaign_id) ?? texte(campagne.id) ?? texte(raw.campaign_id),
    ),
    ensemble: entiteMeta(
      texte(ensemble.name) ?? texte(raw.adset_name),
      texte(lead.meta_adset_id) ?? texte(ensemble.id) ?? texte(raw.adset_id),
    ),
    publicite: entiteMeta(
      texte(publicite.name) ?? texte(raw.ad_name),
      texte(lead.meta_ad_id) ?? texte(publicite.id) ?? texte(raw.ad_id),
    ),
    formulaire: entiteMeta(
      texte(formulaire.name) ?? texte(raw.form_name),
      texte(lead.meta_form_id) ?? texte(formulaire.id) ?? texte(raw.form_id),
    ),
    lead: lead.meta_lead_id ? `ID ${lead.meta_lead_id}` : null,
  };
}
