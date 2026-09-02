import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { ChampAdresse } from '@/components/ChampAdresse';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  rechercherCommunesParCodePostal,
  type AdresseNormalisee,
  type CommuneCodePostal,
} from '@/services/adresse-service';

export type ValeurAdresseLead = AdresseNormalisee;

interface LeadAddressFieldsProps {
  idPrefix: string;
  value: ValeurAdresseLead;
  onUpdate: (updates: Partial<ValeurAdresseLead>) => void;
  disabled?: boolean;
}

export function LeadAddressFields({
  idPrefix, value, onUpdate, disabled,
}: LeadAddressFieldsProps) {
  const [recherche, setRecherche] = useState(
    [value.address, value.postal_code, value.city].filter(Boolean).join(' '),
  );
  const [communes, setCommunes] = useState<CommuneCodePostal[]>([]);
  const [chargementVille, setChargementVille] = useState(false);
  const updateRef = useRef(onUpdate);
  updateRef.current = onUpdate;

  useEffect(() => {
    setRecherche([value.address, value.postal_code, value.city].filter(Boolean).join(' '));
    // On réinitialise la saisie seulement quand la fiche/adresse change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idPrefix]);

  useEffect(() => {
    const cp = value.postal_code?.replace(/\D/g, '').slice(0, 5) ?? '';
    if (!/^\d{5}$/.test(cp)) {
      setCommunes([]);
      return;
    }

    const controleur = new AbortController();
    const minuteur = setTimeout(async () => {
      setChargementVille(true);
      try {
        const resultats = await rechercherCommunesParCodePostal(cp);
        if (controleur.signal.aborted) return;
        setCommunes(resultats);
        const actuelle = value.city?.trim().toLocaleLowerCase('fr');
        const correspond = resultats.find((c) => c.nom.toLocaleLowerCase('fr') === actuelle);
        const choisie = correspond ?? resultats[0];
        if (choisie && (!actuelle || !correspond)) {
          updateRef.current({
            city: choisie.nom,
            citycode: choisie.code,
            latitude: choisie.latitude,
            longitude: choisie.longitude,
            geo_precision:
              choisie.latitude != null && choisie.longitude != null
                ? 'approximatif'
                : null,
          });
        }
      } catch {
        setCommunes([]);
      } finally {
        if (!controleur.signal.aborted) setChargementVille(false);
      }
    }, 250);

    return () => {
      clearTimeout(minuteur);
      controleur.abort();
    };
  }, [value.postal_code, value.city]);

  const choisirCommune = (nom: string) => {
    const commune = communes.find((c) => c.nom === nom);
    if (!commune) {
      onUpdate({ city: nom, citycode: null, latitude: null, longitude: null, geo_precision: null });
      return;
    }
    onUpdate({
      city: commune.nom,
      citycode: commune.code,
      latitude: commune.latitude,
      longitude: commune.longitude,
      geo_precision:
        commune.latitude != null && commune.longitude != null
          ? 'approximatif'
          : null,
    });
  };

  return (
    <div className="space-y-3">
      <ChampAdresse
        id={`${idPrefix}-address`}
        label="Adresse"
        valeur={recherche}
        onValeurChange={(texte) => {
          setRecherche(texte);
          onUpdate({
            address: texte,
            citycode: null,
            latitude: null,
            longitude: null,
            geo_precision: null,
          });
        }}
        onChoisir={(adresse) => {
          setRecherche([adresse.address, adresse.postal_code, adresse.city].filter(Boolean).join(' '));
          onUpdate(adresse);
        }}
        placeholder="Numéro et nom de rue…"
        desactive={disabled}
      />

      <div className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)]">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-postal-code`}>Code postal</Label>
          <div className="relative">
            <Input
              id={`${idPrefix}-postal-code`}
              inputMode="numeric"
              maxLength={5}
              value={value.postal_code ?? ''}
              disabled={disabled}
              className="rounded-lg pr-8 tabular"
              placeholder="59000"
              onChange={(e) => {
                const postalCode = e.target.value.replace(/\D/g, '').slice(0, 5);
                onUpdate({
                  postal_code: postalCode,
                  citycode: null,
                  latitude: null,
                  longitude: null,
                  geo_precision: null,
                });
              }}
            />
            {chargementVille && (
              <Loader2 className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-city`}>Ville</Label>
          {communes.length > 1 ? (
            <select
              id={`${idPrefix}-city`}
              value={value.city ?? ''}
              disabled={disabled}
              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              onChange={(e) => choisirCommune(e.target.value)}
            >
              {communes.map((commune) => (
                <option key={commune.code} value={commune.nom}>{commune.nom}</option>
              ))}
            </select>
          ) : (
            <Input
              id={`${idPrefix}-city`}
              value={value.city ?? ''}
              disabled={disabled}
              className="rounded-lg"
              placeholder="Remplie depuis le code postal"
              onChange={(e) => choisirCommune(e.target.value)}
            />
          )}
          {communes.length > 1 && (
            <p className="text-[11px] text-muted-foreground">Plusieurs villes utilisent ce code postal.</p>
          )}
        </div>
      </div>
    </div>
  );
}
