import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Les noms du referentiel metier sont parfois plus longs que la marque
 * affichee sur le logo. Les alias sont testes avant le nom direct afin que
 * « Avanssur / Direct Assurance / BNP » retrouve bien Direct Assurance.
 */
const ALIASES_LOGOS = [
  { termes: ['avanssur', 'direct assurance', 'directassurance'], id: 'direct-assurance' },
  { termes: ['constatel', 'acm', 'credit mutuel'], id: 'assurances-du-credit-mutuel' },
  { termes: ['bpce'], id: 'bpce-assurances' },
  { termes: ['pacifica'], id: 'credit-agricole-assurances' },
  { termes: ['gan'], id: 'gan-assurances' },
  { termes: ['sma btp'], id: 'smabtp' },
  { termes: ['swisslife'], id: 'swiss-life' },
  { termes: ['l olivier'], id: 'l-olivier-assurance' },
  { termes: ['aviva'], id: 'abeille-assurances' },
] as const;

function normaliserNom(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Les 235 fichiers suivent la meme convention que cette fonction. Un nom de
 * marque exact trouve donc son image sans devoir embarquer un index volumineux
 * dans le JavaScript du CRM.
 */
export function trouverLogoAssureur(nom: string | null | undefined): string | null {
  const normalise = normaliserNom(nom ?? '');
  if (!normalise) return null;
  const recherche = ` ${normalise} `;

  const alias = ALIASES_LOGOS.find(({ termes }) => (
    termes.some((terme) => recherche.includes(` ${terme} `))
  ));
  const id = alias?.id ?? normalise.replace(/\s+/g, '-');

  return `/insurers/${id}.png`;
}

export function LogoAssureur({
  nom,
  taille = 'md',
  className,
}: {
  nom: string | null | undefined;
  taille?: 'sm' | 'md';
  className?: string;
}) {
  const src = trouverLogoAssureur(nom);
  const [srcInvalide, setSrcInvalide] = useState<string | null>(null);
  const afficherLogo = src !== null && src !== srcInvalide;

  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-white',
        taille === 'sm' ? 'h-8 w-8' : 'h-10 w-10',
        className,
      )}
      aria-hidden="true"
    >
      {afficherLogo ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-contain p-1"
          onError={() => setSrcInvalide(src)}
        />
      ) : (
        <ShieldCheck className="h-4 w-4 text-muted-foreground" />
      )}
    </span>
  );
}
