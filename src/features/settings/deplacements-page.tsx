// Réglages des déplacements
//
// Deux choses s'y règlent : d'où l'on part, et ce que coûte un kilomètre.
//
// L'adresse de départ passe par le même `ChampAdresse` que le reste du CRM —
// la Base Adresse Nationale. Elle n'est pas enregistrée comme du texte : le
// choix d'une suggestion dépose aussi le code postal, la ville, le code INSEE
// et les coordonnées. Ce sont elles qui partiront à OpenRouteService, et c'est
// pour cela qu'aucune adresse n'est regéocodée à chaque trajet.
//
// Rien n'est codé en dur. Le prix du carburant change tous les mois, et un
// barème faux se propagerait à tous les chiffrages sans se signaler.

import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Car, Fuel, Loader2, MapPin, RotateCcw, Save, UserRound } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { ChampAdresse } from '@/components/ChampAdresse';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/features/auth/auth-context';
import { messageErreurBase } from '@/lib/erreurs';
import { BAREME_PAR_DEFAUT, calculerCouts, formatEuros } from '@/features/deplacements/cout-trajet';
import {
  enregistrerReglagesDeplacement, fetchReglagesDeplacement,
} from '@/services/trajet-service';
import type { AdresseNormalisee } from '@/services/adresse-service';

const schema = z.object({
  depart_label: z.string().trim().max(300).nullable(),
  depart_address: z.string().trim().max(200).nullable(),
  depart_postal_code: z.string().trim().max(10).nullable(),
  depart_city: z.string().trim().max(120).nullable(),
  depart_citycode: z.string().trim().max(10).nullable(),
  depart_latitude: z.number().min(-90).max(90).nullable(),
  depart_longitude: z.number().min(-180).max(180).nullable(),

  fuel_price_per_liter: z.coerce.number().positive('Doit être supérieur à 0').max(10, '10 €/L au maximum'),
  consumption_l_per_100km: z.coerce.number().positive('Doit être supérieur à 0').max(50, '50 L/100 km au maximum'),
  vehicle_cost_per_km: z.coerce.number().min(0, 'Ne peut pas être négatif').max(10, '10 €/km au maximum'),
  labour_cost_per_hour: z.coerce.number().min(0, 'Ne peut pas être négatif').max(500, '500 €/h au maximum'),
});

type Formulaire = z.infer<typeof schema>;

const VIDE: Formulaire = {
  depart_label: null,
  depart_address: null,
  depart_postal_code: null,
  depart_city: null,
  depart_citycode: null,
  depart_latitude: null,
  depart_longitude: null,
  ...BAREME_PAR_DEFAUT,
};

/** Trajet de démonstration, pour voir ce que le barème produit. */
const EXEMPLE = { distanceAllerKm: 18.4, tempsAllerMin: 24 };

