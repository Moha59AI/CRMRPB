import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Search, Plus, Phone, Mail, MapPin, MessageSquare, StickyNote, Car,
  AlertTriangle, Loader2,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { createCommunication, createNote, fetchCommunications, fetchNotes } from '@/services/activity-service';
import { createContact, fetchContacts, fetchVehiclesForContact, updateContact } from '@/services/contacts-service';
import { toast } from 'sonner';
import type { Contact, Vehicle, Communication, Note } from '@/types';

// ============ NEW CONTACT FORM SCHEMA ============
const contactSchema = z.object({
  first_name: z.string().min(1, 'Le prénom est requis'),
  last_name: z.string().min(1, 'Le nom est requis'),
  phone: z.string().min(1, 'Le téléphone est requis'),
  email: z.string().email('Email invalide').optional().or(z.literal('')),
  address: z.string().optional(),
  city: z.string().optional(),
  postal_code: z.string().optional(),
});
type ContactFormValues = z.infer<typeof contactSchema>;

const commTypeLabels: Record<string, string> = {
  sms_outbound: 'SMS envoyé',
  sms_inbound: 'SMS reçu',
  call_outbound: 'Appel sortant',
  call_inbound: 'Appel entrant',
  call_missed: 'Appel manqué',
  voicemail: 'Messagerie vocale',
  email_outbound: 'Email envoyé',
  email_inbound: 'Email reçu',
  note: 'Note',
};

const commStatusLabels: Record<string, string> = {
  pending: 'En attente',
  sent: 'Envoyé',
  delivered: 'Livré',
  failed: 'Échec',
  received: 'Reçu',
  answered: 'Répondu',
  missed: 'Manqué',
  cancelled: 'Annulé',
};

