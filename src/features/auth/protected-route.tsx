import { Navigate } from 'react-router-dom';
import { type ReactNode } from 'react';
import { useAuth } from '@/features/auth/auth-context';
import { FullPageLoader } from '@/components/FullPageLoader';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();

  if (loading) return <FullPageLoader />;

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
