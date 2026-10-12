import { Navigate, useLocation } from 'react-router-dom';
import { type ReactNode } from 'react';
import { useAuth } from '@/features/auth/auth-context';
import { FullPageLoader } from '@/components/FullPageLoader';
import { cheminAutorise, accueilDuRole } from '@/config/permissions';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullPageLoader />;

  if (!session) return <Navigate to="/login" replace />;

  // Un compte sans profil n'appartient a aucun espace : la RLS lui refuserait
  // tout, autant le dire clairement plutot que d'afficher des ecrans vides.
  if (!profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-8">
        <div className="max-w-md text-center">
          <h1 className="mb-2 text-xl font-semibold text-foreground">
            Aucun acces associe a ce compte
          </h1>
          <p className="text-sm text-muted-foreground">
            Votre compte existe, mais il n'est rattache a aucun espace de travail.
            Demandez une invitation a votre administrateur.
          </p>
        </div>
      </div>
    );
  }

  // Le controle cote interface evite d'afficher un ecran qui echouerait de
  // toute facon : la regle qui compte est celle des politiques RLS.
  if (!cheminAutorise(location.pathname, profile.role, profile.dans_zone_test)) {
    return <Navigate to={accueilDuRole(profile.role)} replace />;
  }

  return <>{children}</>;
}
