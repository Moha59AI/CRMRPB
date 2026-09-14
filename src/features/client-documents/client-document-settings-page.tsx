import { useEffect, type ReactNode } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, FileCheck2, Link2, Loader2, RotateCcw, Save, ShieldCheck } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/features/auth/auth-context';
import { messageErreurBase } from '@/lib/erreurs';
import {
  CLIENT_DOCUMENT_TYPES,
  DEFAULT_CLIENT_DOCUMENT_PORTAL_SETTINGS,
  fetchClientDocumentPortalSettings,
  saveClientDocumentPortalSettings,
  type ClientDocumentPortalSettings,
} from './client-document-settings-service';

const schema = z.object({
  page_title: z.string().trim().min(3, 'Saisissez un titre').max(90, '90 caractères maximum'),
  page_intro: z.string().trim().min(3, 'Saisissez une introduction').max(400, '400 caractères maximum'),
  completion_title: z.string().trim().min(3, 'Saisissez un titre de confirmation').max(100, '100 caractères maximum'),
  completion_message: z.string().trim().min(3, 'Saisissez un message de confirmation').max(500, '500 caractères maximum'),
  show_gift: z.boolean(),
  document_rules: z.array(z.object({
    document_type: z.enum(CLIENT_DOCUMENT_TYPES),
    label: z.string().trim().min(1, 'Libellé requis').max(80, '80 caractères maximum'),
    enabled: z.boolean(),
    required: z.boolean(),
  })).length(CLIENT_DOCUMENT_TYPES.length),
}).superRefine((values, context) => {
  if (!values.document_rules.some((rule) => rule.enabled)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['document_rules'], message: 'Activez au moins un document.' });
  }
  if (!values.document_rules.some((rule) => rule.enabled && rule.required)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['document_rules'], message: 'Gardez au moins un document obligatoire.' });
  }
});

const cloneDefaults = (): ClientDocumentPortalSettings => ({
  ...DEFAULT_CLIENT_DOCUMENT_PORTAL_SETTINGS,
  document_rules: DEFAULT_CLIENT_DOCUMENT_PORTAL_SETTINGS.document_rules.map((rule) => ({ ...rule })),
});

