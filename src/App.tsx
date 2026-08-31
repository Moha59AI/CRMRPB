import './App.css';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider } from '@/features/auth/auth-context';
import { QueryProvider } from '@/app/query-provider';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ThemeProvider } from 'next-themes';
import { ProtectedRoute } from '@/features/auth/protected-route';
import { Toaster } from '@/components/ui/sonner';
import { AppLayout } from '@/layouts/app-layout';
import { LoginPage } from '@/features/auth/login-page';
import { SignupPage } from '@/features/auth/signup-page';
import { ForgotPasswordPage } from '@/features/auth/forgot-password-page';
import { UpdatePasswordPage } from '@/features/auth/update-password-page';

import { TodayPage } from '@/features/today/today-page';
import { LeadsPage } from '@/features/leads/leads-page';
import { CasesPage } from '@/features/cases/cases-page';
import { ContactsPage } from '@/features/contacts/contacts-page';
import { CalendarPage } from '@/features/calendar/calendar-page';
import { WorkflowsPage } from '@/features/workflows/workflows-page';
import { CampaignsPage } from '@/features/campaigns/campaigns-page';
import { CommunicationsPage } from '@/features/communications/communications-page';
import { BillingPage } from '@/features/billing/billing-page';
import { SettingsPage } from '@/features/settings/settings-page';
import { UsersPage } from '@/features/settings/users-page';
import { FollowUpPage } from '@/features/follow-up/follow-up-page';
import { RelancesPage } from '@/features/relances/relances-page';
import { DossierModal } from '@/features/dossier/dossier-modal';
import { ClientModal } from '@/features/client/client-modal';
import type { EtatOuvertureDossier } from '@/features/dossier/dossier-constants';
import { IntegrationsListPage } from '@/features/integrations/integrations-list-page';
import { MetaSettingsPage } from '@/features/integrations/meta/meta-settings-page';
import { WebhooksPage } from '@/features/webhooks/webhooks-page';

/**
 * Routage avec location d'arriere-plan.
 *
 * Quand une fiche dossier est ouverte depuis une liste, on continue de rendre
 * la page d'origine derriere en passant `location={background}` au premier
 * <Routes>. L'arbre React reste monte : filtres, recherche, scroll et
 * selection survivent sans qu'on ait a les sauvegarder ni a les restaurer.
 *
 * Sans `background` -- lien copie, rechargement -- seule la route plein ecran
 * s'applique.
 */
function AppRoutes() {
  const location = useLocation();
  const background = (location.state as EtatOuvertureDossier | null)?.background;

  return (
    <>
        <Routes location={background ?? location}>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                {/* Cible du lien de reinitialisation : publique, puisque la
                    session de recuperation n'est ouverte qu'a l'arrivee. */}
                <Route path="/update-password" element={<UpdatePasswordPage />} />

          {/* Protected routes */}
          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/today" element={<TodayPage />} />
            <Route path="/leads" element={<LeadsPage />} />
            <Route path="/relances" element={<RelancesPage />} />
          {/* Ouverte directement par son URL : plein ecran, dans le layout. */}
          <Route path="/interventions/:leadId" element={<DossierModal pleinePage />} />
                <Route path="/clients/:contactId" element={<ClientModal pleinePage />} />
          <Route path="/cases" element={<CasesPage />} />
            <Route path="/contacts" element={<ContactsPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/follow-up" element={<FollowUpPage />} />
            <Route path="/workflows" element={<WorkflowsPage />} />
            <Route path="/campaigns" element={<CampaignsPage />} />
            <Route path="/communications" element={<CommunicationsPage />} />
            <Route path="/billing" element={<BillingPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/settings/integrations" element={<IntegrationsListPage />} />
            <Route path="/settings/integrations/meta" element={<MetaSettingsPage />} />
            <Route path="/settings/webhooks" element={<WebhooksPage />} />
            <Route path="/settings/users" element={<UsersPage />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/today" replace />} />
        </Routes>

      {background && (
        <Routes>
          <Route path="/interventions/:leadId" element={<DossierModal />} />
          <Route path="/clients/:contactId" element={<ClientModal />} />
        </Routes>
      )}
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      {/* attribute="class" pilote la classe .dark attendue par tailwind.config.js.
          Sans ce provider, next-themes etait installe mais aucun basculement
          n'etait possible : le bloc .dark du CSS ne s'appliquait jamais. */}
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <AuthProvider>
          <QueryProvider>
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
            <Toaster richColors position="top-right" />
          </QueryProvider>
          </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
