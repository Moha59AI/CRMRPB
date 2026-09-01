import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Clock, MapPin, Pencil, Check, X, Loader2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  fetchReglagesEntreprise, enregistrerReglagesEntreprise,
  type ReglagesEntreprise, type HoraireJour,
} from '@/services/admin-service';

const schema = z.object({
  nom: z.string().min(1, "Le nom de l'entreprise est requis"),
  adresse: z.string(),
  telephone: z.string(),
  email: z.string().email('Adresse invalide').or(z.literal('')),
  site_web: z.string(),
  siret: z.string(),
  zonesTexte: z.string(),
});

type Formulaire = z.infer<typeof schema>;

interface SectionEntrepriseProps {
  /** Un responsable consulte les réglages ; seul un administrateur les change. */
  modifiable: boolean;
}

export function SectionEntreprise({ modifiable }: SectionEntrepriseProps) {
  const queryClient = useQueryClient();
  const [edition, setEdition] = useState(false);

  const { data: reglages, isLoading } = useQuery({
    queryKey: ['reglages-entreprise'],
    queryFn: fetchReglagesEntreprise,
  });

  const [horaires, setHoraires] = useState<HoraireJour[]>([]);
  const [preferences, setPreferences] = useState({
    detection_doublons: true,
    attribution_auto: false,
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<Formulaire>({
    resolver: zodResolver(schema),
    defaultValues: {
      nom: '', adresse: '', telephone: '', email: '', site_web: '', siret: '', zonesTexte: '',
    },
  });

  // Les valeurs arrivent apres le premier rendu : sans ce reset, le formulaire
  // resterait vide alors que la requete a repondu.
  useEffect(() => {
    if (!reglages) return;
    reset({
      nom: reglages.nom,
      adresse: reglages.adresse,
      telephone: reglages.telephone,
      email: reglages.email,
      site_web: reglages.site_web,
      siret: reglages.siret,
      zonesTexte: reglages.zones.join(', '),
    });
    setHoraires(reglages.horaires);
    setPreferences(reglages.preferences);
  }, [reglages, reset]);

  const mutation = useMutation({
    mutationFn: (v: ReglagesEntreprise) => enregistrerReglagesEntreprise(v),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reglages-entreprise'] });
      toast.success('Réglages enregistrés');
      setEdition(false);
    },
    onError: (e: Error) =>
      toast.error("L'enregistrement a échoué", { description: e.message }),
  });

  const soumettre = (v: Formulaire) => {
    mutation.mutate({
      nom: v.nom,
      adresse: v.adresse,
      telephone: v.telephone,
      email: v.email,
      site_web: v.site_web,
      siret: v.siret,
      zones: v.zonesTexte.split(',').map((z) => z.trim()).filter(Boolean),
      horaires,
      preferences,
    });
  };

  const annuler = () => {
    if (reglages) {
      reset({
        nom: reglages.nom, adresse: reglages.adresse, telephone: reglages.telephone,
        email: reglages.email, site_web: reglages.site_web, siret: reglages.siret,
        zonesTexte: reglages.zones.join(', '),
      });
      setHoraires(reglages.horaires);
      setPreferences(reglages.preferences);
    }
    setEdition(false);
  };

  const majHoraire = (index: number, champ: Partial<HoraireJour>) => {
    setHoraires((h) => h.map((j, i) => (i === index ? { ...j, ...champ } : j)));
  };

  if (isLoading) {
    return (
      <Card className="rounded-xl border border-border">
        <CardContent className="space-y-3 p-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-lg" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit(soumettre)} className="space-y-6" noValidate>
      <Card className="rounded-xl border border-border">
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted/40">
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <CardTitle className="text-sm">Informations de l'entreprise</CardTitle>
              <CardDescription className="text-xs">
                Coordonnées reprises sur les devis, factures et communications
              </CardDescription>
            </div>
          </div>

          {!modifiable ? (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="h-3.5 w-3.5" />
              Lecture seule
            </span>
          ) : !edition ? (
            <Button
              type="button" variant="outline" size="sm" className="rounded-full"
              onClick={() => setEdition(true)}
            >
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              Modifier
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                type="button" variant="outline" size="sm" className="rounded-full"
                onClick={annuler}
              >
                <X className="mr-1.5 h-3.5 w-3.5" />
                Annuler
              </Button>
              <Button type="submit" size="sm" className="rounded-full" disabled={mutation.isPending}>
                {mutation.isPending
                  ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  : <Check className="mr-1.5 h-3.5 w-3.5" />}
                Enregistrer
              </Button>
            </div>
          )}
        </CardHeader>

        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Champ label="Nom de l'entreprise" erreur={errors.nom?.message}>
            <Input className="rounded-lg" disabled={!edition} {...register('nom')} />
          </Champ>
          <Champ label="SIRET">
            <Input className="rounded-lg" disabled={!edition} {...register('siret')} />
          </Champ>
          <Champ label="Adresse">
            <Input className="rounded-lg" disabled={!edition} {...register('adresse')} />
          </Champ>
          <Champ label="Téléphone">
            <Input className="rounded-lg" disabled={!edition} {...register('telephone')} />
          </Champ>
          <Champ label="Email" erreur={errors.email?.message}>
            <Input type="email" className="rounded-lg" disabled={!edition} {...register('email')} />
          </Champ>
          <Champ label="Site web">
            <Input className="rounded-lg" disabled={!edition} {...register('site_web')} />
          </Champ>
        </CardContent>
      </Card>

      <Card className="rounded-xl border border-border">
        <CardHeader className="flex flex-row items-start space-y-0">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted/40">
              <MapPin className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <CardTitle className="text-sm">Zones d'intervention</CardTitle>
              <CardDescription className="text-xs">
                Villes et secteurs desservis, séparés par des virgules
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Textarea
            className="min-h-[80px] rounded-lg"
            disabled={!edition}
            placeholder="Lille, Roubaix, Tourcoing, Villeneuve-d'Ascq…"
            {...register('zonesTexte')}
          />
        </CardContent>
      </Card>

      <Card className="rounded-xl border border-border">
        <CardHeader className="flex flex-row items-start space-y-0">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted/40">
              <Clock className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <CardTitle className="text-sm">Horaires d'ouverture</CardTitle>
              <CardDescription className="text-xs">
                Utilisés pour proposer des créneaux de rendez-vous cohérents
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-border rounded-lg border border-border">
            {horaires.map((j, i) => (
              <div key={j.jour} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-24 text-sm text-foreground">{j.jour}</span>

                <Switch
                  checked={j.ouvert}
                  disabled={!edition}
                  onCheckedChange={(v) => majHoraire(i, { ouvert: v })}
                  aria-label={`${j.jour} ouvert`}
                />

                {j.ouvert ? (
                  <div className="flex items-center gap-2">
                    <Input
                      type="time" value={j.debut} disabled={!edition}
                      onChange={(e) => majHoraire(i, { debut: e.target.value })}
                      className="h-8 w-28 rounded-lg text-sm"
                      aria-label={`${j.jour} ouverture`}
                    />
                    <span className="text-xs text-muted-foreground">à</span>
                    <Input
                      type="time" value={j.fin} disabled={!edition}
                      onChange={(e) => majHoraire(i, { fin: e.target.value })}
                      className="h-8 w-28 rounded-lg text-sm"
                      aria-label={`${j.jour} fermeture`}
                    />
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">Fermé</span>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-xl border border-border">
        <CardHeader className="flex flex-row items-start space-y-0">
          <div className="space-y-1">
            <CardTitle className="text-sm">Comportements automatiques</CardTitle>
            <CardDescription className="text-xs">
              Ce que le CRM fait sans qu'on le lui demande
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="divide-y divide-border">
          <LignePreference
            titre="Détection des doublons"
            description="Signaler un lead dont le téléphone, l'email ou l'immatriculation existe déjà"
            actif={preferences.detection_doublons}
            disabled={!edition}
            onChange={(v) => setPreferences((p) => ({ ...p, detection_doublons: v }))}
          />
          <LignePreference
            titre="Attribution automatique"
            description="Assigner chaque nouveau lead à un conseiller disponible"
            actif={preferences.attribution_auto}
            disabled={!edition}
            onChange={(v) => setPreferences((p) => ({ ...p, attribution_auto: v }))}
          />
        </CardContent>
      </Card>
    </form>
  );
}

function Champ({
  label, erreur, children,
}: { label: string; erreur?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
      {erreur && <p className="text-xs text-destructive">{erreur}</p>}
    </div>
  );
}

function LignePreference({
  titre, description, actif, disabled, onChange,
}: {
  titre: string; description: string; actif: boolean;
  disabled: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-4 first:pt-0 last:pb-0">
      <div className="pr-4">
        <p className="text-sm font-medium text-foreground">{titre}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={actif} disabled={disabled} onCheckedChange={onChange} aria-label={titre} />
    </div>
  );
}
