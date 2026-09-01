import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Users, Shield, UserPlus, Mail, Trash2, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmerSuppression } from '@/components/ConfirmerSuppression';
import { fetchProfiles } from '@/services/profiles-service';
import { fetchInvitations, annulerInvitation } from '@/services/invitations-service';
import { changerRoleMembre, retirerMembre } from '@/services/admin-service';
import { roleLabels, roleDescriptions } from '@/config/roles';
import { useAuth } from '@/features/auth/auth-context';
import { DialogueInvitation } from './components/dialogue-invitation';
import type { Profile, UserRole } from '@/types';

const ROLES: UserRole[] = ['admin', 'manager', 'advisor', 'technician', 'accountant'];

const roleBadgeClass: Record<UserRole, string> = {
  admin: 'border-transparent bg-done-soft text-done hover:bg-done-soft',
  manager: 'border-transparent bg-upcoming-soft text-upcoming hover:bg-upcoming-soft',
  advisor: 'border-transparent bg-muted text-muted-foreground hover:bg-muted',
  technician: 'border-transparent bg-due-soft text-due hover:bg-due-soft',
  accountant: 'border-transparent bg-fuchsia-50 text-fuchsia-700 hover:bg-fuchsia-50',
};

export function UsersPage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const estAdmin = profile?.role === 'admin';

  const [inviterOuvert, setInviterOuvert] = useState(false);
  const [aRetirer, setARetirer] = useState<Profile | null>(null);

  const { data: profiles, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['profiles'],
    queryFn: fetchProfiles,
  });

  const { data: invitations } = useQuery({
    queryKey: ['invitations'],
    queryFn: fetchInvitations,
    enabled: estAdmin,
    retry: false,
  });

  const rafraichir = () => {
    queryClient.invalidateQueries({ queryKey: ['profiles'] });
    queryClient.invalidateQueries({ queryKey: ['invitations'] });
    queryClient.invalidateQueries({ queryKey: ['etat-systeme'] });
    queryClient.invalidateQueries({ queryKey: ['journal-audit'] });
  };

  const changerRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: UserRole }) => changerRoleMembre(id, role),
    onSuccess: (_r, v) => {
      rafraichir();
      toast.success(`Rôle changé en ${roleLabels[v.role].toLowerCase()}`);
    },
    onError: (e: Error) => toast.error('Changement refusé', { description: e.message }),
  });

  const retirer = useMutation({
    mutationFn: (id: string) => retirerMembre(id),
    onSuccess: () => {
      rafraichir();
      setARetirer(null);
      toast.success('Accès retiré', {
        description: "Le compte existe toujours mais ne voit plus aucune donnée.",
      });
    },
    onError: (e: Error) => {
      setARetirer(null);
      toast.error('Retrait refusé', { description: e.message });
    },
  });

  const annuler = useMutation({
    mutationFn: (id: string) => annulerInvitation(id),
    onSuccess: () => {
      rafraichir();
      toast.success('Invitation annulée');
    },
    onError: (e: Error) => toast.error("L'annulation a échoué", { description: e.message }),
  });

  const enAttente = (invitations ?? []).filter((i) => !i.accepted_at);
  const nbAdmins = (profiles ?? []).filter((p) => p.role === 'admin').length;

  return (
    <>
      <PageHeader
        title="Utilisateurs"
        description="Qui a accès au CRM, et avec quels droits"
        action={
          estAdmin ? (
            <Button className="rounded-full" onClick={() => setInviterOuvert(true)}>
              <UserPlus className="mr-2 h-4 w-4" />
              Inviter
            </Button>
          ) : undefined
        }
      />

      <div className="space-y-6 overflow-y-auto p-6">
        {/* Invitations en attente */}
        {estAdmin && enAttente.length > 0 && (
          <Card className="rounded-xl border border-border">
            <CardHeader className="flex flex-row items-start space-y-0">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted/40">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="space-y-1">
                  <CardTitle className="text-sm">
                    Invitations en attente ({enAttente.length})
                  </CardTitle>
                  <CardDescription className="text-xs">
                    La personne doit créer son compte avec l'adresse exacte, avant expiration.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {enAttente.map((inv) => {
                  const expiree = new Date(inv.expires_at) <= new Date();
                  return (
                    <div
                      key={inv.id}
                      className="flex items-center justify-between gap-4 px-6 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {inv.email}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {expiree
                            ? 'Expirée'
                            : `Expire le ${new Date(inv.expires_at).toLocaleDateString('fr-FR')}`}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-3">
                        <Badge className={`rounded-full text-[10px] ${roleBadgeClass[inv.role]}`}>
                          {roleLabels[inv.role]}
                        </Badge>
                        {expiree && (
                          <Badge
                            variant="outline"
                            className="rounded-full border-destructive/30 text-[10px] font-normal text-destructive"
                          >
                            Expirée
                          </Badge>
                        )}
                        <Button
                          variant="ghost" size="sm"
                          className="rounded-full text-muted-foreground hover:text-destructive"
                          onClick={() => annuler.mutate(inv.id)}
                          disabled={annuler.isPending}
                        >
                          Annuler
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Membres */}
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
                  {(error as Error)?.message || 'Erreur de chargement'}
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
                <h3 className="text-sm font-semibold text-foreground">Aucun membre</h3>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Invitez quelqu'un : son accès s'ouvrira dès qu'il aura créé son compte.
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
                    <TableHead className="px-4 text-xs">Depuis</TableHead>
                    {estAdmin && <TableHead className="px-4 text-right text-xs">Accès</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {profiles.map((p) => {
                    const estMoi = profile?.id === p.id;
                    const nom =
                      [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Sans nom';
                    // Retirer le dernier administrateur verrouillerait l'espace.
                    // La base refuse de toute facon ; on evite juste de le proposer.
                    const dernierAdmin = p.role === 'admin' && nbAdmins <= 1;

                    return (
                      <TableRow
                        key={p.id}
                        className={estMoi ? 'bg-primary/5 hover:bg-primary/5' : 'hover:bg-muted/40'}
                      >
                        <TableCell className="px-4">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">{nom}</span>
                            {estMoi && (
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
                          {estAdmin ? (
                            <Select
                              value={p.role}
                              disabled={dernierAdmin || changerRole.isPending}
                              onValueChange={(v) =>
                                changerRole.mutate({ id: p.id, role: v as UserRole })
                              }
                            >
                              <SelectTrigger
                                className="h-8 w-[150px] rounded-full text-xs"
                                aria-label={`Rôle de ${nom}`}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ROLES.map((r) => (
                                  <SelectItem key={r} value={r} className="text-xs">
                                    {roleLabels[r]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Badge
                              className={`rounded-full text-[10px] ${roleBadgeClass[p.role]}`}
                              title={roleDescriptions[p.role]}
                            >
                              {roleLabels[p.role]}
                            </Badge>
                          )}
                        </TableCell>

                        <TableCell className="px-4 text-sm text-muted-foreground">
                          {p.phone || '—'}
                        </TableCell>

                        <TableCell className="whitespace-nowrap px-4 text-sm text-muted-foreground">
                          {new Date(p.created_at).toLocaleDateString('fr-FR', {
                            day: '2-digit', month: '2-digit', year: 'numeric',
                          })}
                        </TableCell>

                        {estAdmin && (
                          <TableCell className="px-4 text-right">
                            {!estMoi && !dernierAdmin && (
                              <Button
                                variant="ghost" size="sm"
                                className="rounded-full text-muted-foreground hover:text-destructive"
                                onClick={() => setARetirer(p)}
                                aria-label={`Retirer l'accès de ${nom}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {estAdmin && (
          <p className="text-xs text-muted-foreground">
            Retirer un accès supprime le profil, pas le compte : la personne peut encore
            se connecter mais ne voit plus aucune donnée. Le dernier administrateur ne peut
            être ni rétrogradé ni retiré.
          </p>
        )}
      </div>

      <DialogueInvitation ouvert={inviterOuvert} onOuvertChange={setInviterOuvert} />

      <ConfirmerSuppression
        ouvert={aRetirer !== null}
        onOuvertChange={(o) => !o && setARetirer(null)}
        nom={
          aRetirer
            ? [aRetirer.first_name, aRetirer.last_name].filter(Boolean).join(' ') || 'Sans nom'
            : ''
        }
        consequence="Cette personne ne verra plus aucune donnée du CRM. Son compte n'est pas supprimé : une nouvelle invitation lui rendra l'accès."
        libelleAction="Retirer l'accès"
        enCours={retirer.isPending}
        onConfirmer={() => aRetirer && retirer.mutate(aRetirer.id)}
      />
    </>
  );
}
