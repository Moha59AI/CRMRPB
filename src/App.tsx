import './App.css';
import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { surveillerVerrouPointeur } from '@/lib/verrou-pointeur';
import { installerSondeBlocage } from '@/lib/sonde-blocage';
import { BancListe, BancFiche } from '@/features/diag/banc-fiche';
import { AuthProvider } from '@/features/auth/auth-context';
import { QueryProvider } from '@/app/query-provider';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ThemeProvider } from 'next-themes';
import { ProtectedRoute } from '@/features/auth/protected-route';
import { Toaster } from '@/components/ui/sonner';
import { AppLayout } from '@/layouts/app-layout';
import { LoginPage } from '@/features/auth/login-page';
import { ForgotPasswordPage } from '@/features/auth/forgot-password-page';
import { UpdatePasswordPage } from '@/features/auth/update-password-page';

import { TodayPage } from '@/features/today/today-page';
import { LeadsPage } from '@/features/leads/leads-page';
import { CasesPage } from '@/features/cases/cases-page';
import { ContactsPage } from '@/features/contacts/contacts-page';
import { CalendarPage } from '@/features/calendar/calendar-page';
import { WorkflowsPage } from '@/features/workflows/workflows-page';
import { CampaignsPage } from '@/features/campaigns/campaigns-page';
import { MarketingPage } from '@/features/marketing/marketing-page';
import { CommunicationsPage } from '@/features/communications/communications-page';
import { BillingPage } from '@/features/billing/billing-page';
import { SettingsPage } from '@/features/settings/settings-page';
import { UsersPage } from '@/features/settings/users-page';
import { InsurersPage } from '@/features/settings/insurers-page';
import { CadencesPage } from '@/features/settings/cadences-page';
import { SettingsLayout } from '@/features/settings/settings-layout';
import { FollowUpPage } from '@/features/follow-up/follow-up-page';
import { RelancesPage } from '@/features/relances/relances-page';
import { DossierModal } from '@/features/dossier/dossier-modal';
import { ClientModal } from '@/features/client/client-modal';
import type { EtatOuvertureDossier } from '@/features/dossier/dossier-constants';
import { IntegrationsListPage } from '@/features/integrations/integrations-list-page';
import { MetaSettingsPage } from '@/features/integrations/meta/meta-settings-page';
import { GoogleAdsSettingsPage } from '@/features/integrations/google/google-ads-settings-page';
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
          {/* Inscription publique fermee : tout nouvel inscrit devenait
              administrateur de l'espace et etait rattache au premier workspace
              trouve. Les acces se creent desormais par invitation. */}
          <Route path="/signup" element={<Navigate to="/login" replace />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          {/* TEMPORAIRE — banc d'essai du blocage, developpement uniquement */}
          <Route path="/diag-fiche" element={<BancListe />} />
          <Route path="/diag-fiche/:id" element={<BancFiche pleinePage />} />
          {/* Cible du lien de reinitialisation : publique, puisque la session
              de recuperation n'est ouverte qu'a l'arrivee. */}
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
            <Route path="/marketing" element={<MarketingPage />} />
            <Route path="/campaigns" element={<CampaignsPage />} />
            <Route path="/communications" element={<CommunicationsPage />} />
            <Route path="/billing" element={<BillingPage />} />
            {/* Les reglages partagent une sous-navigation : sans elle, ces
                pages n'etaient joignables qu'en tapant leur URL. */}
            <Route path="/settings" element={<SettingsLayout />}>
              <Route index element={<SettingsPage />} />
              <Route path="integrations" element={<IntegrationsListPage />} />
              <Route path="integrations/meta" element={<MetaSettingsPage />} />
              <Route path="integrations/google" element={<GoogleAdsSettingsPage />} />
              <Route path="webhooks" element={<WebhooksPage />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="insurers" element={<InsurersPage />} />
              <Route path="relances" element={<CadencesPage />} />
            </Route>
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/today" replace />} />
        </Routes>

      {background && (
        <Routes>
          <Route path="/interventions/:leadId" element={<DossierModal />} />
          <Route path="/clients/:contactId" element={<ClientModal />} />
          {/* TEMPORAIRE — banc d'essai */}
          <Route path="/diag-fiche/:id" element={<BancFiche />} />
        </Routes>
      )}
    </>
  );
}

export default function App() {
  // Rattrape un verrou de clic laisse par Radix quand une couche modale se
  // demonte pendant qu'une autre s'ouvre. Sans ce filet, la page cesse de
  // repondre au clic et il faut recharger.
  useEffect(() => surveillerVerrouPointeur(), []);

  // TEMPORAIRE — sonde de diagnostic du blocage au clic. A retirer.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    return installerSondeBlocage();
  }, []);

  return (
    <ErrorBoundary pleinEcran>
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