export function ReglagesDeplacementsPage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const modifiable = profile?.role === 'admin' || profile?.role === 'manager';

  const query = useQuery({
    queryKey: ['reglages-deplacement'],
    queryFn: fetchReglagesDeplacement,
    retry: false,
  });

  const form = useForm<Formulaire>({ resolver: zodResolver(schema), defaultValues: VIDE });
  const { formState, handleSubmit, register, reset, setValue, watch } = form;

  // Le champ d'adresse travaille sur du texte libre ; les coordonnées ne sont
  // déposées qu'au choix d'une suggestion. Elles ont donc leur propre état.
  const [texteAdresse, setTexteAdresse] = useState('');

  useEffect(() => {
    if (!query.data) return;
    const valeurs: Formulaire = {
      depart_label: query.data.depart_label,
      depart_address: query.data.depart_address,
      depart_postal_code: query.data.depart_postal_code,
      depart_city: query.data.depart_city,
      depart_citycode: query.data.depart_citycode,
      depart_latitude: query.data.depart_latitude,
      depart_longitude: query.data.depart_longitude,
      fuel_price_per_liter: query.data.fuel_price_per_liter,
      consumption_l_per_100km: query.data.consumption_l_per_100km,
      vehicle_cost_per_km: query.data.vehicle_cost_per_km,
      labour_cost_per_hour: query.data.labour_cost_per_hour,
    };
    reset(valeurs);
    setTexteAdresse(valeurs.depart_label ?? '');
  }, [query.data, reset]);

  const enregistrer = useMutation({
    mutationFn: enregistrerReglagesDeplacement,
    onSuccess: async (_resultat, valeurs) => {
      reset(valeurs as Formulaire);
      await queryClient.invalidateQueries({ queryKey: ['reglages-deplacement'] });
      // Le barème a changé : les trajets déjà calculés doivent être rechiffrés
      // à la prochaine lecture. La route, elle, n'est pas redemandée.
      await queryClient.invalidateQueries({ queryKey: ['trajet'] });
      toast.success('Réglages de déplacement enregistrés');
    },
    onError: (erreur: Error) => toast.error(messageErreurBase(erreur.message)),
  });

  const choisirDepart = (adresse: AdresseNormalisee) => {
    const complet = [adresse.address, adresse.postal_code, adresse.city]
      .filter(Boolean).join(' ');
    setTexteAdresse(complet);
    const options = { shouldDirty: true, shouldValidate: true } as const;

    setValue('depart_label', complet || null, options);
    setValue('depart_address', adresse.address, options);
    setValue('depart_postal_code', adresse.postal_code, options);
    setValue('depart_city', adresse.city, options);
    setValue('depart_citycode', adresse.citycode, options);
    setValue('depart_latitude', adresse.latitude, options);
    setValue('depart_longitude', adresse.longitude, options);
  };

  const latitude = watch('depart_latitude');
  const longitude = watch('depart_longitude');
  const localise = latitude != null && longitude != null;

  const bareme = {
    fuel_price_per_liter: Number(watch('fuel_price_per_liter')) || 0,
    consumption_l_per_100km: Number(watch('consumption_l_per_100km')) || 0,
    vehicle_cost_per_km: Number(watch('vehicle_cost_per_km')) || 0,
    labour_cost_per_hour: Number(watch('labour_cost_per_hour')) || 0,
  };
  const apercu = apercuCout(bareme);

  const messageErreur = query.error instanceof Error ? query.error.message : '';
  const migrationManquante = messageErreur.includes('travel_settings');

  return (
    <>
      <PageHeader
        title="Déplacements"
        description="Point de départ des interventions et coût réel d’un kilomètre"
        action={modifiable ? (
          <Button
            form="reglages-deplacements"
            type="submit"
            className="w-full rounded-full sm:w-auto"
            disabled={enregistrer.isPending || !formState.isDirty}
          >
            {enregistrer.isPending
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              : <Save className="mr-2 h-4 w-4" />}
            Enregistrer
          </Button>
        ) : undefined}
      />

      <div className="overflow-y-auto p-4 sm:p-6">
        {query.isLoading ? (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <Skeleton className="h-96 rounded-xl" />
            <Skeleton className="h-72 rounded-xl" />
          </div>
        ) : query.isError ? (
          <Card className="rounded-xl border-destructive/30">
            <CardContent className="p-6 text-center">
              <p className="text-sm font-medium text-destructive">Réglage indisponible</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {migrationManquante
                  ? 'La migration des déplacements doit être appliquée dans Supabase avant d’utiliser cet écran.'
                  : messageErreurBase(messageErreur)}
              </p>
              <Button variant="outline" className="mt-4 rounded-full" onClick={() => query.refetch()}>
                Réessayer
              </Button>
            </CardContent>
          </Card>
        ) : (
          <form
            id="reglages-deplacements"
            onSubmit={handleSubmit((valeurs) => enregistrer.mutate(valeurs))}
            className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]"
          >
            <div className="space-y-4">
              <Card className="rounded-xl border border-border">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <MapPin className="h-4 w-4 text-primary" aria-hidden />
                    Adresse de départ
                  </CardTitle>
                  <CardDescription>
                    D’où partent les techniciens. Choisissez-la dans les suggestions :
                    c’est ce qui enregistre les coordonnées, et elles ne seront plus
                    jamais recalculées.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ChampAdresse
                    label="Adresse"
                    valeur={texteAdresse}
                    onValeurChange={setTexteAdresse}
                    onChoisir={choisirDepart}
                    desactive={!modifiable}
                    placeholder="Numéro, rue, ville…"
                  />

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Lecture libelle="Code postal" valeur={watch('depart_postal_code')} />
                    <Lecture libelle="Ville" valeur={watch('depart_city')} />
                  </div>

                  <div
                    className={`rounded-lg border px-3 py-2 text-xs ${
                      localise
                        ? 'border-done/20 bg-done-soft text-done'
                        : 'border-due/20 bg-due-soft text-foreground'
                    }`}
                  >
                    {localise
                      ? `Point enregistré : ${latitude?.toFixed(5)}, ${longitude?.toFixed(5)}`
                      : 'Aucun point enregistré. Sans coordonnées, aucun trajet ne peut être calculé — choisissez l’adresse dans la liste des suggestions.'}
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-xl border border-border">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Fuel className="h-4 w-4 text-primary" aria-hidden />
                    Barème
                  </CardTitle>
                  <CardDescription>
                    Ces quatre valeurs produisent tous les coûts affichés sur les fiches.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <Montant
                    id="fuel_price_per_liter"
                    label="Prix du carburant"
                    unite="€ / L"
                    pas="0.001"
                    icone={Fuel}
                    erreur={formState.errors.fuel_price_per_liter?.message}
                    desactive={!modifiable}
                    {...register('fuel_price_per_liter')}
                  />
                  <Montant
                    id="consumption_l_per_100km"
                    label="Consommation moyenne"
                    unite="L / 100 km"
                    pas="0.1"
                    icone={Car}
                    erreur={formState.errors.consumption_l_per_100km?.message}
                    desactive={!modifiable}
                    {...register('consumption_l_per_100km')}
                  />
                  <Montant
                    id="vehicle_cost_per_km"
                    label="Coût kilométrique véhicule"
                    unite="€ / km"
                    pas="0.001"
                    icone={Car}
                    erreur={formState.errors.vehicle_cost_per_km?.message}
                    desactive={!modifiable}
                    {...register('vehicle_cost_per_km')}
                  />
                  <Montant
                    id="labour_cost_per_hour"
                    label="Coût horaire salarié chargé"
                    unite="€ / h"
                    pas="0.5"
                    icone={UserRound}
                    erreur={formState.errors.labour_cost_per_hour?.message}
                    desactive={!modifiable}
                    {...register('labour_cost_per_hour')}
                  />

                  {modifiable && (
                    <div className="sm:col-span-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="rounded-full"
                        onClick={() => {
                          const options = { shouldDirty: true, shouldValidate: true } as const;
                          setValue('fuel_price_per_liter', BAREME_PAR_DEFAUT.fuel_price_per_liter, options);
                          setValue('consumption_l_per_100km', BAREME_PAR_DEFAUT.consumption_l_per_100km, options);
                          setValue('vehicle_cost_per_km', BAREME_PAR_DEFAUT.vehicle_cost_per_km, options);
                          setValue('labour_cost_per_hour', BAREME_PAR_DEFAUT.labour_cost_per_hour, options);
                        }}
                      >
                        <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                        Revenir aux valeurs par défaut
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card className="h-fit rounded-xl border border-border">
              <CardHeader>
                <CardTitle className="text-base">Ce que ça donne</CardTitle>
                <CardDescription>
                  Pour une intervention à {EXEMPLE.distanceAllerKm.toLocaleString('fr-FR')} km
                  et {EXEMPLE.tempsAllerMin} min de route à l’aller.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <LigneApercu libelle="Carburant" montant={apercu.cout_carburant} />
                <LigneApercu libelle="Coût véhicule" montant={apercu.cout_vehicule} />
                <LigneApercu libelle="Temps salarié" montant={apercu.cout_temps} />
                <div className="flex items-baseline justify-between gap-3 rounded-lg bg-primary/5 px-3 py-2.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-primary">
                    Coût total
                  </span>
                  <span className="text-lg font-semibold tabular text-primary">
                    {formatEuros(apercu.cout_total)}
                  </span>
                </div>
                <p className="pt-1 text-xs text-muted-foreground">
                  Les itinéraires viennent d’OpenRouteService ; les adresses et leurs
                  coordonnées restent celles de la Base Adresse Nationale.
                </p>
              </CardContent>
            </Card>
          </form>
        )}
      </div>
    </>
  );
}

