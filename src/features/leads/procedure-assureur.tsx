import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ShieldCheck, PhoneCall, UserCheck, ClipboardCheck, CalendarClock,
  Send, AlertTriangle, Mail, ChevronDown,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { trouverAssureur } from '@/services/insurers-service';

/**
 * Marche à suivre de l'assureur, affichée pendant l'appel.
 *
 * Ces 51 procédures viennent du module vitrage de l'ancien Perfex. Elles
 * vivaient dans un fichier que personne ne consultait au téléphone — donc
 * elles se redemandaient à un collègue, ou se devinaient.
 *
 * Deux informations sont mises en avant parce qu'elles décident du rendez-vous
 * avant de décider du dossier :
 *
 * - **L'expertise obligatoire** immobilise le véhicule à la journée, avec un
 *   créneau à 8h30. Proposer deux heures en fin d'après-midi oblige à
 *   rappeler pour tout reprendre.
 * - **La présence du client** conditionne l'obtention du numéro de sinistre.
 *   S'en apercevoir le jour même fait reporter l'intervention.
 *
 * Le reste suit le déroulé réel : avant, le jour, après.
 */

interface ProcedureAssureurProps {
  /** Texte libre saisi dans la fiche : « axa », « credit mutuel », « direct assurance ». */
  nomSaisi: string | null;
}

export function ProcedureAssureur({ nomSaisi }: ProcedureAssureurProps) {
  const terme = (nomSaisi ?? '').trim();

  const { data: assureur, isLoading } = useQuery({
    queryKey: ['assureur-procedure', terme.toLowerCase()],
    queryFn: () => trouverAssureur(terme),
    enabled: terme.length >= 2,
    // La procedure d'un assureur ne change pas d'un appel a l'autre.
    staleTime: 10 * 60_000,
  });

  // Depliee d'office quand l'expertise est obligatoire : c'est elle qui
  // decide du creneau, la replier reviendrait a la cacher au moment ou elle
  // compte.
  const [deplieManuel, setDeplieManuel] = useState<boolean | null>(null);
  const deplie = deplieManuel ?? (assureur?.expertise_obligatoire ?? false);
  const setDeplie = (f: (d: boolean) => boolean) => setDeplieManuel(f(deplie));

  if (terme.length < 2 || isLoading) return null;

  if (!assureur) {
    return (
      <p className="text-xs text-muted-foreground">
        Aucune procédure connue pour « {terme} ». Vous pouvez l'ajouter dans
        Réglages → Assureurs.
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-muted/20">
      <button
        type="button"
        onClick={() => setDeplie((d) => !d)}
        aria-expanded={deplie}
        className="flex w-full flex-wrap items-center gap-2 p-3 text-left"
      >
        <ShieldCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="text-sm font-semibold text-foreground">{assureur.name}</span>

        {assureur.expertise_obligatoire && (
          <Badge className="rounded-full border-transparent bg-due-soft text-[10px] text-due hover:bg-due-soft">
            Expertise obligatoire
          </Badge>
        )}
        {assureur.client_present && (
          <Badge variant="outline" className="rounded-full text-[10px] font-normal">
            <UserCheck className="mr-1 h-3 w-3" />
            Client requis
          </Badge>
        )}
        {!deplie && assureur.franchise_texte && (
          <span className="truncate text-xs text-muted-foreground">
            {assureur.franchise_texte}
          </span>
        )}

        <ChevronDown
          className={cn(
            'ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform',
            deplie && 'rotate-180',
          )}
        />
      </button>

      {deplie && (
      <div className="space-y-3 px-3 pb-3">

      {/* Ce qui change le creneau qu'on propose, donc affiche avant le reste. */}
      {assureur.expertise_obligatoire && (
        <div className="flex items-start gap-2 rounded-lg bg-due-soft px-2.5 py-2">
          <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-due" />
          <p className="text-xs leading-snug text-due">
            <span className="font-medium">Véhicule immobilisé à la journée.</span>{' '}
            Prévoir un rendez-vous à 8h30, pas un créneau court.
          </p>
        </div>
      )}

      {assureur.franchise_texte && (
        <Ligne icone={<AlertTriangle className="h-3.5 w-3.5" />} titre="Franchise">
          {assureur.franchise_texte}
        </Ligne>
      )}

      {(assureur.claims_phone || assureur.phone) && (
        <Ligne icone={<PhoneCall className="h-3.5 w-3.5" />} titre="Sinistre">
          <a
            href={`tel:${(assureur.claims_phone ?? assureur.phone ?? '').replace(/[^\d+]/g, '')}`}
            className="text-primary tabular hover:underline"
          >
            {assureur.claims_phone ?? assureur.phone}
          </a>
        </Ligne>
      )}

      {assureur.avant_rdv && (
        <Ligne icone={<ClipboardCheck className="h-3.5 w-3.5" />} titre="Avant le RDV">
          {assureur.avant_rdv}
        </Ligne>
      )}

      {assureur.jour_rdv && (
        <Ligne icone={<CalendarClock className="h-3.5 w-3.5" />} titre="Le jour du RDV">
          {assureur.jour_rdv}
        </Ligne>
      )}

      {assureur.apres_rdv && (
        <Ligne icone={<Send className="h-3.5 w-3.5" />} titre="Après">
          {assureur.apres_rdv}
        </Ligne>
      )}

      {assureur.claims_email && (
        <Ligne icone={<Mail className="h-3.5 w-3.5" />} titre="Envoi facture">
          <span className="break-all">{assureur.claims_email}</span>
        </Ligne>
      )}
      </div>
      )}
    </div>
  );
}

function Ligne({
  icone, titre, children,
}: { icone: React.ReactNode; titre: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className={cn('mt-0.5 shrink-0 text-muted-foreground')}>{icone}</span>
      <p className="min-w-0 text-xs leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">{titre} — </span>
        {children}
      </p>
    </div>
  );
}
