import './App.css';
import { useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AppRoutes } from '@/app/app-routes';
import { surveillerVerrouPointeur } from '@/lib/verrou-pointeur';
import { installerSondeBlocage } from '@/lib/sonde-blocage';
import { AuthProvider } from '@/features/auth/auth-context';
import { QueryProvider } from '@/app/query-provider';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ThemeProvider } from 'next-themes';
import { Toaster } from '@/components/ui/sonner';

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
