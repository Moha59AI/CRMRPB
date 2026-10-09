// Aperçu de la liste des interventions, en développement seulement
//
// L'écran ne s'atteint qu'une fois connecté. Cette page monte ses cartes sur
// des interventions fabriquées, dans les cas qui font mal : sans adresse,
// sans téléphone, point au centre de commune, annulée, terminée, titre long,
// et une qui m'est affectée — la seule où l'action « Terminée » aboutirait.
//
// La route n'existe pas en production.

import { InterventionCarteListe } from '@/features/interventions/intervention-carte-liste';
import { InterventionsPage } from '@/features/interventions/interventions-page';
import type { Intervention } from '@/services/interventions-service';

function heure(h: number, m = 0): string {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

function intervention(p: Partial<Intervention> & { id: string }): Intervention {
  return {
    lead_id: 'lead-1',
    contact_id: null,
    assigned_user_id: null,
    titre: 'Intervention',
    debut: heure(9),
    fin: heure(10),
    statut: 'scheduled',
    adresse: null,
    ville: null,
    codePostal: null,
    citycode: null,
    latitude: null,
    longitude: null,
    geo_precision: null,
    client: null,
    telephone: null,
    immatriculation: null,
    ...p,
  };
}

const CAS: { note: string; i: Intervention; aMoi?: boolean }[] = [
  {
    note: 'Le cas courant : client, adresse localisée, téléphone',
    i: intervention({
      id: '1', debut: heure(8, 30), fin: heure(10),
      titre: 'Intervention - ABC TRAVAUX ET SERVICES (AB-123-CD)',
      client: 'Dorothée Vandeven',
      adresse: '12 Rue de Lens 59000 Lille',
      latitude: 50.62925, longitude: 3.05726, geo_precision: 'exact',
      telephone: '0612345678',
    }),
  },
  {
    note: 'M’est affectée : l’action « Terminée » aboutirait',
    i: intervention({
      id: '2', debut: heure(10, 30), fin: heure(11, 30),
      titre: 'Pare-brise Clio (EF-456-GH)',
      client: 'Ahmed Kacet',
      adresse: '5 Avenue de la Marne 59290 Wasquehal',
      latitude: 50.6742, longitude: 3.1312, geo_precision: 'exact',
      telephone: '0698765432',
      assigned_user_id: 'moi', statut: 'confirmed',
    }),
    aMoi: true,
  },
  {
    note: 'Point au centre de commune : on n’y envoie personne les yeux fermés',
    i: intervention({
      id: '3', debut: heure(14), fin: heure(16),
      titre: 'Intervention - Garage du Nord (CD-234-EF) remplacement complet avec recalibrage caméra',
      adresse: 'Tourcoing',
      latitude: 50.7239, longitude: 3.1612, geo_precision: 'approximatif',
      telephone: '0320001122',
    }),
  },
  {
    note: 'Ni adresse ni téléphone : les actions disent pourquoi',
    i: intervention({ id: '4', debut: heure(16, 30), fin: heure(17), titre: 'Intervention' }),
  },
  {
    note: 'Terminée, puis annulée',
    i: intervention({
      id: '5', debut: heure(7), fin: heure(8),
      titre: 'Lunette arrière Scénic (YZ-901-AB)',
      client: 'Sophie Leroy',
      adresse: '7 Rue Jean Jaurès 59170 Croix',
      latitude: 50.6782, longitude: 3.1502, geo_precision: 'exact',
      telephone: '0611223344', statut: 'completed',
    }),
  },
  {
    note: '',
    i: intervention({
      id: '6', debut: heure(17, 30), fin: heure(18, 30),
      titre: 'Pare-brise Peugeot 208 (GH-567-IJ)',
      client: 'Marc Dubois',
      adresse: '2 Place du Général de Gaulle 59000 Lille',
      telephone: '0655667788', statut: 'cancelled',
    }),
  },
];

export function ApercuInterventions() {
  const rien = () => {};

  return (
    <div className="min-h-full bg-background">
      <p className="gutter-x bg-warning/10 py-2 text-xs text-foreground">
        Aperçu de développement — interventions fabriquées, aucune requête.
      </p>

      <div className="gutter-x space-y-6 py-5">
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Les cartes, à la largeur d’un téléphone
          </h2>
          <div className="max-w-[359px] space-y-3">
            {CAS.map(({ note, i, aMoi }) => (
              <div key={i.id}>
                {note && <p className="mb-1 text-[11px] text-faint">{note}</p>}
                <InterventionCarteListe
                  intervention={i}
                  onOuvrir={rien}
                  aMoi={Boolean(aMoi)}
                  onTerminer={rien}
                />
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            L’écran complet, sans session
          </h2>
          {/* Ses requetes echouent faute de session : c'est l'etat d'erreur
              qui s'affiche, et c'est aussi un cas a verifier. L'en-tete et
              les onglets, eux, sont ceux de production. */}
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <InterventionsPage />
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Les cartes en pleine largeur
          </h2>
          <div className="max-w-2xl space-y-2">
            {CAS.map(({ i, aMoi }) => (
              <InterventionCarteListe
                key={i.id}
                intervention={i}
                onOuvrir={rien}
                aMoi={Boolean(aMoi)}
                onTerminer={rien}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
