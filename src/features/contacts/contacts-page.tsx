import { useMemo, useRef, useState } from 'react';
import {
  useQuery, useMutation, useQueryClient,
} from '@tanstack/react-query';
import {
  useForm,
} from 'react-hook-form';
import {
  zodResolver,
} from '@hookform/resolvers/zod';
import {
  z,
} from 'zod';
import {
  Search, Plus, MessageSquare, AlertTriangle, Loader2, Phone,
} from 'lucide-react';
import {
  useNavigate, useLocation,
} from 'react-router-dom';
import {
  PageHeader,
} from '@/components/PageHeader';
import {
  ChampAdresse,
} from '@/components/ChampAdresse';
import { fondDepuis } from '@/features/dossier/dossier-constants';
import { useEstMobile } from '@/hooks/use-media-query';
import {
  Input,
} from '@/components/ui/input';
import {
  Label,
} from '@/components/ui/label';
import {
  Button,
} from '@/components/ui/button';
import {
  Badge,
} from '@/components/ui/badge';
import {
  Skeleton,
} from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  createContact, fetchContacts, fetchResumesClients,
} from '@/services/contacts-service';
import type { ResumeClientListe } from '@/services/contacts-service';
import {
  toast,
} from 'sonner';
import type {
  Contact,
} from '@/types';

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

type FiltreClient = 'tous' | 'clients' | 'prospects';

const FILTRES: { cle: FiltreClient; label: string }[] = [
  { cle: 'tous', label: 'Tous' },
  { cle: 'clients', label: 'Clients' },
  { cle: 'prospects', label: 'Prospects' },
];

/**
 * Client ou prospect, selon la regle du metier : le passage dans Glass Onify
 * suffit. Une facture reste une seconde preuve pour l'historique importe.
 */
function BadgeClient({ estClient }: { estClient: boolean }) {
  if (!estClient) return null;
  return (
    <Badge
      variant="outline"
      className="shrink-0 rounded-full border-success/25 bg-success-soft text-[10px] text-success"
    >
      Client
    </Badge>
  );
}

