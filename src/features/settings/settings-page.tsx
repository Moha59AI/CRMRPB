import { useState } from 'react';
import { Building2, Clock, MapPin, Bell, Shield, Users, Pencil, Check, X } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/features/auth/auth-context';

interface CompanyInfo {
  name: string;
  address: string;
  phone: string;
  email: string;
  website: string;
}

const OPENING_HOURS: { day: string; hours: string }[] = [
  { day: 'Lundi', hours: '08:00 – 18:00' },
  { day: 'Mardi', hours: '08:00 – 18:00' },
  { day: 'Mercredi', hours: '08:00 – 18:00' },
  { day: 'Jeudi', hours: '08:00 – 18:00' },
  { day: 'Vendredi', hours: '08:00 – 18:00' },
  { day: 'Samedi', hours: '09:00 – 16:00' },
  { day: 'Dimanche', hours: 'Fermé' },
];

export function SettingsPage() {
  const { profile } = useAuth();

  const [company, setCompany] = useState<CompanyInfo>({
    name: 'Relais Pare-Brise',
    address: '12 Rue des Artisans, 75011 Paris',
    phone: '+33 1 23 45 67 89',
    email: 'contact@relaisparebrise.fr',
    website: 'www.relaisparebrise.fr',
  });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<CompanyInfo>(company);

  const [zones, setZones] = useState(
    'Paris, Lyon, Marseille, Toulouse, Bordeaux, Lille, Nantes, Strasbourg, Nice, Rennes',
  );

  const [prefs, setPrefs] = useState({
    emailNotifications: true,
    smsNotifications: false,
    autoAssignLeads: true,
    duplicateDetection: true,
  });

  const startEdit = () => {
    setDraft(company);
    setEditing(true);
  };
  const cancelEdit = () => setEditing(false);
  const saveEdit = () => {
    setCompany(draft);
    setEditing(false);
  };

  return (
    <>
      <PageHeader title="Réglages" description="Configuration du CRM" />

      <div className="space-y-6 overflow-y-auto p-6">
        {/* Informations de l'entreprise */}
        <Card className="rounded-xl border border-border">
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted/40">
                <Building2 className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <CardTitle className="text-sm">Informations de l'entreprise</CardTitle>
                <CardDescription className="text-xs">
                  Coordonnées affichées sur les documents et communications
                </CardDescription>
              </div>
            </div>
            {!editing ? (
              <Button variant="outline" size="sm" className="rounded-full" onClick={startEdit}>
                <Pencil className="mr-1.5 h-3.5 w-3.5" />
                Modifier
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="rounded-full" onClick={cancelEdit}>
                  <X className="mr-1.5 h-3.5 w-3.5" />
                  Annuler
                </Button>
                <Button size="sm" className="rounded-full" onClick={saveEdit}>
                  <Check className="mr-1.5 h-3.5 w-3.5" />
                  Enregistrer
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {editing ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Nom de l'entreprise">
                  <Input
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    className="rounded-lg"
                  />
                </Field>
                <Field label="Adresse">
                  <Input
                    value={draft.address}
                    onChange={(e) => setDraft({ ...draft, address: e.target.value })}
                    className="rounded-lg"
                  />
                </Field>
                <Field label="Téléphone">
                  <Input
                    value={draft.phone}
                    onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                    className="rounded-lg"
                  />
                </Field>
                <Field label="Email">
                  <Input
                    type="email"
                    value={draft.email}
                    onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                    className="rounded-lg"
                  />
                </Field>
                <Field label="Site web">
                  <Input
                    value={draft.website}
                    onChange={(e) => setDraft({ ...draft, website: e.target.value })}
                    className="rounded-lg"
                  />
                </Field>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <ReadOnlyField label="Nom de l'entreprise" value={company.name} />
                <ReadOnlyField label="Adresse" value={company.address} />
                <ReadOnlyField label="Téléphone" value={company.phone} />
                <ReadOnlyField label="Email" value={company.email} />
                <ReadOnlyField label="Site web" value={company.website} />
                <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground">
                  <Shield className="h-3.5 w-3.5 shrink-0" />
                  Espace de travail géré via Supabase
                  {profile?.role === 'admin' && ' — vous pouvez modifier ces informations'}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Zones d'intervention */}
        <Card className="rounded-xl border border-border">
          <CardHeader className="flex flex-row items-start space-y-0">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted/40">
                <MapPin className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <CardTitle className="text-sm">Zones d'intervention</CardTitle>
                <CardDescription className="text-xs">
                  Villes et régions desservies par votre atelier
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Textarea
              value={zones}
              onChange={(e) => setZones(e.target.value)}
              className="min-h-[80px] rounded-lg"
              placeholder="Listez les villes séparées par des virgules…"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              {zones
                .split(',')
                .map((z) => z.trim())
                .filter(Boolean).length}{' '}
              zone(s) renseignée(s)
            </p>
          </CardContent>
        </Card>

        {/* Horaires d'ouverture */}
        <Card className="rounded-xl border border-border">
          <CardHeader className="flex flex-row items-start space-y-0">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted/40">
                <Clock className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <CardTitle className="text-sm">Horaires d'ouverture</CardTitle>
                <CardDescription className="text-xs">
                  Plages horaires de votre atelier
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border rounded-lg border border-border">
              {OPENING_HOURS.map((row) => {
                const closed = row.hours.toLowerCase() === 'fermé';
                return (
                  <div
                    key={row.day}
                    className="flex items-center justify-between px-4 py-2.5 text-sm"
                  >
                    <span className="text-foreground">{row.day}</span>
                    <span className={closed ? 'text-muted-foreground' : 'text-muted-foreground'}>
                      {row.hours}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Préférences */}
        <Card className="rounded-xl border border-border">
          <CardHeader className="flex flex-row items-start space-y-0">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted/40">
                <Bell className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <CardTitle className="text-sm">Préférences</CardTitle>
                <CardDescription className="text-xs">
                  Comportements automatiques du CRM
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            <ToggleRow
              icon={<Bell className="h-4 w-4 text-muted-foreground" />}
              title="Notifications email"
              description="Recevoir un email lors d'un nouveau lead ou dossier"
              checked={prefs.emailNotifications}
              onChange={(v) => setPrefs({ ...prefs, emailNotifications: v })}
            />
            <ToggleRow
              icon={<Bell className="h-4 w-4 text-muted-foreground" />}
              title="Notifications SMS"
              description="Recevoir un SMS pour les leads prioritaires"
              checked={prefs.smsNotifications}
              onChange={(v) => setPrefs({ ...prefs, smsNotifications: v })}
            />
            <ToggleRow
              icon={<Users className="h-4 w-4 text-muted-foreground" />}
              title="Attribution automatique des leads"
              description="Assigner les nouveaux leads à un conseiller disponible"
              checked={prefs.autoAssignLeads}
              onChange={(v) => setPrefs({ ...prefs, autoAssignLeads: v })}
            />
            <ToggleRow
              icon={<Shield className="h-4 w-4 text-muted-foreground" />}
              title="Détection des doublons"
              description="Signaler les leads avec téléphone, email ou immatriculation identique"
              checked={prefs.duplicateDetection}
              onChange={(v) => setPrefs({ ...prefs, duplicateDetection: v })}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value}</p>
    </div>
  );
}

function ToggleRow({
  icon,
  title,
  description,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-4 first:pt-0 last:pb-0">
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{icon}</div>
        <div>
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
