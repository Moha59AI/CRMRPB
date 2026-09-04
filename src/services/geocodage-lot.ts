// Localisation en lot des leads deja enregistres
//
// Les leads recus avant l'integration de la Base Adresse Nationale n'ont que
// `city`, saisi a la main. Sans reprise, la carte resterait vide pendant des
// mois — le temps que chaque fiche soit rouverte une a une.
//
// Ce qu'on ne fait pas : ecraser une localisation existante. Une adresse
// choisie a la main dans la BAN est plus fiable que ce qu'une chaine
// approximative permet de retrouver.

import { supabase } from '@/lib/supabase';
import { getWorkspaceId } from '@/services/workspace';
import { rechercherAdresse, precisionDe } from '@/services/adresse-service';

export interface Avancement {
  traites: number;
  total: number;
  localises: number;
  introuvables: number;
}

export interface ResultatLocalisation extends Avancement {
  interrompu: boolean;
}

/** Taille de lot. La BAN tolere 50 appels/seconde/IP ; on reste tres en deca. */
const LOT = 8;
const PAUSE_MS = 350;

interface LeadALocaliser {
  id: string;
  address: string | null;
  postal_code: string | null;
  city: string | null;
}

function requete(l: LeadALocaliser): string | null {
  const parts = [l.address, l.postal_code, l.city].filter(Boolean);
  const q = parts.join(' ').trim();
  return q.length >= 3 ? q : null;
}

/**
 * Localise les leads sans coordonnees.
 *
 * `signal` permet a l'utilisateur d'arreter : sur plusieurs centaines de
 * leads l'operation dure, et bloquer l'interface sans porte de sortie serait
 * inacceptable. Ce qui a deja ete ecrit reste ecrit.
 */
export async function localiserLeadsManquants(
  options: {
    onAvancement?: (a: Avancement) => void;
    signal?: AbortSignal;
    /**
     * Restreint la reprise a ces leads. Sans cette limite on geocoderait tout
     * le carnet, soit des centaines d'appels pour des points que personne
     * n'ira voir : seules les interventions planifiees ont un lieu.
     */
    idsLimites?: string[];
  } = {},
): Promise<ResultatLocalisation> {
  const workspaceId = await getWorkspaceId();

  if (options.idsLimites && options.idsLimites.length === 0) {
    return { traites: 0, total: 0, localises: 0, introuvables: 0, interrompu: false };
  }

  let selection = supabase
    .from('leads')
    .select('id, address, postal_code, city')
    .eq('workspace_id', workspaceId)
    .is('latitude', null)
    .or('address.not.is.null,city.not.is.null');

  if (options.idsLimites) selection = selection.in('id', options.idsLimites);

  const { data, error } = await selection;

  if (error) throw new Error(error.message);

  const candidats = ((data ?? []) as LeadALocaliser[]).filter((l) => requete(l) !== null);

  const etat: Avancement = {
    traites: 0, total: candidats.length, localises: 0, introuvables: 0,
  };
  options.onAvancement?.({ ...etat });

  for (let i = 0; i < candidats.length; i += LOT) {
    if (options.signal?.aborted) {
      return { ...etat, interrompu: true };
    }

    const lot = candidats.slice(i, i + LOT);

    await Promise.all(
      lot.map(async (lead) => {
        const q = requete(lead);
        if (!q) return;

        try {
          const [meilleure] = await rechercherAdresse(q, {
            limite: 1,
            signal: options.signal,
          });

          if (!meilleure || meilleure.latitude == null) {
            etat.introuvables += 1;
            return;
          }

          // On ne reecrit pas l'adresse : la reprise sert a placer un point,
          // pas a remplacer ce qu'un conseiller a saisi.
          const { error: erreurMaj } = await supabase
            .from('leads')
            .update({
              latitude: meilleure.latitude,
              longitude: meilleure.longitude,
              citycode: meilleure.citycode,
              geo_precision: precisionDe(meilleure),
            })
            .eq('id', lead.id);

          if (erreurMaj) {
            etat.introuvables += 1;
            return;
          }

          etat.localises += 1;
        } catch {
          // Un echec ponctuel ne doit pas arreter la reprise entiere.
          etat.introuvables += 1;
        } finally {
          etat.traites += 1;
        }
      }),
    );

    options.onAvancement?.({ ...etat });

    if (i + LOT < candidats.length) {
      await new Promise((r) => setTimeout(r, PAUSE_MS));
    }
  }

  return { ...etat, interrompu: false };
}

interface RendezVousALocaliser {
  id: string;
  address: string | null;
}

/**
 * Localise les rendez-vous qui portent leur propre adresse sans coordonnees.
 *
 * Ceux-la echappent a la reprise des leads : l'intervention a lieu ailleurs
 * qu'au domicile du client, donc geocoder le lead ne leur donnerait pas de
 * point. Tant qu'ils n'en ont pas, la carte les compte comme non localises
 * plutot que de leur preter les coordonnees du client -- ce qui enverrait le
 * technicien a la mauvaise adresse.
 */
export async function localiserRendezVousManquants(
  params: {
    debut: string;
    fin: string;
    onAvancement?: (a: Avancement) => void;
    signal?: AbortSignal;
  },
): Promise<ResultatLocalisation> {
  const workspaceId = await getWorkspaceId();

  const { data, error } = await supabase
    .from('appointments')
    .select('id, address')
    .eq('workspace_id', workspaceId)
    .eq('type', 'intervention')
    .gte('start_time', params.debut)
    .lte('start_time', params.fin)
    .not('address', 'is', null)
    .is('latitude', null);

  if (error) throw new Error(error.message);

  const candidats = ((data ?? []) as RendezVousALocaliser[]).filter(
    (r) => (r.address ?? '').trim().length >= 3,
  );

  const etat: Avancement = {
    traites: 0, total: candidats.length, localises: 0, introuvables: 0,
  };
  params.onAvancement?.({ ...etat });

  for (let i = 0; i < candidats.length; i += LOT) {
    if (params.signal?.aborted) return { ...etat, interrompu: true };

    const lot = candidats.slice(i, i + LOT);

    await Promise.all(
      lot.map(async (rdv) => {
        try {
          const [meilleure] = await rechercherAdresse((rdv.address ?? '').trim(), {
            limite: 1,
            signal: params.signal,
          });

          if (!meilleure || meilleure.latitude == null) {
            etat.introuvables += 1;
            return;
          }

          // On ne reecrit pas l'adresse : elle a ete saisie pour ce
          // deplacement-la, la reprise sert seulement a poser le point.
          const { error: erreurMaj } = await supabase
            .from('appointments')
            .update({
              latitude: meilleure.latitude,
              longitude: meilleure.longitude,
              citycode: meilleure.citycode,
              geo_precision: precisionDe(meilleure),
            })
            .eq('id', rdv.id);

          if (erreurMaj) {
            etat.introuvables += 1;
            return;
          }

          etat.localises += 1;
        } catch {
          etat.introuvables += 1;
        } finally {
          etat.traites += 1;
        }
      }),
    );

    params.onAvancement?.({ ...etat });

    if (i + LOT < candidats.length) {
      await new Promise((r) => setTimeout(r, PAUSE_MS));
    }
  }

  return { ...etat, interrompu: false };
}

/** Combien de leads restent a localiser, pour proposer la reprise a bon escient. */
export async function compterLeadsNonLocalises(): Promise<number> {
  const workspaceId = await getWorkspaceId();

  const { count, error } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .is('latitude', null)
    .or('address.not.is.null,city.not.is.null');

  if (error) throw new Error(error.message);
  return count ?? 0;
}