export function ContactsPage() {
  const navigate = useNavigate();
  // Le tableau a sept colonnes : sur telephone, la liste le remplace.
  const estMobile = useEstMobile();
  const location = useLocation();
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  // La fiche client s'ouvre en surface superposee, comme la fiche dossier :
  // `background` fait que cette page reste montee derriere, avec sa recherche
  // et son defilement intacts.
  const ouvrirClient = (contactId: string) => {
    navigate(`/clients/${contactId}`, { state: { background: fondDepuis(location) } });
  };

  const { data: contacts, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['contacts', search],
    queryFn: () => fetchContacts({ search }),
  });

  // Un client est une personne, un lead une intervention : ce compteur rend le
  // modele lisible sans ouvrir chaque fiche.
  const { data: resumes } = useQuery({
    queryKey: ['resumes-clients'],
    queryFn: fetchResumesClients,
  });

  // Le module s'ouvre sur les vrais clients. Les contacts crees au stade lead
  // restent disponibles dans Prospects, sans polluer la liste quotidienne.
  const [filtre, setFiltre] = useState<FiltreClient>('clients');
  const listeFiltree = useMemo(() => {
    if (!contacts) return contacts;
    if (filtre === 'tous') return contacts;
    const veutClient = filtre === 'clients';
    return contacts.filter(
      (c) => Boolean(resumes?.get(c.id)?.estClient) === veutClient,
    );
  }, [contacts, resumes, filtre]);

  return (
    <>
      <PageHeader
        title="Clients"
        description="Client dès la création de son dossier Glass Onify"
        action={
          <Button className="rounded-full" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nouveau contact
          </Button>
        }
      />

      {/* Search bar */}
      <div className="gutter-x border-b border-border py-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher par nom, téléphone, email, ville..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-lg pl-9"
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {FILTRES.map((f) => {
            const nombre = f.cle === 'tous'
              ? contacts?.length
              : contacts?.filter(
                (c) => Boolean(resumes?.get(c.id)?.estClient) === (f.cle === 'clients'),
              ).length;
            return (
              <Button
                key={f.cle}
                type="button"
                size="sm"
                variant={filtre === f.cle ? 'default' : 'outline'}
                className="rounded-full"
                onClick={() => setFiltre(f.cle)}
              >
                {f.label}
                {nombre !== undefined && (
                  <span className="ml-1.5 tabular-nums opacity-70">{nombre}</span>
                )}
              </Button>
            );
          })}
        </div>
      </div>

      {/* Table */}
      <div className="defilement-contenu flex-1 overflow-y-auto scrollbar-thin">
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
              Ajoutez un contact pour commencer à suivre ses demandes et ses véhicules.
            </p>
            <Button className="mt-4 rounded-full" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Nouveau contact
            </Button>
          </div>
        )}

        {!isLoading && !isError && listeFiltree && listeFiltree.length > 0 && estMobile && (
          <ListeMobileContacts
            contacts={listeFiltree}
            resumes={resumes}
            onOuvrir={(contact) => ouvrirClient(contact.id)}
          />
        )}

        {!isLoading && !isError && listeFiltree && listeFiltree.length > 0 && !estMobile && (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-xs">Nom</TableHead>
                <TableHead className="text-xs">Téléphone</TableHead>
                <TableHead className="text-xs">Email</TableHead>
                <TableHead className="text-xs">Ville</TableHead>
                <TableHead className="text-xs">Interventions</TableHead>
                <TableHead className="text-xs">Dernière intervention</TableHead>
                <TableHead className="text-xs">Date de création</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {listeFiltree.map((contact) => (
                <ContactRow
                  key={contact.id}
                  contact={contact}
                  resume={resumes?.get(contact.id)}
                  onOpen={() => ouvrirClient(contact.id)}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* New contact dialog */}
      <CreateContactDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}

/**
 * Clients, en liste, sur téléphone.
 *
 * Sept colonnes ne tiennent pas sur 375 px : le tableau y devient une bande
 * qu'on fait glisser de côté pour lire une seule ligne. La carte ne garde que
 * ce qui sert à reconnaître quelqu'un — le nom, la ville, le nombre
 * d'interventions — et met l'appel à un doigt, puisque c'est ce qu'on vient
 * y faire.
 */
function ListeMobileContacts({
  contacts, resumes, onOuvrir,
}: {
  contacts: Contact[];
  resumes?: Map<string, ResumeClientListe>;
  onOuvrir: (contact: Contact) => void;
}) {
  return (
    <ul className="divide-y divide-border">
      {contacts.map((contact) => {
        const nom = [contact.first_name, contact.last_name]
          .filter(Boolean).join(' ') || 'Sans nom';
        const resume = resumes?.get(contact.id);
        const interventions = resume?.nbInterventions ?? 0;

        return (
          <li key={contact.id} className="flex items-stretch">
            <button
              type="button"
              onClick={() => onOuvrir(contact)}
              className="min-w-0 flex-1 px-4 py-3 text-left active:bg-muted/50"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 truncate text-sm font-medium text-foreground">
                  {nom}
                </span>
                <BadgeClient estClient={Boolean(resume?.estClient)} />
                {resume && resume.nbDossiersGlass > 0 && (
                  <Badge
                    variant="outline"
                    className="shrink-0 rounded-full border-primary/25 bg-primary/5 text-[10px] text-primary"
                  >
                    Glass
                  </Badge>
                )}
                {/* Un client qui revient est le renseignement le plus utile
                    de la ligne : il se voit sans etre cherche. */}
                {interventions > 0 && (
                  <Badge variant="secondary" className="shrink-0 rounded-full text-[10px]">
                    {interventions} interv.
                  </Badge>
                )}
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {contact.city && <span className="truncate">{contact.city}</span>}
                {contact.phone && <span className="tabular">{contact.phone}</span>}
                {resume?.derniereIntervention && (
                  <span>Dernière intervention {formatDateCourte(resume.derniereIntervention)}</span>
                )}
              </div>
            </button>

            {/* Appeler depuis la liste : c'est le geste du metier, il ne
                devrait pas couter l'ouverture d'une fiche. */}
            {contact.phone && (
              <a
                href={`tel:${contact.phone}`}
                aria-label={`Appeler ${nom}`}
                className="flex w-14 shrink-0 items-center justify-center border-l border-border text-primary active:bg-muted/50"
              >
                <Phone className="h-4 w-4" />
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ============ CONTACT ROW ============
function ContactRow({ contact, resume, onOpen }: {
  contact: Contact; resume?: ResumeClientListe; onOpen: () => void;
}) {
  const interventions = resume?.nbInterventions ?? 0;
  return (
    <TableRow className="cursor-pointer hover:bg-muted/40" onClick={onOpen}>
      <TableCell className="text-sm font-medium text-foreground">
        <span className="flex items-center gap-2">
          <span>{contact.first_name} {contact.last_name}</span>
          {resume && resume.nbDossiersGlass > 0 && (
            <Badge
              variant="outline"
              className="rounded-full border-primary/25 bg-primary/5 text-[10px] text-primary"
            >
              Glass
            </Badge>
          )}
        </span>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">{contact.phone || '—'}</TableCell>
      <TableCell className="text-sm text-muted-foreground">{contact.email || '—'}</TableCell>
      <TableCell className="text-sm text-muted-foreground">{contact.city || '—'}</TableCell>
      <TableCell className="text-sm tabular">
        {interventions > 0 ? (
          <span className={interventions > 1 ? 'font-medium text-foreground' : 'text-muted-foreground'}>
            {interventions}
          </span>
        ) : (
          <span className="text-muted-foreground/50">—</span>
        )}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
        {resume?.derniereIntervention
          ? formatDateCourte(resume.derniereIntervention)
          : '—'}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
        {new Date(contact.created_at).toLocaleDateString('fr-FR', {
          day: '2-digit', month: '2-digit', year: 'numeric',
        })}
      </TableCell>
    </TableRow>
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

  const [rechercheAdresse, setRechercheAdresse] = useState('');
  // Renseignes uniquement par la BAN : une saisie manuelle ne peut pas
  // inventer un code INSEE ni des coordonnees.
  const [geo, setGeo] = useState<{
    citycode: string | null; latitude: number | null; longitude: number | null;
  }>({ citycode: null, latitude: null, longitude: null });
  const villeChoisie = useRef<string | null>(null);

  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      first_name: '', last_name: '', phone: '', email: '',
      address: '', city: '', postal_code: '',
    },
  });

  const reinitialiser = () => {
    form.reset();
    setRechercheAdresse('');
    setGeo({ citycode: null, latitude: null, longitude: null });
    villeChoisie.current = null;
  };

  const mutation = useMutation({
    mutationFn: (values: ContactFormValues) => {
      // Si la ville a ete corrigee a la main apres la selection, le code INSEE
      // et les coordonnees ne correspondent plus : mieux vaut rien que faux.
      const geoValide = geo.citycode !== null && values.city === villeChoisie.current;

      return createContact({
        first_name: values.first_name,
        last_name: values.last_name,
        phone: values.phone,
        email: values.email || null,
        address: values.address || null,
        city: values.city || null,
        postal_code: values.postal_code || null,
        citycode: geoValide ? geo.citycode : null,
        latitude: geoValide ? geo.latitude : null,
        longitude: geoValide ? geo.longitude : null,
        sms_consent: false,
        email_consent: false,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      toast.success('Contact créé comme prospect');
      reinitialiser();
      onOpenChange(false);
    },
    onError: (err) => toast.error((err as Error)?.message || 'Erreur de création'),
  });

  const onSubmit = (values: ContactFormValues) => mutation.mutate(values);

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reinitialiser(); }}>
      <DialogContent className="max-w-lg sm:rounded-xl">
        <DialogHeader>
          <DialogTitle>Nouveau contact</DialogTitle>
          <DialogDescription>
            Il restera prospect jusqu’à la création de son dossier Glass Onify.
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
          <ChampAdresse
            label="Rechercher une adresse"
            valeur={rechercheAdresse}
            onValeurChange={setRechercheAdresse}
            onChoisir={(a) => {
              form.setValue('address', a.address ?? '');
              form.setValue('city', a.city ?? '');
              form.setValue('postal_code', a.postal_code ?? '');
              villeChoisie.current = a.city ?? '';
              setGeo({ citycode: a.citycode, latitude: a.latitude, longitude: a.longitude });
            }}
          />

          {/* Les trois champs restent visibles et corrigeables : la BAN ne
              connaît pas tout, et un complément d'adresse (bâtiment, étage,
              code) n'y figure jamais. */}
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

function formatDateCourte(date: string): string {
  return new Date(date).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
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