export function ContactsPage() {
  const [search, setSearch] = useState('');
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const { data: contacts, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['contacts', search],
    queryFn: () => fetchContacts({ search }),
  });

  return (
    <>
      <PageHeader
        title="Contacts"
        description="Carnet de contacts"
        action={
          <Button className="rounded-full" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nouveau contact
          </Button>
        }
      />

      {/* Search bar */}
      <div className="border-b border-border px-6 py-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher par nom, téléphone, email, ville..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-lg pl-9"
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {isLoading && (
          <div className="p-6">
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <AlertTriangle className="mb-3 h-8 w-8 text-destructive" />
            <p className="text-sm text-muted-foreground">{(error as Error)?.message || 'Erreur de chargement'}</p>
            <Button variant="outline" className="mt-4 rounded-full" onClick={() => refetch()}>
              Réessayer
            </Button>
          </div>
        )}

        {!isLoading && !isError && contacts && contacts.length === 0 && (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-muted/50">
              <MessageSquare className="h-7 w-7 text-muted-foreground" strokeWidth={1.5} />
            </div>
            <h3 className="text-sm font-semibold text-foreground">Aucun contact pour le moment</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Ajoutez votre premier contact pour commencer à suivre vos clients et leurs véhicules.
            </p>
            <Button className="mt-4 rounded-full" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Nouveau contact
            </Button>
          </div>
        )}

        {!isLoading && !isError && contacts && contacts.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-xs">Nom</TableHead>
                <TableHead className="text-xs">Téléphone</TableHead>
                <TableHead className="text-xs">Email</TableHead>
                <TableHead className="text-xs">Ville</TableHead>
                <TableHead className="text-xs">Consentement SMS</TableHead>
                <TableHead className="text-xs">Date de création</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contacts.map((contact) => (
                <ContactRow
                  key={contact.id}
                  contact={contact}
                  onOpen={() => setSelectedContactId(contact.id)}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Detail sheet */}
      <ContactDetailSheet
        contactId={selectedContactId}
        onClose={() => setSelectedContactId(null)}
      />

      {/* New contact dialog */}
      <CreateContactDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}

// ============ CONTACT ROW ============
function ContactRow({ contact, onOpen }: { contact: Contact; onOpen: () => void }) {
  return (
    <TableRow className="cursor-pointer hover:bg-muted/40" onClick={onOpen}>
      <TableCell className="text-sm font-medium text-foreground">
        {contact.first_name} {contact.last_name}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">{contact.phone || '—'}</TableCell>
      <TableCell className="text-sm text-muted-foreground">{contact.email || '—'}</TableCell>
      <TableCell className="text-sm text-muted-foreground">{contact.city || '—'}</TableCell>
      <TableCell>
        <Badge
          variant={contact.sms_consent ? 'secondary' : 'outline'}
          className="rounded-full text-[10px]"
        >
          {contact.sms_consent ? 'Oui' : 'Non'}
        </Badge>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
        {new Date(contact.created_at).toLocaleDateString('fr-FR', {
          day: '2-digit', month: '2-digit', year: 'numeric',
        })}
      </TableCell>
    </TableRow>
  );
}

// ============ CONTACT DETAIL SHEET ============
function ContactDetailSheet({
  contactId, onClose,
}: {
  contactId: string | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('infos');
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteContent, setNoteContent] = useState('');

  const open = !!contactId;

  const { data: contact, isLoading: contactLoading } = useQuery({
    queryKey: ['contact', contactId],
    queryFn: async () => {
      // The list query already holds the contact; refetch from cache is enough,
      // but we re-resolve from the contacts cache to stay reactive to updates.
      const cached = queryClient.getQueryData<Contact[]>(['contacts', '']) ?? [];
      const found = cached.find((c) => c.id === contactId);
      if (found) return found;
      // Fall back to any contacts cache entry.
      const all = queryClient.getQueriesData<Contact[]>({ queryKey: ['contacts'] });
      for (const [, list] of all) {
        const match = list?.find((c) => c.id === contactId);
        if (match) return match;
      }
      return null;
    },
    enabled: !!contactId,
  });

  const { data: vehicles, isLoading: vehiclesLoading } = useQuery({
    queryKey: ['contact-vehicles', contactId],
    queryFn: () => fetchVehiclesForContact(contactId!),
    enabled: !!contactId,
  });

  const { data: communications, isLoading: commsLoading } = useQuery({
    queryKey: ['contact-communications', contactId],
    queryFn: () => fetchCommunications({ contactId: contactId! }),
    enabled: !!contactId,
  });

  const { data: notes, isLoading: notesLoading } = useQuery({
    queryKey: ['contact-notes', contactId],
    queryFn: () => fetchNotes({ contactId: contactId! }),
    enabled: !!contactId,
  });

  const consentMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Contact> }) =>
      updateContact(id, updates),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      // Optimistically update the resolved contact.
      if (contact) {
        queryClient.setQueryData(['contact', vars.id], { ...contact, ...vars.updates });
      }
      toast.success('Consentement mis à jour');
    },
    onError: (err) => toast.error((err as Error)?.message || 'Erreur de mise à jour'),
  });

  const smsMutation = useMutation({
    mutationFn: (id: string) =>
      createCommunication({
        contact_id: id,
        type: 'sms_outbound',
        direction: 'outbound',
        status: 'sent',
        content: 'Bonjour, votre prise en charge est en cours. Cordialement, Relais Pare-Brise.',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-communications', contactId] });
      toast.success('SMS envoyé (mode démo)');
    },
    onError: (err) => toast.error((err as Error)?.message || "Erreur d'envoi du SMS"),
  });

  const noteMutation = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      createNote({ contact_id: id, content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-notes', contactId] });
      setNoteContent('');
      setShowNoteForm(false);
      toast.success('Note ajoutée');
    },
    onError: (err) => toast.error((err as Error)?.message || "Erreur lors de l'ajout de la note"),
  });

  const handleSendSms = () => {
    if (!contactId) return;
    if (!contact?.sms_consent) {
      toast.error("Ce contact n'a pas donné son consentement SMS");
      return;
    }
    smsMutation.mutate(contactId);
  };

  const handleAddNote = () => {
    if (!contactId) return;
    if (!noteContent.trim()) {
      toast.error('La note est vide');
      return;
    }
    noteMutation.mutate({ id: contactId, content: noteContent.trim() });
  };

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) { onClose(); setTab('infos'); setShowNoteForm(false); setNoteContent(''); } }}>
      <SheetContent side="right" className="w-[500px] sm:max-w-[500px] overflow-y-auto scrollbar-thin">
        <SheetHeader className="pr-10">
          <SheetTitle className="text-lg">
            {contactLoading ? (
              <Skeleton className="h-6 w-40" />
            ) : (
              `${contact?.first_name ?? ''} ${contact?.last_name ?? ''}`.trim() || 'Contact'
            )}
          </SheetTitle>
          <SheetDescription>
            {contact
              ? `Contact depuis le ${new Date(contact.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}`
              : 'Détails du contact'}
          </SheetDescription>
        </SheetHeader>

        {!contact && !contactLoading && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <AlertTriangle className="mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Contact introuvable</p>
          </div>
        )}

        {contact && (
          <div className="mt-6 space-y-6">
            {/* Quick actions */}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                className="rounded-full"
                onClick={handleSendSms}
                disabled={smsMutation.isPending}
              >
                {smsMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <MessageSquare className="mr-2 h-4 w-4" />
                )}
                Envoyer un SMS
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="rounded-full"
                onClick={() => { setTab('notes'); setShowNoteForm(true); }}
              >
                <StickyNote className="mr-2 h-4 w-4" />
                Ajouter une note
              </Button>
            </div>

            {/* Consent toggles */}
            <div className="rounded-xl border border-border p-4">
              <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Consentements
              </p>
              <div className="space-y-3">
                <ConsentRow
                  label="Consentement SMS"
                  checked={contact.sms_consent}
                  disabled={consentMutation.isPending}
                  onToggle={(v) =>
                    consentMutation.mutate({ id: contact.id, updates: { sms_consent: v } })
                  }
                />
                <ConsentRow
                  label="Consentement Email"
                  checked={contact.email_consent}
                  disabled={consentMutation.isPending}
                  onToggle={(v) =>
                    consentMutation.mutate({ id: contact.id, updates: { email_consent: v } })
                  }
                />
              </div>
            </div>

            {/* Tabs */}
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="w-full">
                <TabsTrigger value="infos" className="flex-1">Infos</TabsTrigger>
                <TabsTrigger value="vehicles" className="flex-1">Véhicules</TabsTrigger>
                <TabsTrigger value="communications" className="flex-1">Communications</TabsTrigger>
                <TabsTrigger value="notes" className="flex-1">Notes</TabsTrigger>
              </TabsList>

              {/* Infos tab */}
              <TabsContent value="infos" className="space-y-3">
                <div className="rounded-xl border border-border p-4">
                  <InfoRow icon={<Phone className="h-4 w-4" />} label="Téléphone" value={contact.phone} />
                  <InfoRow icon={<Mail className="h-4 w-4" />} label="Email" value={contact.email} />
                  <InfoRow icon={<MapPin className="h-4 w-4" />} label="Adresse" value={contact.address} />
                  <InfoRow icon={<MapPin className="h-4 w-4" />} label="Ville" value={contact.city} />
                  <InfoRow icon={<MapPin className="h-4 w-4" />} label="Code postal" value={contact.postal_code} />
                </div>
                {contact.notes && (
                  <div className="rounded-xl border border-border p-4">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Note interne
                    </p>
                    <p className="whitespace-pre-wrap text-sm text-foreground">{contact.notes}</p>
                  </div>
                )}
              </TabsContent>

              {/* Vehicles tab */}
              <TabsContent value="vehicles">
                {vehiclesLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 2 }).map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full rounded-xl" />
                    ))}
                  </div>
                ) : vehicles && vehicles.length > 0 ? (
                  <div className="space-y-3">
                    {vehicles.map((v) => (
                      <VehicleCard key={v.id} vehicle={v} />
                    ))}
                  </div>
                ) : (
                  <EmptyTab
                    icon={<Car className="h-7 w-7" strokeWidth={1.5} />}
                    title="Aucun véhicule"
                    description="Les véhicules rattachés à ce contact apparaîtront ici."
                  />
                )}
              </TabsContent>

              {/* Communications tab */}
              <TabsContent value="communications" className="space-y-3">
                {commsLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full rounded-xl" />
                    ))}
                  </div>
                ) : communications && communications.length > 0 ? (
                  communications.map((c) => <CommunicationRow key={c.id} comm={c} />)
                ) : (
                  <EmptyTab
                    icon={<MessageSquare className="h-7 w-7" strokeWidth={1.5} />}
                    title="Aucune communication"
                    description="Les SMS, appels et emails liés à ce contact s'afficheront ici."
                  />
                )}
              </TabsContent>

              {/* Notes tab */}
              <TabsContent value="notes" className="space-y-3">
                {showNoteForm && (
                  <div className="rounded-xl border border-border p-4 space-y-3">
                    <Textarea
                      placeholder="Saisissez votre note..."
                      value={noteContent}
                      onChange={(e) => setNoteContent(e.target.value)}
                      rows={3}
                      className="rounded-lg resize-none"
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="rounded-full"
                        onClick={() => { setShowNoteForm(false); setNoteContent(''); }}
                      >
                        Annuler
                      </Button>
                      <Button
                        size="sm"
                        className="rounded-full"
                        onClick={handleAddNote}
                        disabled={noteMutation.isPending}
                      >
                        {noteMutation.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <StickyNote className="mr-2 h-4 w-4" />
                        )}
                        Enregistrer
                      </Button>
                    </div>
                  </div>
                )}

                {notesLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 2 }).map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full rounded-xl" />
                    ))}
                  </div>
                ) : notes && notes.length > 0 ? (
                  notes.map((n) => <NoteRow key={n.id} note={n} />)
                ) : (
                  !showNoteForm && (
                    <EmptyTab
                      icon={<StickyNote className="h-7 w-7" strokeWidth={1.5} />}
                      title="Aucune note"
                      description="Ajoutez une note pour garder une trace de vos échanges."
                    />
                  )
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ============ CREATE CONTACT DIALOG ============
function CreateContactDialog({
  open, onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();

  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      first_name: '', last_name: '', phone: '', email: '',
      address: '', city: '', postal_code: '',
    },
  });

  const mutation = useMutation({
    mutationFn: (values: ContactFormValues) =>
      createContact({
        first_name: values.first_name,
        last_name: values.last_name,
        phone: values.phone,
        email: values.email || null,
        address: values.address || null,
        city: values.city || null,
        postal_code: values.postal_code || null,
        sms_consent: false,
        email_consent: false,
      }),
    onSuccess: (res) => {
      if (res.error) {
        toast.error(res.error);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      toast.success('Contact créé');
      form.reset();
      onOpenChange(false);
    },
    onError: (err) => toast.error((err as Error)?.message || 'Erreur de création'),
  });

  const onSubmit = (values: ContactFormValues) => mutation.mutate(values);

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) form.reset(); }}>
      <DialogContent className="max-w-lg rounded-xl">
        <DialogHeader>
          <DialogTitle>Nouveau contact</DialogTitle>
          <DialogDescription>
            Ajoutez un contact à votre carnet d'adresses.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField
              label="Prénom"
              error={form.formState.errors.first_name?.message}
              {...form.register('first_name')}
            />
            <FormField
              label="Nom"
              error={form.formState.errors.last_name?.message}
              {...form.register('last_name')}
            />
          </div>
          <FormField
            label="Téléphone"
            error={form.formState.errors.phone?.message}
            {...form.register('phone')}
          />
          <FormField
            label="Email"
            error={form.formState.errors.email?.message}
            {...form.register('email')}
          />
          <FormField
            label="Adresse"
            error={form.formState.errors.address?.message}
            {...form.register('address')}
          />
          <div className="grid grid-cols-2 gap-4">
            <FormField
              label="Ville"
              error={form.formState.errors.city?.message}
              {...form.register('city')}
            />
            <FormField
              label="Code postal"
              error={form.formState.errors.postal_code?.message}
              {...form.register('postal_code')}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              className="rounded-full"
              onClick={() => onOpenChange(false)}
            >
              Annuler
            </Button>
            <Button
              type="submit"
              className="rounded-full"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Créer le contact
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============ SMALL COMPONENTS ============
function ConsentRow({
  label, checked, disabled, onToggle,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <Label className="text-sm text-foreground">{label}</Label>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onToggle} />
    </div>
  );
}

