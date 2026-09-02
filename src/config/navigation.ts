import {
  BellRing,
  CalendarDays,
  Users,
  TrendingUp,
  Workflow,
  Megaphone,
  MessagesSquare,
  Receipt,
  Settings,
  Shield,
  LayoutDashboard,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  description: string;
}

export interface NavSection {
  titre: string;
  items: NavItem[];
}

/**
 * Navigation organisée par moment de la journée, pas par type d'objet.
 *
 * Le vocabulaire suit le métier : un **client** est une personne, un **lead**
 * est une intervention. Un client peut donc en avoir plusieurs — d'où
 * « Clients » et non « Contacts », qui laissait croire à un simple carnet
 * d'adresses sans lien avec les affaires.
 *
 * Deux notions seulement : un **client** est une personne, un **lead** est une
 * intervention. Un client peut en avoir plusieurs. « Dossiers » a donc
 * disparu du menu — un dossier n'est rien d'autre qu'une intervention, et
 * deux mots pour la même chose obligeaient a choisir a chaque fois.
 *
 * « Suivi » et « Dossiers » restent accessibles par leur route le temps de
 * verifier que rien ne s'y perd.
 */
export const navSections: NavSection[] = [
  {
    titre: 'Quotidien',
    items: [
      {
        label: "Aujourd'hui",
        path: '/today',
        icon: LayoutDashboard,
        description: "Vue d'ensemble de la journée",
      },
      {
        label: 'Relances',
        path: '/relances',
        icon: BellRing,
        description: 'Ce qui attend une action',
      },
    ],
  },
  {
    titre: 'Commercial',
    items: [
      {
        label: 'Leads',
        path: '/leads',
        icon: TrendingUp,
        description: 'Les interventions à traiter',
      },
      {
        label: 'Clients',
        path: '/contacts',
        icon: Users,
        description: 'Les personnes et leur historique',
      },
    ],
  },
  {
    titre: 'Organisation',
    items: [
      {
        label: 'Agenda',
        path: '/calendar',
        icon: CalendarDays,
        description: 'Rendez-vous et interventions',
      },
    ],
  },
  {
    titre: 'Acquisition',
    items: [
      {
        label: 'Campagnes',
        path: '/campaigns',
        icon: Megaphone,
        description: 'Campagnes publicitaires',
      },
      {
        label: 'Communications',
        path: '/communications',
        icon: MessagesSquare,
        description: 'SMS, appels et emails',
      },
      {
        label: 'Scénarios',
        path: '/workflows',
        icon: Workflow,
        description: 'Automatisations',
      },
    ],
  },
  {
    titre: 'Gestion',
    items: [
      {
        label: 'Facturation',
        path: '/billing',
        icon: Receipt,
        description: 'Devis, factures et paiements',
      },
      {
        label: 'Réglages',
        path: '/settings',
        icon: Settings,
        description: 'Configuration du CRM',
      },
    ],
  },
];

/** Liste à plat, pour les usages qui ne s'intéressent pas aux sections. */
export const navItems: NavItem[] = navSections.flatMap((s) => s.items);

export const settingsNavItems: NavItem[] = [
  {
    label: 'Général',
    path: '/settings',
    icon: Settings,
    description: 'Paramètres généraux',
  },
  {
    label: 'Intégrations',
    path: '/settings/integrations',
    icon: Workflow,
    description: 'Connexions externes',
  },
  {
    label: 'Meta Ads',
    path: '/settings/integrations/meta',
    icon: Megaphone,
    description: 'Meta Lead Ads et Conversions API',
  },
  {
    label: 'Webhooks',
    path: '/settings/webhooks',
    icon: Workflow,
    description: 'Endpoints entrants',
  },
  {
    label: 'Cadences de relance',
    path: '/settings/relances',
    icon: BellRing,
    description: 'Quand un lead revient dans la file',
  },
  {
    label: 'Assureurs',
    path: '/settings/insurers',
    icon: Shield,
    description: 'Franchises, conventions et lignes sinistre',
  },
  {
    label: 'Utilisateurs',
    path: '/settings/users',
    icon: Users,
    description: 'Gestion des accès',
  },
];
