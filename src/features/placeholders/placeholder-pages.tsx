import { LayoutDashboard, FileText, Users, CalendarDays, ListChecks, Workflow, Megaphone, MessagesSquare, Receipt, Settings as SettingsIcon } from 'lucide-react';
import { ModulePlaceholder } from '@/components/ModulePlaceholder';
import { PageHeader } from '@/components/PageHeader';

export function TodayPage() {
  return (
    <>
      <PageHeader title="Aujourd'hui" description="Vue d'ensemble de la journée" />
      <ModulePlaceholder
        title="Tableau de bord"
        description="Vue d'ensemble des leads, rendez-vous et tâches du jour."
        icon={LayoutDashboard}
        developmentStatus="not_started"
        futureComponents={[
          "Statistiques du jour (leads, RDV, chiffre d'affaires)",
          'Liste des leads prioritaires',
          'Agenda du jour',
          'Tâches et relances en attente',
        ]}
      />
    </>
  );
}

export function CasesPage() {
  return (
    <>
      <PageHeader title="Dossiers" description="Dossiers de vitrage en cours" />
      <ModulePlaceholder
        title="Dossiers vitrage"
        description="Gestion complète des dossiers d'intervention vitrage."
        icon={FileText}
        developmentStatus="not_started"
        futureComponents={[
          'Liste des dossiers avec statuts',
          'Fiche détaillée du dossier',
          'Suivi des interventions',
          'Photos avant/après',
          'Historique des actions',
        ]}
      />
    </>
  );
}

export function ContactsPage() {
  return (
    <>
      <PageHeader title="Contacts" description="Carnet de contacts" />
      <ModulePlaceholder
        title="Carnet de contacts"
        description="Gestion des clients et prospects."
        icon={Users}
        developmentStatus="not_started"
        futureComponents={[
          'Liste des contacts avec recherche',
          'Fiche détaillée du contact',
          'Historique des interactions',
          'Déduplication automatique',
        ]}
      />
    </>
  );
}

export function CalendarPage() {
  return (
    <>
      <PageHeader title="Agenda" description="Planning et rendez-vous" />
      <ModulePlaceholder
        title="Agenda"
        description="Planification des rendez-vous et interventions."
        icon={CalendarDays}
        developmentStatus="not_started"
        futureComponents={[
          'Vue calendrier (jour, semaine, mois)',
          'Création de rendez-vous',
          'Gestion des disponibilités',
          'Notifications de rappel',
        ]}
      />
    </>
  );
}

export function FollowUpPage() {
  return (
    <>
      <PageHeader title="Suivi" description="Relances et suivis en attente" />
      <ModulePlaceholder
        title="Suivi des relances"
        description="Gestion des relances et suivis clients."
        icon={ListChecks}
        developmentStatus="not_started"
        futureComponents={[
          'Liste des relances prioritaires',
          'File d\'attente d\'appels',
          'Suivi des conversions',
          'Rappels automatiques',
        ]}
      />
    </>
  );
}

export function WorkflowsPage() {
  return (
    <>
      <PageHeader title="Scénarios" description="Automatisations" />
      <ModulePlaceholder
        title="Scénarios d'automatisation"
        description="Création et gestion des workflows automatisés."
        icon={Workflow}
        developmentStatus="not_started"
        futureComponents={[
          'Éditeur de scénarios visuel',
          'Déclencheurs (lead, statut, date)',
          'Actions (SMS, email, assignation)',
          'Conditions et branches',
        ]}
      />
    </>
  );
}

export function CampaignsPage() {
  return (
    <>
      <PageHeader title="Campagnes" description="Campagnes publicitaires" />
      <ModulePlaceholder
        title="Campagnes"
        description="Suivi des campagnes publicitaires Meta et autres."
        icon={Megaphone}
        developmentStatus="not_started"
        futureComponents={[
          'Vue d\'ensemble des campagnes',
          'Statistiques par campagne',
          'ROI et coût par lead',
          'Synchronisation Meta Ads',
        ]}
      />
    </>
  );
}

export function CommunicationsPage() {
  return (
    <>
      <PageHeader title="Communications" description="SMS, appels et emails" />
      <ModulePlaceholder
        title="Communications"
        description="Gestion des communications omnicanal."
        icon={MessagesSquare}
        developmentStatus="not_started"
        futureComponents={[
          'Messagerie SMS',
          'Journal d\'appels',
          'Emails transactionnels',
          'Modèles de messages',
        ]}
      />
    </>
  );
}

export function BillingPage() {
  return (
    <>
      <PageHeader title="Facturation" description="Factures et paiements" />
      <ModulePlaceholder
        title="Facturation"
        description="Gestion des factures et paiements."
        icon={Receipt}
        developmentStatus="not_started"
        futureComponents={[
          'Liste des factures',
          'Création de facture',
          'Suivi des paiements',
          'Export comptable',
        ]}
      />
    </>
  );
}

export function SettingsPage() {
  return (
    <>
      <PageHeader title="Réglages" description="Configuration du CRM" />
      <ModulePlaceholder
        title="Paramètres généraux"
        description="Configuration générale de l'espace de travail."
        icon={SettingsIcon}
        developmentStatus="not_started"
        futureComponents={[
          'Informations de l\'entreprise',
          'Préférences d\'affichage',
          'Zones d\'intervention',
          'Horaires d\'ouverture',
        ]}
      />
    </>
  );
}

export function UsersPage() {
  return (
    <>
      <PageHeader title="Utilisateurs" description="Gestion de l'équipe" />
      <ModulePlaceholder
        title="Gestion des utilisateurs"
        description="Invitation et gestion des membres de l'équipe."
        icon={Users}
        developmentStatus="not_started"
        futureComponents={[
          'Liste des utilisateurs',
          'Invitation par e-mail',
          'Gestion des rôles',
          'Permissions par module',
        ]}
      />
    </>
  );
}
