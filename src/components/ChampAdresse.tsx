import { useEffect, useId, useRef, useState } from 'react';
import { Loader2, MapPin, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  rechercherAdresse, normaliser,
  type AdresseSuggestion, type AdresseNormalisee, type TypeAdresse,
} from '@/services/adresse-service';

/**
 * Saisie d'adresse assistée par la Base Adresse Nationale.
 *
 * La saisie libre reste possible : toutes les adresses ne sont pas dans la
 * BAN — lotissements neufs, lieux-dits, zones d'activité. Choisir une
 * suggestion enrichit la fiche (code INSEE, coordonnées) ; taper autre chose
 * enregistre quand même le texte. Refuser une adresse absente du référentiel
 * bloquerait un conseiller au téléphone, ce qui est pire qu'une donnée
 * imparfaite.
 */

const DELAI_FRAPPE = 300;

interface ChampAdresseProps {
  label?: string;
  /** Texte actuellement saisi. */
  valeur: string;
  onValeurChange: (v: string) => void;
  /** Appelé uniquement quand une suggestion est choisie. */
  onChoisir: (adresse: AdresseNormalisee) => void;
  /** Restreint le niveau : `municipality` pour une ville seule. */
  type?: TypeAdresse;
  placeholder?: string;
  desactive?: boolean;
  erreur?: string;
  id?: string;
  /** Appelé à la sortie du champ, pour les formulaires qui enregistrent au blur. */
  onBlur?: () => void;
}

export function ChampAdresse({
  label, valeur, onValeurChange, onChoisir, type,
  placeholder = 'Commencez à taper une adresse…',
  desactive, erreur, id, onBlur,
}: ChampAdresseProps) {
  const idGenere = useId();
  const idChamp = id ?? idGenere;
  const idListe = `${idChamp}-suggestions`;

  const [suggestions, setSuggestions] = useState<AdresseSuggestion[]>([]);
  const [ouvert, setOuvert] = useState(false);
  const [chargement, setChargement] = useState(false);
  const [surligne, setSurligne] = useState(-1);
  const [echec, setEchec] = useState<string | null>(null);

  const conteneur = useRef<HTMLDivElement>(null);
  // Ce que l'utilisateur vient de choisir : sans ca, la selection relance
  // aussitot une recherche sur le libelle insere.
  const dernierChoix = useRef<string | null>(null);

  useEffect(() => {
    if (desactive) return;
    if (dernierChoix.current === valeur) return;
    if (valeur.trim().length < 3) {
      setSuggestions([]);
      setOuvert(false);
      return;
    }

    const controleur = new AbortController();
    const minuteur = setTimeout(async () => {
      setChargement(true);
      setEchec(null);
      try {
        const res = await rechercherAdresse(valeur, { type, signal: controleur.signal });
        if (controleur.signal.aborted) return;
        setSuggestions(res);
        setOuvert(res.length > 0);
        setSurligne(-1);
      } catch (e) {
        if (!controleur.signal.aborted) {
          setEchec((e as Error).message);
          setSuggestions([]);
          setOuvert(false);
        }
      } finally {
        if (!controleur.signal.aborted) setChargement(false);
      }
    }, DELAI_FRAPPE);

    return () => {
      clearTimeout(minuteur);
      controleur.abort();
    };
  }, [valeur, type, desactive]);

  // Un clic hors du champ ferme la liste sans rien choisir.
  useEffect(() => {
    if (!ouvert) return;
    const auClic = (e: MouseEvent) => {
      if (!conteneur.current?.contains(e.target as Node)) setOuvert(false);
    };
    document.addEventListener('mousedown', auClic);
    return () => document.removeEventListener('mousedown', auClic);
  }, [ouvert]);

  const choisir = (s: AdresseSuggestion) => {
    dernierChoix.current = s.label;
    onValeurChange(s.label);
    onChoisir(normaliser(s));
    setOuvert(false);
    setSuggestions([]);
    setSurligne(-1);
  };

  const auClavier = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!ouvert || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSurligne((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSurligne((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === 'Enter' && surligne >= 0) {
      // Sans preventDefault, Entree soumettrait le formulaire au lieu de
      // valider la suggestion surlignee.
      e.preventDefault();
      choisir(suggestions[surligne]);
    } else if (e.key === 'Escape') {
      setOuvert(false);
      setSurligne(-1);
    }
  };

  return (
    <div className="space-y-1.5">
      {label && <Label htmlFor={idChamp}>{label}</Label>}

      <div ref={conteneur} className="relative">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            id={idChamp}
            value={valeur}
            disabled={desactive}
            placeholder={placeholder}
            autoComplete="off"
            role="combobox"
            aria-expanded={ouvert}
            aria-controls={ouvert ? idListe : undefined}
            aria-autocomplete="list"
            aria-invalid={!!erreur}
            className={cn('rounded-lg pl-8', chargement && 'pr-9')}
            onChange={(e) => onValeurChange(e.target.value)}
            onKeyDown={auClavier}
            onBlur={onBlur}
            onFocus={() => suggestions.length > 0 && setOuvert(true)}
          />
          {chargement && (
            <Loader2 className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>

        {ouvert && suggestions.length > 0 && (
          <ul
            id={idListe}
            role="listbox"
            className={cn(
              'absolute z-50 mt-1 max-h-64 w-full overflow-y-auto',
              'rounded-xl border border-border bg-popover shadow-md',
            )}
          >
            {suggestions.map((s, i) => (
              <li key={s.id} role="option" aria-selected={i === surligne}>
                <button
                  type="button"
                  // mousedown plutot que click : le blur du champ fermerait la
                  // liste avant que le click n'aboutisse.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choisir(s);
                  }}
                  onMouseEnter={() => setSurligne(i)}
                  className={cn(
                    'flex w-full items-start gap-2.5 px-3 py-2 text-left',
                    i === surligne ? 'bg-muted' : 'bg-transparent',
                  )}
                >
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-foreground">{s.label}</span>
                    {s.contexte && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {s.contexte}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {erreur && <p className="text-xs text-destructive">{erreur}</p>}

      {/* Un service d'adresses indisponible ne doit pas bloquer la saisie. */}
      {echec && !erreur && (
        <p className="text-xs text-muted-foreground">
          {echec} — vous pouvez saisir l'adresse à la main.
        </p>
      )}
    </div>
  );
}
