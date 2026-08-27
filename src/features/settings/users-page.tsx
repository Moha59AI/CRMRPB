import { useQuery } from '@tanstack/react-query';
import { Users, Shield, AlertCircle, UserPlus } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchProfiles } from '@/services/crm-service';
import { roleLabels, roleDescriptions } from '@/config/roles';
import { useAuth } from '@/features/auth/auth-context';
import { toast } from 'sonner';
import type { UserRole } from '@/types';

const roleBadgeClass: Record<UserRole, string> = {
  admin: 'border-transparent bg-emerald-50 text-emerald-700 hover:bg-emerald-50',
  manager: 'border-transparent bg-blue-50 text-blue-700 hover:bg-blue-50',
  advisor: 'border-transparent bg-muted text-muted-foreground hover:bg-muted',
  technician: 'border-transparent bg-orange-50 text-orange-700 hover:bg-orange-50',
  accountant: 'border-transparent bg-fuchsia-50 text-fuchsia-700 hover:bg-fuchsia-50',
};

export function UsersPage() {
  const { profile } = useAuth();

  const { data: profiles, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['profiles'],
    queryFn: fetchProfiles,
  });

  return (
    <>
      <PageHeader
        title="Utilisateurs"
        description="Gestion de l'équipe"
        action={
          <Button
            variant="outline"
            className="rounded-full"
            onClick={() => toast.info('Les invitations nécessitent la configuration de Supabase Auth')}
          >
            <UserPlus className="mr-2 h-4 w-4" />
            Inviter un membre
          </Button>
        }
      />

      <div className="space-y-4 p-6">
        {/* Invitation note */}
        <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            L'invitation de nouveaux utilisateurs nécessite la configuration de Supabase Auth
            (envoi d'emails, confirmation de compte et création automatique du profil). Tant
            que cette étape n'est pas réalisée, les membres doivent créer leur compte eux-mêmes.
          </p>
        </div>

        <Card className="rounded-xl border border-border">
          <CardContent className="p-0">
            {isLoading && (
              <div className="space-y-2 p-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-lg" />
                ))}
              </div>
            )}

            {isError && (
              <div className="flex flex-col items-center justify-center p-12 text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-muted/50">
                  <Shield className="h-7 w-7 text-muted-foreground" strokeWidth={1.5} />
                </div>
                <p className="text-sm text-muted-foreground">
                  {(error as Error)?.message || 'Erreur de chargement des utilisateurs'}
                </p>
                <Button variant="outline" className="mt-4 rounded-full" onClick={() => refetch()}>
                  Réessayer
                </Button>
              </div>
            )}

            {!isLoading && !isError && profiles && profiles.length === 0 && (
              <div className="flex flex-col items-center justify-center p-12 text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-muted/50">
                  <Users className="h-7 w-7 text-muted-foreground" strokeWidth={1.5} />
                </div>
                <h3 className="text-sm font-semibold text-foreground">Aucun membre pour le moment</h3>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Les membres de l'équipe apparaîtront ici une fois leur compte créé.
                </p>
              </div>
            )}

            {!isLoading && !isError && profiles && profiles.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="px-4 text-xs">Nom</TableHead>
                    <TableHead className="px-4 text-xs">Rôle</TableHead>
                    <TableHead className="px-4 text-xs">Téléphone</TableHead>
                    <TableHead className="px-4 text-xs">Date de création</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {profiles.map((p) => {
                    const isCurrentUser = profile?.id === p.id;
                    const name =
                      [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Sans nom';
                    return (
                      <TableRow
                        key={p.id}
                        className={
                          isCurrentUser
                            ? 'bg-primary/5 hover:bg-primary/5'
                            : 'hover:bg-muted/40'
                        }
                      >
                        <TableCell className="px-4">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">{name}</span>
                            {isCurrentUser && (
                              <Badge
                                variant="outline"
                                className="rounded-full text-[10px] font-normal text-muted-foreground"
                              >
                                Vous
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="px-4">
                          <div className="flex items-center gap-2">
                            <Badge
                              className={`rounded-full text-[10px] ${roleBadgeClass[p.role]}`}
                              title={roleDescriptions[p.role]}
                            >
                              {roleLabels[p.role]}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="px-4 text-sm text-muted-foreground">
                          {p.phone || '—'}
                        </TableCell>
                        <TableCell className="px-4 text-sm text-muted-foreground whitespace-nowrap">
                          {new Date(p.created_at).toLocaleDateString('fr-FR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                          })}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
