import { lazy, Suspense, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ProtectedRoute } from '@/features/auth/protected-route';
import { AppLayout } from '@/layouts/app-layout';
import type { EtatOuvertureDossier } from '@/features/dossier/dossier-constants';

/**
 * Chaque page est chargee seulement lorsqu'elle devient utile.
 *
 * L'ancien routeur importait tous les modules au demarrage : graphiques de
 * Finance et Marketing, carte Leaflet, editeur de workflows et reglages se
 * retrouvaient dans le premier fichier JavaScript, y compris pour consulter
 * simplement les Leads. Garder le decoupage au niveau des fonctionnalites
 * rend aussi les dependances de chaque ecran beaucoup plus lisibles.
 */
const LoginPage = lazy(() => import('@/features/auth/login-page').then((m) => ({ default: m.LoginPage })));
const ForgotPasswordPage = lazy(() => import('@/features/auth/forgot-password-page').then((m) => ({ default: m.ForgotPasswordPage })));
const UpdatePasswordPage = lazy(() => import('@/features/auth/update-password-page').then((m) => ({ default: m.UpdatePasswordPage })));
const TodayPage = lazy(() => import('@/features/today/today-page').then((m) => ({ default: m.TodayPage })));
const LeadsPage = lazy(() => import('@/features/leads/leads-page').then((m) => ({ default: m.LeadsPage })));
const RelancesPage = lazy(() => import('@/features/relances/relances-page').then((m) => ({ default: m.RelancesPage })));
const DossierModal = lazy(() => import('@/features/dossier/dossier-modal').then((m) => ({ default: m.DossierModal })));
const ClientModal = lazy(() => import('@/features/client/client-modal').then((m) => ({ default: m.ClientModal })));
const CasesPage = lazy(() => import('@/features/cases/cases-page').then((m) => ({ default: m.CasesPage })));
const ContactsPage = lazy(() => import('@/features/contacts/contacts-page').then((m) => ({ default: m.ContactsPage })));
const CalendarPage = lazy(() => import('@/features/calendar/calendar-page').then((m) => ({ default: m.CalendarPage })));
const FollowUpPage = lazy(() => import('@/features/follow-up/follow-up-page').then((m) => ({ default: m.FollowUpPage })));
const WorkflowsPage = lazy(() => import('@/features/workflows/workflows-page').then((m) => ({ default: m.WorkflowsPage })));
const MarketingPage = lazy(() => import('@/features/marketing/marketing-page').then((m) => ({ default: m.MarketingPage })));
const CampaignsPage = lazy(() => import('@/features/campaigns/campaigns-page').then((m) => ({ default: m.CampaignsPage })));
const CommunicationsPage = lazy(() => import('@/features/communications/communications-page').then((m) => ({ default: m.CommunicationsPage })));
const EmailInboxPage = lazy(() => import('@/features/integrations/email/email-inbox-page').then((m) => ({ default: m.EmailInboxPage })));
const BillingPage = lazy(() => import('@/features/billing/billing-page').then((m) => ({ default: m.BillingPage })));
const FinancialDashboardPage = lazy(() => import('@/features/finance/financial-dashboard-page').then((m) => ({ default: m.FinancialDashboardPage })));
const SupplierExpensesPage = lazy(() => import('@/features/finance/supplier-expenses-page').then((m) => ({ default: m.SupplierExpensesPage })));
const FinancialConnectionsPage = lazy(() => import('@/features/finance/financial-connections-page').then((m) => ({ default: m.FinancialConnectionsPage })));
const SupplierRedactionPage = lazy(() => import('@/features/supplier-redaction/supplier-redaction-page').then((m) => ({ default: m.SupplierRedactionPage })));
const SettingsLayout = lazy(() => import('@/features/settings/settings-layout').then((m) => ({ default: m.SettingsLayout })));
const SettingsPage = lazy(() => import('@/features/settings/settings-page').then((m) => ({ default: m.SettingsPage })));
const IntegrationsListPage = lazy(() => import('@/features/integrations/integrations-list-page').then((m) => ({ default: m.IntegrationsListPage })));
const MetaSettingsPage = lazy(() => import('@/features/integrations/meta/meta-settings-page').then((m) => ({ default: m.MetaSettingsPage })));
const GoogleAdsSettingsPage = lazy(() => import('@/features/integrations/google/google-ads-settings-page').then((m) => ({ default: m.GoogleAdsSettingsPage })));
const OnifySettingsPage = lazy(() => import('@/features/integrations/onify/onify-settings-page').then((m) => ({ default: m.OnifySettingsPage })));
const EmailSettingsPage = lazy(() => import('@/features/integrations/email/email-settings-page').then((m) => ({ default: m.EmailSettingsPage })));
const AiSettingsPage = lazy(() => import('@/features/ai/ai-settings-page').then((m) => ({ default: m.AiSettingsPage })));
const WebhooksPage = lazy(() => import('@/features/webhooks/webhooks-page').then((m) => ({ default: m.WebhooksPage })));
const UsersPage = lazy(() => import('@/features/settings/users-page').then((m) => ({ default: m.UsersPage })));
const InsurersPage = lazy(() => import('@/features/settings/insurers-page').then((m) => ({ default: m.InsurersPage })));
const CadencesPage = lazy(() => import('@/features/settings/cadences-page').then((m) => ({ default: m.CadencesPage })));
const LeadColorsPage = lazy(() => import('@/features/settings/lead-colors-page').then((m) => ({ default: m.LeadColorsPage })));
const ClientDocumentsPage = lazy(() => import('@/features/client-documents/client-documents-page').then((m) => ({ default: m.ClientDocumentsPage })));
const ClientDocumentSettingsPage = lazy(() => import('@/features/client-documents/client-document-settings-page').then((m) => ({ default: m.ClientDocumentSettingsPage })));
const BancListe = lazy(() => import('@/features/diag/banc-fiche').then((m) => ({ default: m.BancListe })));
const BancFiche = lazy(() => import('@/features/diag/banc-fiche').then((m) => ({ default: m.BancFiche })));
const ApercuAccueil = lazy(() => import('@/features/diag/apercu-accueil').then((m) => ({ default: m.ApercuAccueil })));
const ApercuLeads = lazy(() => import('@/features/diag/apercu-leads').then((m) => ({ default: m.ApercuLeads })));
const InterventionsPage = lazy(() => import('@/features/interventions/interventions-page').then((m) => ({ default: m.InterventionsPage })));
const ApercuMail = lazy(() => import('@/features/diag/apercu-mail').then((m) => ({ default: m.ApercuMail })));
const ApercuAgenda = lazy(() => import('@/features/diag/apercu-agenda').then((m) => ({ default: m.ApercuAgenda })));
const ApercuInterventions = lazy(() => import('@/features/diag/apercu-interventions').then((m) => ({ default: m.ApercuInterventions })));