function InfoRow({
  icon, label, value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex items-start gap-3 py-1.5">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm text-foreground break-words">{value || '—'}</p>
      </div>
    </div>
  );
}

function VehicleCard({ vehicle }: { vehicle: Vehicle }) {
  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex items-center gap-2">
        <Car className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">
          {[vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Véhicule'}
        </p>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
        {vehicle.registration && <span>Immat.: {vehicle.registration}</span>}
        {vehicle.year && <span>Année: {vehicle.year}</span>}
        {vehicle.color && <span>Couleur: {vehicle.color}</span>}
        {vehicle.vin && <span className="truncate">VIN: {vehicle.vin}</span>}
      </div>
    </div>
  );
}

function CommunicationRow({ comm }: { comm: Communication }) {
  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {comm.type.startsWith('sms') ? (
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          ) : comm.type.startsWith('call') ? (
            <Phone className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Mail className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="text-sm font-medium text-foreground">
            {commTypeLabels[comm.type] ?? comm.type}
          </span>
        </div>
        <Badge variant="outline" className="rounded-full text-[10px]">
          {commStatusLabels[comm.status] ?? comm.status}
        </Badge>
      </div>
      {comm.content && (
        <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{comm.content}</p>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        {new Date(comm.created_at).toLocaleString('fr-FR', {
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit',
        })}
      </p>
    </div>
  );
}

function NoteRow({ note }: { note: Note }) {
  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex items-center gap-2">
        <StickyNote className="h-4 w-4 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          {new Date(note.created_at).toLocaleString('fr-FR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
          })}
        </p>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{note.content}</p>
    </div>
  );
}

function EmptyTab({
  icon, title, description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border p-8 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-muted/50 text-muted-foreground">
        {icon}
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 max-w-xs text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function FormField({
  label, error, ...props
}: {
  label: string;
  error?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm text-foreground">{label}</Label>
      <Input
        {...props}
        className={`rounded-lg ${props.className ?? ''}`}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
