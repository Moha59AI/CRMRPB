// L'état de la zone de test, et les gestes pour y entrer ou en sortir
//
// Séparé des composants : un fichier qui exporte à la fois un hook et des
// composants empêche le rechargement à chaud de React de recharger la page
// sans la remonter.
//
// Nommé `etat-zone` et non `use-zone-test` : `node --test` traite tout
// fichier en `-test.ts` comme une suite de tests, et tentait d'exécuter
// celui-ci.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/features/auth/auth-context';
import {
  entrerZoneTest, fetchEtatZoneTest, quitterZoneTest, reinitialiserZoneTest,
} from '@/services/zone-test-service';

export function useZoneTest() {
  const { profile, refreshProfile } = useAuth();
  const queryClient = useQueryClient();
  const workspaceId = profile?.workspace_id ?? null;

  const etat = useQuery({
    queryKey: ['zone-test', workspaceId],
    queryFn: () => fetchEtatZoneTest(workspaceId),
    enabled: Boolean(profile),
    staleTime: 5 * 60_000,
    retry: false,
  });

  /**
   * Changer d'espace change la totalité de ce que le CRM affiche. Le cache
   * de requêtes est donc vidé, pas seulement invalidé : laisser une liste de
   * l'autre espace à l'écran, même une seconde, est exactement la confusion
   * qu'on veut éviter.
   */
  const basculer = useMutation({
    mutationFn: async (versTest: boolean) => {
      if (versTest) await entrerZoneTest(); else await quitterZoneTest();
      await refreshProfile();
      queryClient.clear();
    },
    onError: (erreur: Error) => toast.error(erreur.message),
  });

  const reinitialiser = useMutation({
    mutationFn: async () => {
      await reinitialiserZoneTest();
      await refreshProfile();
      queryClient.clear();
      toast.success('Données de test régénérées');
    },
    onError: (erreur: Error) => toast.error(erreur.message),
  });

  return {
    autorise: etat.data?.autorise ?? false,
    dedans: etat.data?.dedans ?? false,
    basculer,
    reinitialiser,
  };
}
