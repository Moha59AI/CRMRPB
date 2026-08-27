import {
  CalendarDays,
  CalendarClock,
  FileText,
  Users,
  TrendingUp,
  ListChecks,
  Workflow,
  Megaphone,
  MessagesSquare,
  Receipt,
  Settings,
  LayoutDashboard,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  description: string;
}

export const navItems: NavItem[] = [
  {
    label: "Aujourd'hui",
    path: '/today',
    icon: LayoutDashboard,
    description: "Vue d'ensemble de la journée",
  },
  {
    label: 'Leads',
    path: '/leads',
    icon: TrendingUp,
    description: 'Gestion des prospects',
  },
  {
    label: 'Dossiers',
    path: '/cases',
    icon: FileText,
    description: 'Dossiers de vitrage',
  },
  {
    label: 'Contacts',
    path: '/contacts',
    icon: Users,
    description: 'Carnet de contacts',
  },
  {
    label: 'Agenda',
    path: '/calendar',
    icon: CalendarDays,
    description: 'Planning et rendez-vous',
  },
  {
    label: 'Suivi',
    path: '/follow-up',
    icon: ListChecks,
    description: 'Relances et suivis',
  },
  {
    label: 'Scénarios',
    path: '/workflows',
    icon: Workflow,
    description: 'Automatisations',
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
    label: 'Facturation',
    path: '/billing',
    icon: Receipt,
    description: 'Factures et paiements',
  },
  {
    label: 'Réglages',
    path: '/settings',
    icon: Settings,
    description: 'Configuration du CRM',
  },
];

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
    description: 'Configuration Meta Lead Ads',
  },
  {
    label: 'Webhooks',
    path: '/settings/webhooks',
    icon: MessagesSquare,
    description: 'Webhooks entrants et sortants',
  },
  {
    label: 'Utilisateurs',
    path: '/settings/users',
    icon: Users,
    description: "Gestion de l'équipe",
  },
];
