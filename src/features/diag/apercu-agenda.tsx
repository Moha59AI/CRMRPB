// Aperçu de l'agenda, en développement seulement
//
// L'agenda ne s'atteint qu'une fois connecté. Cette page monte ses trois vues
// sur une semaine fabriquée, pour juger la mise en page au format téléphone :
// une journée chargée, des rendez-vous qui se chevauchent, des titres longs,
// une adresse par rendez-vous.
//
// La route n'existe pas en production.

import { useState } from 'react';
import { CalendarPage, DayView, MonthView, WeekView } from '@/features/calendar/calendar-page';
import type { Appointment } from '@/types';

const LUNDI = new Date(2026, 9, 5, 0, 0, 0);

function jour(decalage: number): Date {
  const d = new Date(LUNDI);
  d.setDate(d.getDate() + decalage);
  return d;
}

function rdv(
  id: string,
  decalageJour: number,
  heure: number,
  minutes: number,
  duree: number,
  title: string,
  address: string | null,
  status: Appointment['status'] = 'scheduled',
): Appointment {
  const debut = jour(decalageJour);
  debut.setHours(heure, minutes, 0, 0);
  const fin = new Date(debut.getTime() + duree * 60_000);

  return {
    id,
    workspace_id: 'apercu',
    case_id: null,
    lead_id: null,
    contact_id: null,
    assigned_user_id: null,
    title,
    description: null,
    start_time: debut.toISOString(),
    end_time: fin.toISOString(),
    address,
    type: 'intervention',
    status,
    citycode: null,
    latitude: null,
    longitude: null,
    geo_precision: null,
    google_calendar_event_id: null,
    google_calendar_html_link: null,
    google_calendar_updated_at: null,
    google_calendar_payload_hash: null,
    google_calendar_origin: null,
    offer: null,
    created_at: debut.toISOString(),
    updated_at: debut.toISOString(),
  };
}

const SEMAINE: Appointment[] = [
  rdv('1', 0, 8, 30, 90, 'Intervention - ABC TRAVAUX ET SERVICES (AB-123-CD)', '12 Rue de Lens 59000 Lille'),
  rdv('2', 0, 10, 30, 60, 'Pare-brise Clio (EF-456-GH)', '5 Avenue de la Marne 59290 Wasquehal'),
  // Deux rendez-vous qui se chevauchent : le placement doit les mettre côte à côte.
  rdv('3', 0, 14, 0, 120, 'Intervention - Dorothée Vandeven (IJ-789-KL)', '3 Rue du Molinel 59800 Lille'),
  rdv('4', 0, 14, 30, 60, 'Vitre latérale Kangoo (MN-012-OP)', '8 Rue Nationale 59000 Lille', 'confirmed'),
  rdv('5', 1, 9, 0, 30, 'Rappel garantie (QR-345-ST)', '14 Rue de Paris 59100 Roubaix'),
  rdv('6', 1, 11, 0, 90, 'Intervention - Ahmed Kacet (UV-678-WX)', '22 Boulevard de la Liberté 59000 Lille'),
  rdv('7', 2, 8, 0, 60, 'Lunette arrière Scénic (YZ-901-AB)', '7 Rue Jean Jaurès 59170 Croix', 'completed'),
  rdv('8', 3, 15, 30, 60, 'Intervention - Garage du Nord (CD-234-EF)', '45 Rue de Tournai 59200 Tourcoing'),
  rdv('9', 4, 10, 0, 45, 'Pare-brise Peugeot 208 (GH-567-IJ)', '2 Place du Général de Gaulle 59000 Lille', 'cancelled'),
  rdv('10', 4, 13, 0, 90, 'Intervention - Sophie Leroy (KL-890-MN)', '18 Rue Esquermoise 59000 Lille'),
];

const CADRES = [
  { cle: 'telephone', label: 'Téléphone — 375 px', largeur: 375 },
  { cle: 'tablette', label: 'Tablette — 768 px', largeur: 768 },
] as const;

export function ApercuAgenda() {
  const [vue, setVue] = useState<'day' | 'week' | 'month'>('week');
  const rien = () => {};

  return (
    <div className="min-h-full bg-background">
      <p className="gutter-x bg-warning/10 py-2 text-xs text-foreground">
        Aperçu de développement — semaine fabriquée, aucune requête. Les cadres
        ci-dessous reproduisent la largeur d’un téléphone et d’une tablette ;
        pour les points de rupture, redimensionnez vraiment la fenêtre.
      </p>

      <div className="gutter-x space-y-6 py-5">
        <div className="flex gap-1 rounded-lg border border-border bg-muted/40 p-0.5 w-fit">
          {(['day', 'week', 'month'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setVue(v)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                vue === v ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
              }`}
            >
              {v === 'day' ? 'Jour' : v === 'week' ? 'Semaine' : 'Mois'}
            </button>
          ))}
        </div>

        {CADRES.map((cadre) => (
          <section key={cadre.cle}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {cadre.label}
            </h2>
            {/* Le cadre impose la largeur reelle d'un telephone. Le
                defilement horizontal, s'il y en a, se voit donc ici. */}
            <div
              className="overflow-x-auto rounded-xl border border-border bg-card p-2"
              style={{ width: cadre.largeur, maxWidth: '100%' }}
            >
              <Vue vue={vue} onClic={rien} />
            </div>
          </section>
        ))}

        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Barre d’outils de la page
          </h2>
          {/* La page entiere, sans session : ses requetes echouent et le
              corps affiche son etat d'erreur, mais l'en-tete et la barre
              d'outils sont bien celles de production -- c'est tout ce qu'on
              vient juger ici. */}
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <CalendarPage />
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Pleine largeur
          </h2>
          <div className="overflow-x-auto rounded-xl border border-border bg-card p-2">
            <Vue vue={vue} onClic={rien} />
          </div>
        </section>
      </div>
    </div>
  );
}

function Vue({ vue, onClic }: {
  vue: 'day' | 'week' | 'month';
  onClic: (a: Appointment) => void;
}) {
  const aujourdhui = jour(0);

  if (vue === 'day') {
    return (
      <DayView currentDate={jour(0)} appts={SEMAINE} today={aujourdhui} onApptClick={onClic} />
    );
  }
  if (vue === 'week') {
    return (
      <WeekView currentDate={jour(0)} appts={SEMAINE} today={aujourdhui} onApptClick={onClic} />
    );
  }
  return (
    <MonthView
      currentDate={jour(0)}
      appts={SEMAINE}
      today={aujourdhui}
      onApptClick={onClic}
      onDayClick={() => {}}
    />
  );
}
