import './App.css';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
import { IntegrationsListPage } from '@/features/integrations/integrations-list-page';
import { MetaSettingsPage } from '@/features/integrations/meta/meta-settings-page';
import { WebhooksPage } from '@/features/webhooks/webhooks-page';

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
              <Routes>
                {/* Public routes */}
                <Route path="/login" element={<LoginPage />} />
                <Route path="/signup" element={<SignupPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />

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
            </BrowserRouter>
            <Toaster richColors position="top-right" />
          </QueryProvider>
          </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
