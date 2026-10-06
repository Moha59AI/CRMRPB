import { ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

const LOGOS_ASSUREURS = [
  { termes: ['axa'], src: '/insurers/axa.svg' },
  { termes: ['maif'], src: '/insurers/maif.svg' },
  { termes: ['direct assurance', 'avanssur'], src: '/insurers/direct-assurance.jpg' },
  { termes: ['generali'], src: '/insurers/generali.jpg' },
  { termes: ['gmf'], src: '/insurers/gmf.png' },
  { termes: ['maaf'], src: '/insurers/maaf.png' },
  { termes: ['macif'], src: '/insurers/macif.png' },
] as const;

function normaliserNom(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function trouverLogoAssureur(nom: string | null | undefined): string | null {
  const normalise = normaliserNom(nom ?? '');
  if (!normalise) return null;
  const recherche = ` ${normalise} `;

  return LOGOS_ASSUREURS.find(({ termes }) => (
    termes.some((terme) => recherche.includes(` ${terme} `))
  ))?.src ?? null;
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

  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-white',
        taille === 'sm' ? 'h-8 w-8' : 'h-10 w-10',
        className,
      )}
      aria-hidden="true"
    >
      {src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-contain p-1"
        />
      ) : (
        <ShieldCheck className="h-4 w-4 text-muted-foreground" />
      )}
    </span>
  );
}