function ChargementPage({ superposee = false }: { superposee?: boolean }) {
  return (
    <div
      className={superposee
        ? 'fixed inset-0 z-[60] flex items-center justify-center bg-foreground/20 backdrop-blur-[1px]'
        : 'flex min-h-40 flex-1 items-center justify-center'}
      role="status"
      aria-label="Chargement de la page"
    >
      <div className="flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm text-muted-foreground shadow-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Chargement…
      </div>
    </div>
  );
}

function charger(element: ReactNode, superposee = false) {
  return <Suspense fallback={<ChargementPage superposee={superposee} />}>{element}</Suspense>;
}

/**
 * Routage avec location d'arriere-plan.
 *
 * Quand une fiche est ouverte depuis une liste, la page d'origine reste
 * montee derriere elle. Les filtres, la recherche, le scroll et la selection
 * survivent donc a l'ouverture du dossier.
 */
export function AppRoutes() {
  const location = useLocation();
  const background = (location.state as EtatOuvertureDossier | null)?.background;

  return (
    <>
      <Routes location={background ?? location}>
        <Route path="/login" element={charger(<LoginPage />)} />
        <Route path="/signup" element={<Navigate to="/login" replace />} />
        <Route path="/forgot-password" element={charger(<ForgotPasswordPage />)} />
        <Route path="/update-password" element={charger(<UpdatePasswordPage />)} />
        <Route path="/documents" element={charger(<ClientDocumentsPage />)} />
        <Route path="/d/:token" element={charger(<ClientDocumentsPage />)} />

        {/* Le banc de diagnostic ne doit jamais devenir une page publique du
            CRM de production. */}
        {import.meta.env.DEV && (
          <>
            <Route path="/diag-fiche" element={charger(<BancListe />)} />
            <Route path="/apercu-accueil" element={charger(<ApercuAccueil />)} />
            <Route path="/apercu-leads" element={charger(<ApercuLeads />)} />
            <Route path="/apercu-mail" element={charger(<ApercuMail />)} />
            <Route path="/apercu-agenda" element={charger(<ApercuAgenda />)} />
            <Route path="/apercu-interventions" element={charger(<ApercuInterventions />)} />
            <Route path="/diag-fiche/:id" element={charger(<BancFiche pleinePage />)} />
          </>
        )}

        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/today" element={charger(<TodayPage />)} />
          <Route path="/leads" element={charger(<LeadsPage />)} />
          <Route path="/relances" element={charger(<RelancesPage />)} />
          <Route path="/interventions" element={charger(<InterventionsPage />)} />
          <Route path="/interventions/:leadId" element={charger(<DossierModal pleinePage />)} />
          <Route path="/clients/:contactId" element={charger(<ClientModal pleinePage />)} />
          <Route path="/cases" element={charger(<CasesPage />)} />
          <Route path="/contacts" element={charger(<ContactsPage />)} />
          <Route path="/calendar" element={charger(<CalendarPage />)} />
          <Route path="/follow-up" element={charger(<FollowUpPage />)} />
          <Route path="/workflows" element={charger(<WorkflowsPage />)} />
          <Route path="/marketing" element={charger(<MarketingPage />)} />
          <Route path="/campaigns" element={charger(<CampaignsPage />)} />
          <Route path="/communications" element={charger(<CommunicationsPage />)} />
          <Route path="/emails" element={charger(<EmailInboxPage />)} />
          <Route path="/billing" element={charger(<BillingPage />)} />
          <Route path="/finance" element={charger(<FinancialDashboardPage />)} />
          <Route path="/finance/fournisseurs" element={charger(<SupplierExpensesPage />)} />
          <Route path="/finance/rapprochement" element={charger(<FinancialConnectionsPage />)} />
          <Route path="/outils/masquer-prix" element={charger(<SupplierRedactionPage />)} />

          <Route path="/settings" element={charger(<SettingsLayout />)}>
            <Route index element={charger(<SettingsPage />)} />
            <Route path="integrations" element={charger(<IntegrationsListPage />)} />
            <Route path="integrations/meta" element={charger(<MetaSettingsPage />)} />
            <Route path="integrations/google" element={charger(<GoogleAdsSettingsPage />)} />
            <Route path="integrations/onify" element={charger(<OnifySettingsPage />)} />
            <Route path="integrations/email" element={charger(<EmailSettingsPage />)} />
            <Route path="integrations/ai" element={charger(<AiSettingsPage />)} />
            <Route path="webhooks" element={charger(<WebhooksPage />)} />
            <Route path="users" element={charger(<UsersPage />)} />
            <Route path="insurers" element={charger(<InsurersPage />)} />
            <Route path="relances" element={charger(<CadencesPage />)} />
            <Route path="couleurs-leads" element={charger(<LeadColorsPage />)} />
            <Route path="documents" element={charger(<ClientDocumentSettingsPage />)} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/today" replace />} />
      </Routes>

      {background && (
        <Routes>
          <Route path="/interventions/:leadId" element={charger(<DossierModal />, true)} />
          <Route path="/clients/:contactId" element={charger(<ClientModal />, true)} />
          {import.meta.env.DEV && (
            <Route path="/diag-fiche/:id" element={charger(<BancFiche />, true)} />
          )}
        </Routes>
      )}
    </>
  );
}
