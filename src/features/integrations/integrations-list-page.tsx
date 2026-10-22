import { BarChart3, BrainCircuit, DatabaseZap, Mail, Megaphone as MetaIcon, Webhook, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface IntegrationCard {
  name: string;
  description: string;
  icon: typeof MetaIcon;
  path: string;
  available: boolean;
}

const integrations: IntegrationCard[] = [
  {
    name: 'Assistant IA',
    description: 'Résumés sourcés des leads, lecture des commentaires et prochaine action suggérée.',
    icon: BrainCircuit,
    path: '/settings/integrations/ai',
    available: true,
  },
  {
    name: 'Onify',
    description: 'Copie en lecture seule des clients, notes, appels, devis, factures et avoirs vers ce CRM.',
    icon: DatabaseZap,
    path: '/settings/integrations/onify',
    available: true,
  },
  {
    name: 'Emails et signature',
    description: 'Boîte IONOS, signature professionnelle et rattachement automatique des emails aux clients.',
    icon: Mail,
    path: '/settings/integrations/email',
    available: true,
  },
  {
    name: 'Google Ads',
    description: "Coûts, clics et attribution jusqu'aux rendez-vous et interventions du CRM.",
    icon: BarChart3,
    path: '/settings/integrations/google',
    available: true,
  },
  {
    name: 'Meta Ads',
    description: 'Réception des leads Facebook/Instagram, Conversions API et mapping des formulaires.',
    icon: MetaIcon,
    path: '/settings/integrations/meta',
    available: true,
  },
  {
    name: 'Webhooks',
    description: 'Webhooks entrants pour recevoir des prospects d\'autres sources.',
    icon: Webhook,
    path: '/settings/webhooks',
    available: true,
  },
];

export function IntegrationsListPage() {
  return (
    <>
      <PageHeader
        title="Intégrations"
        description="Connexions aux services externes"
        action={
          <Button variant="outline" className="rounded-full" disabled>
            <Plus className="mr-2 h-4 w-4" />
            Ajouter
          </Button>
        }
      />
      <div className="p-3 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          {integrations.map((integration) => {
            const Icon = integration.icon;
            return (
              <Link key={integration.name} to={integration.path}>
                <Card className="group cursor-pointer rounded-xl border border-border p-5 transition hover:border-primary/30 hover:shadow-sm">
                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/50">
                      <Icon className="h-5 w-5 text-foreground" strokeWidth={1.75} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-foreground">{integration.name}</h3>
                        {integration.available && (
                          <Badge variant="secondary" className="rounded-full text-[10px]">
                            Disponible
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{integration.description}</p>
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
