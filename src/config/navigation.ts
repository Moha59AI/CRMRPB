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
  Webhook,
  LayoutDashboard,
  ChartNoAxesCombined,
  DatabaseZap,
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
        label: 'Marketing',
        path: '/marketing',
        icon: ChartNoAxesCombined,
        description: "Du clic publicitaire à l'intervention",
      },
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

/**
 * Les quatre écrans de la barre du bas, sur téléphone.
 *
 * Ce sont ceux d'une journée de travail : ce qu'il y a à faire, qui rappeler,
 * quoi traiter, et quand on passe. Le reste — marketing, facturation,
 * réglages — se consulte assis, et reste dans le tiroir.
 *
 * Quatre, plus « Menu ». À cinq entrées sur un écran de 375 px, chaque cible
 * fait encore 75 px de large ; à six, les intitulés se coupent.
 */
export const cheminsPouce: string[] = ['/today', '/relances', '/leads', '/calendar'];

/**
 * Reglages, groupes par nature.
 *
 * Sept entrees a plat ne se lisent pas : on cherche « Assureurs » parmi
 * « Webhooks » et « Meta Ads », qui n'ont rien a voir. Les sections separent
 * ce qui decrit l'atelier, ce qui regle le metier, et ce qui branche
 * l'exterieur.
 */
export const settingsNavSections: NavSection[] = [
  {
    titre: 'Espace de travail',
    items: [
      {
        label: 'Général',
        path: '/settings',
        icon: Settings,
        description: "Coordonnées, horaires, zones d'intervention",
      },
      {
        label: 'Utilisateurs',
        path: '/settings/users',
        icon: Users,
        description: 'Inviter, changer un rôle, retirer un accès',
      },
    ],
  },
  {
    titre: 'Métier',
    items: [
      {
        label: 'Assureurs',
        path: '/settings/insurers',
        icon: Shield,
        description: 'Franchises, conventions et procédures sinistre',
      },
      {
        label: 'Cadences de relance',
        path: '/settings/relances',
        icon: BellRing,
        description: 'Quand un lead revient dans la file, et quand il en sort',
      },
    ],
  },
  {
    titre: 'Connexions',
    items: [
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
        label: 'Google Ads',
        path: '/settings/integrations/google',
        icon: ChartNoAxesCombined,
        description: 'Compte publicitaire, coûts et attribution des clics',
      },
      {
        label: 'Onify',
        path: '/settings/integrations/onify',
        icon: DatabaseZap,
        description: 'Import en lecture seule vers le nouveau CRM',
      },
      {
        label: 'Webhooks',
        path: '/settings/webhooks',
        icon: Webhook,
        description: 'Endpoints entrants',
      },
    ],
  },
];

/** Liste a plat, pour les usages qui ne s'interessent pas aux sections. */
export const settingsNavItems: NavItem[] = settingsNavSections.flatMap((s) => s.items);