export function ClientDocumentSettingsPage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const modifiable = profile?.role === 'admin' || profile?.role === 'manager';
  const query = useQuery({
    queryKey: ['client-document-portal-settings'],
    queryFn: fetchClientDocumentPortalSettings,
    retry: false,
  });
  const form = useForm<ClientDocumentPortalSettings>({
    resolver: zodResolver(schema),
    defaultValues: cloneDefaults(),
  });

  useEffect(() => {
    if (query.data) form.reset(query.data);
  }, [form, query.data]);

  const save = useMutation({
    mutationFn: saveClientDocumentPortalSettings,
    onSuccess: async (_result, values) => {
      queryClient.setQueryData(['client-document-portal-settings'], values);
      form.reset(values);
      await queryClient.invalidateQueries({ queryKey: ['client-document-portal-settings'] });
      toast.success('Page de documents mise à jour');
    },
    onError: (error: Error) => toast.error(messageErreurBase(error.message)),
  });

  const rules = form.watch('document_rules');
  const title = form.watch('page_title');
  const intro = form.watch('page_intro');
  const completionTitle = form.watch('completion_title');
  const completionMessage = form.watch('completion_message');
  const showGift = form.watch('show_gift');
  const rulesError = form.formState.errors.document_rules?.message;
  const queryErrorMessage = query.error instanceof Error ? query.error.message : '';
  const missingMigration = queryErrorMessage.includes('client_document_portal_settings');

  const restoreDefaults = () => {
    const values = cloneDefaults();
    form.setValue('page_title', values.page_title, { shouldDirty: true, shouldValidate: true });
    form.setValue('page_intro', values.page_intro, { shouldDirty: true, shouldValidate: true });
    form.setValue('completion_title', values.completion_title, { shouldDirty: true, shouldValidate: true });
    form.setValue('completion_message', values.completion_message, { shouldDirty: true, shouldValidate: true });
    form.setValue('show_gift', values.show_gift, { shouldDirty: true, shouldValidate: true });
    form.setValue('document_rules', values.document_rules, { shouldDirty: true, shouldValidate: true });
  };

  return (
    <>
      <PageHeader
        title="Demande de documents"
        description="Personnalisez ce que vos clients voient et les pièces demandées"
        action={modifiable ? (
          <Button
            form="client-document-settings-form"
            type="submit"
            className="w-full rounded-full sm:w-auto"
            disabled={save.isPending || !form.formState.isDirty}
          >
            {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Enregistrer
          </Button>
        ) : undefined}
      />

      <div className="overflow-y-auto p-4 sm:p-6">
        {query.isLoading && (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <Skeleton className="h-[620px] rounded-xl" />
            <Skeleton className="h-[520px] rounded-xl" />
          </div>
        )}

        {query.isError && (
          <Card className="rounded-xl border-destructive/30">
            <CardContent className="p-6 text-center">
              <p className="text-sm font-medium text-destructive">Réglage indisponible</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {missingMigration
                  ? 'La migration des réglages documentaires doit être appliquée dans Supabase avant d’utiliser cet écran.'
                  : messageErreurBase(queryErrorMessage)}
              </p>
              <Button variant="outline" className="mt-4 rounded-full" onClick={() => query.refetch()}>
                Réessayer
              </Button>
            </CardContent>
          </Card>
        )}

        {query.data && (
          <form
            id="client-document-settings-form"
            className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]"
            onSubmit={form.handleSubmit((values) => save.mutate(values))}
          >
            <div className="space-y-5">
              <Card className="rounded-xl">
                <CardHeader>
                  <CardTitle className="text-base">Textes affichés au client</CardTitle>
                  <CardDescription>Ces changements apparaissent aussi sur les liens déjà envoyés.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <TextField
                    id="page-title"
                    label="Titre principal"
                    error={form.formState.errors.page_title?.message}
                  >
                    <Input id="page-title" maxLength={90} disabled={!modifiable} {...form.register('page_title')} />
                  </TextField>
                  <TextField
                    id="page-intro"
                    label="Texte d’introduction"
                    error={form.formState.errors.page_intro?.message}
                  >
                    <Textarea id="page-intro" rows={3} maxLength={400} disabled={!modifiable} {...form.register('page_intro')} />
                  </TextField>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TextField
                      id="completion-title"
                      label="Titre après réception"
                      error={form.formState.errors.completion_title?.message}
                    >
                      <Input id="completion-title" maxLength={100} disabled={!modifiable} {...form.register('completion_title')} />
                    </TextField>
                    <TextField
                      id="completion-message"
                      label="Message après réception"
                      error={form.formState.errors.completion_message?.message}
                    >
                      <Textarea id="completion-message" rows={3} maxLength={500} disabled={!modifiable} {...form.register('completion_message')} />
                    </TextField>
                  </div>
                  <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-4">
                    <div>
                      <Label htmlFor="show-gift" className="text-sm font-medium">Afficher le cadeau choisi</Label>
                      <p className="mt-1 text-xs text-muted-foreground">Le cadeau réel du lead reste visible pour rassurer le client.</p>
                    </div>
                    <Switch
                      id="show-gift"
                      checked={showGift}
                      disabled={!modifiable}
                      onCheckedChange={(checked) => form.setValue('show_gift', checked, { shouldDirty: true })}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-xl">
                <CardHeader>
                  <CardTitle className="text-base">Documents demandés</CardTitle>
                  <CardDescription>Les changements s’appliquent aux nouveaux liens et aux demandes encore ouvertes.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {rules.map((rule, index) => (
                    <div key={rule.document_type} className="grid gap-3 rounded-xl border border-border p-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
                      <TextField
                        id={`document-label-${index}`}
                        label="Nom du document"
                        error={form.formState.errors.document_rules?.[index]?.label?.message}
                      >
                        <Input
                          id={`document-label-${index}`}
                          maxLength={80}
                          readOnly={!modifiable || !rule.enabled}
                          className={!rule.enabled ? 'opacity-60' : undefined}
                          {...form.register(`document_rules.${index}.label`)}
                        />
                      </TextField>
                      <ToggleField label="Afficher">
                        <Switch
                          checked={rule.enabled}
                          disabled={!modifiable}
                          onCheckedChange={(checked) => {
                            form.setValue(`document_rules.${index}.enabled`, checked, { shouldDirty: true, shouldValidate: true });
                            if (!checked) form.setValue(`document_rules.${index}.required`, false, { shouldDirty: true, shouldValidate: true });
                          }}
                        />
                      </ToggleField>
                      <ToggleField label="Obligatoire">
                        <Switch
                          checked={rule.required}
                          disabled={!modifiable || !rule.enabled}
                          onCheckedChange={(checked) => form.setValue(`document_rules.${index}.required`, checked, { shouldDirty: true, shouldValidate: true })}
                        />
                      </ToggleField>
                    </div>
                  ))}
                  {rulesError && <p className="text-xs font-medium text-destructive">{rulesError}</p>}
                </CardContent>
              </Card>

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Button type="button" variant="ghost" className="rounded-full" disabled={!modifiable} onClick={restoreDefaults}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Valeurs par défaut
                </Button>
                <Button
                  type="submit"
                  className="rounded-full"
                  disabled={!modifiable || save.isPending || !form.formState.isDirty}
                >
                  {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Enregistrer les modifications
                </Button>
              </div>
            </div>

            <div className="space-y-4 xl:sticky xl:top-4">
              <Card className="rounded-xl border-primary/25">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Eye className="h-4 w-4 text-primary" />
                    <CardTitle className="text-base">Aperçu client</CardTitle>
                  </div>
                  <CardDescription>L’aperçu se met à jour pendant la saisie.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-hidden rounded-xl border border-border bg-[hsl(var(--surface))]">
                    <div className="border-b border-border bg-card px-4 py-3 text-xs font-semibold">Relais Pare-Brise</div>
                    <div className="space-y-4 p-4">
                      <div>
                        <p className="text-xs font-medium text-primary">Bonjour Mohamed,</p>
                        <p className="mt-1 text-lg font-semibold leading-tight">{title || 'Titre de la page'}</p>
                        <p className="mt-2 text-xs leading-5 text-muted-foreground">{intro || 'Texte d’introduction'}</p>
                      </div>
                      {showGift && (
                        <div className="rounded-lg border border-primary/20 bg-accent p-3">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">Votre cadeau est réservé</p>
                          <p className="mt-1 text-xs font-semibold">Nintendo Switch OLED</p>
                        </div>
                      )}
                      <div className="space-y-2">
                        {rules.filter((rule) => rule.enabled).map((rule) => (
                          <div key={rule.document_type} className="flex items-center gap-2 rounded-lg border border-border bg-card p-3">
                            <FileCheck2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="min-w-0 flex-1 truncate text-xs font-medium">{rule.label || 'Document'}</span>
                            <Badge variant="secondary" className="rounded-full text-[9px]">
                              {rule.required ? 'Obligatoire' : 'Facultatif'}
                            </Badge>
                          </div>
                        ))}
                      </div>
                      <div className="rounded-lg border border-done/30 bg-done-soft p-3">
                        <p className="flex items-center gap-1.5 text-xs font-semibold text-done">
                          <ShieldCheck className="h-3.5 w-3.5" />
                          {completionTitle || 'Confirmation'}
                        </p>
                        <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{completionMessage || 'Message de confirmation'}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-xl">
                <CardContent className="flex items-start gap-3 p-4">
                  <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Lien client raccourci</p>
                    <code className="mt-2 block break-all rounded-lg bg-muted px-3 py-2 text-xs">crm.relaisparebrise.fr/d/••••••••</code>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">Les anciens liens restent valables jusqu’à leur expiration.</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </form>
        )}
      </div>
    </>
  );
}

function TextField({
  id, label, error, children,
}: {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}

function ToggleField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-center">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