/** Même fonction que les fiches : un aperçu calculé autrement ne prouverait rien. */
function apercuCout(bareme: typeof BAREME_PAR_DEFAUT) {
  return calculerCouts(EXEMPLE.distanceAllerKm * 1000, EXEMPLE.tempsAllerMin * 60, bareme);
}

function Lecture({ libelle, valeur }: { libelle: string; valeur: string | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{libelle}</p>
      <p className="mt-0.5 truncate text-sm text-foreground">{valeur || '—'}</p>
    </div>
  );
}

function LigneApercu({ libelle, montant }: { libelle: string; montant: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{libelle}</span>
      <span className="tabular text-foreground">{formatEuros(montant)}</span>
    </div>
  );
}

const Montant = ({ id, label, unite, pas, icone: Icone, erreur, desactive, ...champ }: {
  id: string;
  label: string;
  unite: string;
  pas: string;
  icone: typeof Fuel;
  erreur?: string;
  desactive?: boolean;
} & ReturnType<ReturnType<typeof useForm<Formulaire>>['register']>) => (
  <div>
    <Label htmlFor={id} className="flex items-center gap-1.5 text-sm">
      <Icone className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
      {label}
    </Label>
    <div className="relative mt-1.5">
      <Input
        id={id}
        type="number"
        step={pas}
        min="0"
        inputMode="decimal"
        disabled={desactive}
        className="rounded-lg pr-24 tabular"
        aria-invalid={erreur ? true : undefined}
        {...champ}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
        {unite}
      </span>
    </div>
    {erreur && <p className="mt-1 text-xs text-destructive">{erreur}</p>}
  </div>
);
