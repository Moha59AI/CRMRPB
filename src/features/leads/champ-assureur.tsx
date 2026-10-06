import { useEffect, useId, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Check, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LogoAssureur } from '@/features/insurers/insurer-logo';
import { cn } from '@/lib/utils';
import { fetchInsurers } from '@/services/insurers-service';
import type { Insurer } from '@/types';

/**
 * Choix de l'assureur.
 *
 * Une liste déroulante fermée serait fausse : les 51 compagnies du référentiel
 * ne couvrent pas tout, et un conseiller au téléphone ne peut pas s'arrêter
 * parce qu'un courtier régional manque. Le champ reste donc une saisie libre,
 * assistée d'une liste.
 *
 * Choisir dans la liste écrit le nom canonique, ce qui fait correspondre la
 * procédure à coup sûr. Taper autre chose enregistre le texte tel quel, et
 * l'appariement approximatif s'en débrouille — ou n'affiche rien.
 *
 * Les 51 compagnies sont chargées d'un bloc : le référentiel est petit et
 * consulté à chaque fiche, contrairement aux communes.
 */

interface ChampAssureurProps {
  valeur: string | null;
  onChange: (v: string | null) => void;
  desactive?: boolean;
  id?: string;
}

function correspond(assureur: Insurer, terme: string): boolean {
  const t = terme.toLowerCase();
  if (assureur.name.toLowerCase().includes(t)) return true;
  return assureur.tags.some((tag) => tag.toLowerCase().includes(t));
}

export function ChampAssureur({ valeur, onChange, desactive, id }: ChampAssureurProps) {
  const idGenere = useId();
  const idChamp = id ?? idGenere;
  const idListe = `${idChamp}-liste`;

  const [saisie, setSaisie] = useState(valeur ?? '');
  const [ouvert, setOuvert] = useState(false);
  const [surligne, setSurligne] = useState(-1);
  const conteneur = useRef<HTMLDivElement>(null);

  const { data: assureurs } = useQuery({
    queryKey: ['assureurs-liste'],
    queryFn: () => fetchInsurers(),
    // Le referentiel ne bouge pas d'un appel a l'autre.
    staleTime: 10 * 60_000,
  });

  // La fiche change quand on passe au lead suivant.
  useEffect(() => setSaisie(valeur ?? ''), [valeur]);

  useEffect(() => {
    if (!ouvert) return;
    const auClic = (e: MouseEvent) => {
      if (!conteneur.current?.contains(e.target as Node)) setOuvert(false);
    };
    document.addEventListener('mousedown', auClic);
    return () => document.removeEventListener('mousedown', auClic);
  }, [ouvert]);

  const terme = saisie.trim();
  const propositions = (assureurs ?? [])
    .filter((a) => terme === '' || correspond(a, terme))
    .slice(0, 8);

  const choisir = (a: Insurer) => {
    setSaisie(a.name);
    onChange(a.name);
    setOuvert(false);
    setSurligne(-1);
  };

  const auClavier = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!ouvert && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setOuvert(true);
      return;
    }
    if (!ouvert || propositions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSurligne((i) => (i + 1) % propositions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSurligne((i) => (i <= 0 ? propositions.length - 1 : i - 1));
    } else if (e.key === 'Enter' && surligne >= 0) {
      e.preventDefault();
      choisir(propositions[surligne]);
    } else if (e.key === 'Escape') {
      setOuvert(false);
      setSurligne(-1);
    }
  };

  return (
    <div className="space-y-1.5">
      <Label htmlFor={idChamp}>Assureur</Label>

      <div ref={conteneur} className="relative">
        <Input
          id={idChamp}
          value={saisie}
          disabled={desactive}
          placeholder="Rechercher ou saisir"
          autoComplete="off"
          role="combobox"
          aria-expanded={ouvert}
          aria-controls={ouvert ? idListe : undefined}
          aria-autocomplete="list"
          className="rounded-lg pr-8"
          onChange={(e) => {
            setSaisie(e.target.value);
            onChange(e.target.value.trim() || null);
            setOuvert(true);
            setSurligne(-1);
          }}
          onFocus={() => setOuvert(true)}
          onKeyDown={auClavier}
        />

        <button
          type="button"
          tabIndex={-1}
          disabled={desactive}
          aria-label="Voir les assureurs"
          onMouseDown={(e) => { e.preventDefault(); setOuvert((o) => !o); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground disabled:opacity-40"
        >
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', ouvert && 'rotate-180')} />
        </button>

        {ouvert && propositions.length > 0 && (
          <ul
            id={idListe}
            role="listbox"
            className={cn(
              'absolute z-50 mt-1 max-h-64 w-full overflow-y-auto',
              'rounded-xl border border-border bg-popover shadow-md',
            )}
          >
            {propositions.map((a, i) => (
              <li key={a.id} role="option" aria-selected={i === surligne}>
                <button
                  type="button"
                  // mousedown : le blur du champ fermerait la liste avant que
                  // le click n'aboutisse.
                  onMouseDown={(e) => { e.preventDefault(); choisir(a); }}
                  onMouseEnter={() => setSurligne(i)}
                  className={cn(
                    'flex w-full items-start gap-2 px-3 py-2 text-left',
                    i === surligne ? 'bg-muted' : 'bg-transparent',
                  )}
                >
                  <LogoAssureur nom={a.name} taille="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-foreground">{a.name}</span>
                    {a.franchise_texte && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {a.franchise_texte}
                      </span>
                    )}
                  </span>

                  {/* Le drapeau qui change le creneau propose se voit des la
                      liste, pas seulement une fois le choix fait. */}
                  {a.expertise_obligatoire && (
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-due" />
                  )}
                  {a.name === valeur && (
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        {ouvert && terme !== '' && propositions.length === 0 && (
          <div className="absolute z-50 mt-1 w-full rounded-xl border border-border bg-popover px-3 py-2 shadow-md">
            <p className="text-xs text-muted-foreground">
              Aucune compagnie connue sous ce nom — la saisie est conservée.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
