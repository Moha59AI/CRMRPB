import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Archive, Link2, Loader2, Search, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import type { Communication, Lead } from '@/types';
import { linkEmailToLead } from './email-service';

type EmailLeadLinkDialogProps = {
  email: Communication;
  leads: Lead[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLinked: (email: Communication) => void;
};

function leadName(lead: Lead): string {
  return [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.email || lead.phone || 'Lead sans nom';
}

function leadSearchValue(lead: Lead): string {
  return [
    lead.first_name,
    lead.last_name,
    lead.email,
    lead.phone,
    lead.postal_code,
    lead.city,
    lead.vehicle_registration,
  ].filter(Boolean).join(' ').toLocaleLowerCase('fr-FR');
}

export function EmailLeadLinkDialog({
  email,
  leads,
  open,
  onOpenChange,
  onLinked,
}: EmailLeadLinkDialogProps) {
  const [search, setSearch] = useState('');
  const [selectedLeadId, setSelectedLeadId] = useState(email.lead_id ?? '');
  const filteredLeads = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('fr-FR');
    const matching = needle ? leads.filter((lead) => leadSearchValue(lead).includes(needle)) : leads;
    return matching.slice(0, 60);
  }, [leads, search]);

  const mutation = useMutation({
    mutationFn: () => {
      if (!selectedLeadId) throw new Error('Sélectionnez un lead');
      return linkEmailToLead({ communicationId: email.id, leadId: selectedLeadId });
    },
    onSuccess: (updatedEmail) => {
      onLinked(updatedEmail);
      onOpenChange(false);
      toast.success('Email rattaché au lead');
    },
    onError: (error) => toast.error((error as Error)?.message || 'Rattachement impossible'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-hidden p-0 sm:max-w-xl sm:rounded-2xl">
        <DialogHeader className="border-b border-border px-4 py-4 sm:px-6">
          <DialogTitle>Rattacher cet email à un lead</DialogTitle>
          <DialogDescription>
            Le contenu du mail reste intact. Seul son classement dans le dossier client est mis à jour.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 space-y-3 overflow-y-auto px-4 py-4 sm:px-6">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nom, téléphone, email, immatriculation…"
              className="rounded-full pl-9"
              autoFocus
            />
          </div>

          <div className="max-h-[52dvh] space-y-1 overflow-y-auto rounded-xl border border-border p-1 scrollbar-thin">
            {filteredLeads.map((lead) => {
              const selected = lead.id === selectedLeadId;
              return (
                <button
                  key={lead.id}
                  type="button"
                  className={`flex w-full items-start gap-3 rounded-lg p-3 text-left transition ${
                    selected ? 'bg-primary/10 ring-1 ring-primary/25' : 'hover:bg-muted'
                  }`}
                  onClick={() => setSelectedLeadId(lead.id)}
                >
                  <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                    selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  }`}>
                    <UserRound className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-foreground">{leadName(lead)}</p>
                      {lead.archived_at && (
                        <Badge variant="outline" className="rounded-full text-[10px]">
                          <Archive className="mr-1 h-3 w-3" /> Archivé
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 break-words text-xs text-muted-foreground">
                      {[lead.phone, lead.email, lead.postal_code, lead.city, lead.vehicle_registration]
                        .filter(Boolean)
                        .join(' · ') || 'Coordonnées à compléter'}
                    </p>
                  </div>
                </button>
              );
            })}
            {filteredLeads.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                Aucun lead ne correspond à cette recherche.
              </p>
            )}
          </div>
          {leads.length > 60 && !search && (
            <p className="text-xs text-muted-foreground">
              Saisissez un nom ou une coordonnée pour retrouver rapidement une fiche plus ancienne.
            </p>
          )}
        </div>

        <DialogFooter className="border-t border-border px-4 py-3 sm:px-6 [&>button]:w-full sm:[&>button]:w-auto">
          <Button type="button" variant="outline" className="rounded-full" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            type="button"
            className="rounded-full"
            disabled={!selectedLeadId || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
            Rattacher au lead
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
