import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BrainCircuit, CheckCircle2, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { fetchAiSettingsStatus, storeOpenAiKey } from './lead-ai-service';

export function AiSettingsPage() {
  const queryClient = useQueryClient();
  const [apiKey, setApiKey] = useState('');
  const queryKey = ['ai-settings-status'];
  const { data: status, isLoading } = useQuery({
    queryKey,
    queryFn: fetchAiSettingsStatus,
    retry: false,
  });
  const enregistrer = useMutation({
    mutationFn: () => storeOpenAiKey(apiKey),
    onSuccess: async () => {
      setApiKey('');
      await queryClient.invalidateQueries({ queryKey });
      toast.success('Clé OpenAI enregistrée dans le coffre sécurisé');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <>
      <PageHeader
        title="Assistant IA"
        description="Résumé des leads et aide à la prochaine action"
        action={
          <Badge
            variant="secondary"
            className={status?.configured ? 'rounded-full bg-success/10 text-success' : 'rounded-full'}
          >
            {status?.configured && <CheckCircle2 className="mr-1 h-3 w-3" />}
            {status?.configured ? 'Configuré' : 'À configurer'}
          </Badge>
        }
      />
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
          <Alert>
            <ShieldCheck className="h-4 w-4" />
            <AlertTitle>Le conseiller garde la décision</AlertTitle>
            <AlertDescription>
              L’IA lit la fiche, les commentaires et les échanges uniquement lorsque vous lancez l’analyse. Elle produit une suggestion sourcée, sans modifier le lead.
            </AlertDescription>
          </Alert>

          <Card className="rounded-xl p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <BrainCircuit className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-sm font-semibold">Modèle d’analyse</h2>
                <p className="mt-1 text-sm text-muted-foreground">GPT-5.6 Terra · raisonnement faible</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Le coût réel de chaque analyse est affiché dans la fiche du lead.
                </p>
              </div>
            </div>
          </Card>

          <Card className="rounded-xl p-5">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Clé API OpenAI</h2>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              La clé est envoyée directement à Supabase Vault. Elle ne sera ni enregistrée dans le navigateur ni réaffichée.
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <Input
                type="password"
                autoComplete="new-password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={status?.configured ? 'Laisser vide pour conserver la clé actuelle' : 'sk-…'}
                className="font-mono"
              />
              <Button
                className="shrink-0 rounded-full"
                disabled={apiKey.trim().length < 20 || enregistrer.isPending || isLoading}
                onClick={() => enregistrer.mutate()}
              >
                {enregistrer.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enregistrer
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
