import { useCallback, useEffect, useMemo, useState } from 'react';
import { fondDepuis } from '@/features/dossier/dossier-constants';
import { EtatErreur } from '@/components/EtatErreur';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Car,
  Phone,
  Users,
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  CheckCircle2,
  XCircle,
  Trash2,
  CircleAlert,
  Gift,
  SlidersHorizontal,
} from 'lucide-react';
import {
  format,
  addDays,
  subDays,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
  addMonths,
  subMonths,
} from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';

import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/features/auth/auth-context';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/PageHeader';
import { CarteInterventions } from './carte-interventions';
import { GoogleCalendarControl } from './google-calendar-control';
import { ChampAdresse } from '@/components/ChampAdresse';
import type { AdresseNormalisee } from '@/services/adresse-service';
import {
  fetchInterventionsCarte, compterInterventionsNonLocalisees, leadsDInterventions,
} from '@/services/interventions-carte-service';
import {
  localiserLeadsManquants, localiserRendezVousManquants, type Avancement,
} from '@/services/geocodage-lot';
import { chercherConflits, journeeDe, type ConflitRendezVous } from '@/services/disponibilite-service';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useEstMobile } from '@/hooks/use-media-query';
import { LIBELLE_STATUT_RDV, PASTILLE_STATUT_RDV } from './statut-rendez-vous';

import { fetchCases } from '@/services/cases-service';
import { fetchLeads, updateLead } from '@/services/leads-service';
import {
  clientDuRendezVous, createAppointment, deleteAppointment, fetchAppointments, updateAppointment,
  type AppointmentAvecClient,
} from '@/services/planning-service';
import { lienItineraire } from '@/services/adresse-service';
import { fetchProfiles } from '@/services/profiles-service';
import { ConfirmerSuppression } from '@/components/ConfirmerSuppression';
import { InterventionWeather } from '@/features/interventions/intervention-weather';
import type {
  Appointment,
  AppointmentStatus,
  AppointmentType,
  Profile,
  Lead,
  WindscreenCase,
} from '@/types';

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

type View = 'day' | 'week' | 'month' | 'carte';

/** Valeur sentinelle : Radix refuse une SelectItem de valeur vide. */
const SANS_CONSEILLER = '__aucun__';

const SLOT_HEIGHT = 60; // px per hour
const DAY_START_HOUR = 8;
const DAY_END_HOUR = 18;
const DAY_START_MIN = DAY_START_HOUR * 60;
const TOTAL_MINUTES = (DAY_END_HOUR - DAY_START_HOUR) * 60;
const GRID_HEIGHT = TOTAL_MINUTES * (SLOT_HEIGHT / 60); // 600px

const HOURS = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, i) => i + DAY_START_HOUR);

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

const STATUS_STYLES: Record<AppointmentStatus, string> = {
  scheduled: 'bg-upcoming-soft/80 border-upcoming/25/70 text-upcoming',
  confirmed: 'bg-done-soft/80 border-done/25/70 text-done',
  completed: 'bg-muted/80 border-border/70 text-muted-foreground',
  cancelled: 'bg-urgent-soft/70 border-urgent/25/70 text-urgent line-through opacity-60',
  no_show: 'bg-due-soft/80 border-due/25/70 text-due',
};

/** Les memes couleurs que les pastilles, reduites a un point pour le mois. */
const STATUS_POINT: Record<AppointmentStatus, string> = {
  scheduled: 'bg-upcoming',
  confirmed: 'bg-done',
  completed: 'bg-muted-foreground/50',
  cancelled: 'bg-urgent/50',
  no_show: 'bg-due',
};

const TYPE_ICONS: Record<AppointmentType, typeof Car> = {
  intervention: Car,
  call: Phone,
  meeting: Users,
  other: CalendarIcon,
};

const TYPE_LABELS: Record<AppointmentType, string> = {
  intervention: 'Intervention',
  call: 'Appel',
  meeting: 'Réunion',
  other: 'Autre',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function dayStart(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function dayEnd(d: Date): Date {
  const c = new Date(d);
  c.setHours(23, 59, 59, 999);
  return c;
}

function profileName(p: Profile): string {
  const parts = [p.first_name, p.last_name].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : 'Utilisateur';
}

function formatTime(iso: string): string {
  return format(new Date(iso), 'HH:mm');
}

function toMinutes(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

interface PlacedAppt {
  appt: Appointment;
  top: number;
  height: number;
  colIndex: number;
  colCount: number;
}

/** Position appointments in a day column, handling overlaps by splitting into columns. */
function placeAppointments(appts: Appointment[]): PlacedAppt[] {
  if (appts.length === 0) return [];
  const sorted = [...appts].sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  );

  // Group overlapping appointments
  const groups: Appointment[][] = [];
  let currentGroup: Appointment[] = [];
  let groupEnd = -Infinity;

  for (const appt of sorted) {
    const start = new Date(appt.start_time).getTime();
    const end = new Date(appt.end_time).getTime();
    if (start >= groupEnd && currentGroup.length > 0) {
      groups.push(currentGroup);
      currentGroup = [];
    }
    currentGroup.push(appt);
    groupEnd = Math.max(groupEnd, end);
  }
  if (currentGroup.length > 0) groups.push(currentGroup);

  const result: PlacedAppt[] = [];

  for (const group of groups) {
    // Greedy column assignment within the group
    const colEnds: number[] = [];
    const colMap = new Map<string, number>();

    for (const appt of group) {
      const start = new Date(appt.start_time).getTime();
      let assigned = -1;
      for (let c = 0; c < colEnds.length; c++) {
        if (colEnds[c] <= start) {
          assigned = c;
          colEnds[c] = new Date(appt.end_time).getTime();
          break;
        }
      }
      if (assigned === -1) {
        colEnds.push(new Date(appt.end_time).getTime());
        assigned = colEnds.length - 1;
      }
      colMap.set(appt.id, assigned);
    }

    const totalCols = colEnds.length;

    for (const appt of group) {
      const startMin = Math.max(DAY_START_MIN, toMinutes(appt.start_time));
      const endMin = Math.min(DAY_START_MIN + TOTAL_MINUTES, toMinutes(appt.end_time));
      const top = (startMin - DAY_START_MIN) * (SLOT_HEIGHT / 60);
      const height = Math.max(22, (endMin - startMin) * (SLOT_HEIGHT / 60));
      result.push({
        appt,
        top,
        height,
        colIndex: colMap.get(appt.id)!,
        colCount: totalCols,
      });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Now indicator
// ---------------------------------------------------------------------------

function NowIndicator() {
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (minutes < DAY_START_MIN || minutes > DAY_START_MIN + TOTAL_MINUTES) return null;
  const top = (minutes - DAY_START_MIN) * (SLOT_HEIGHT / 60);
  return (
    <div
      className="pointer-events-none absolute left-0 right-0 z-20 flex items-center"
      style={{ top: `${top}px` }}
    >
      <div className="-ml-1 h-2 w-2 rounded-full bg-urgent" />
      <div className="h-px flex-1 bg-urgent" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Appointment block (day / week views)
// ---------------------------------------------------------------------------

function AppointmentBlock({
  placed,
  onApptClick,
}: {
  placed: PlacedAppt;
  onApptClick: (appt: Appointment) => void;
}) {
  const { appt, top, height, colIndex, colCount } = placed;
  const Icon = TYPE_ICONS[appt.type] ?? CalendarIcon;
  const isCancelled = appt.status === 'cancelled';
  const { adresse: adresseBloc, offre: offreBloc } = clientDuRendezVous(appt as AppointmentAvecClient);

  return (
    <button
      type="button"
      onClick={() => onApptClick(appt)}
      className={cn(
        'absolute overflow-hidden rounded-lg border px-1.5 py-1 text-left text-xs transition-shadow hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-ring/40',
        STATUS_STYLES[appt.status]
      )}
      style={{
        top: `${top}px`,
        height: `${height}px`,
        left: `calc(${colIndex} * 100% / ${colCount} + 2px)`,
        width: `calc(100% / ${colCount} - 4px)`,
      }}
    >
      <div className="flex items-center gap-1">
        <Icon className={cn('h-3 w-3 shrink-0', isCancelled && 'opacity-50')} />
        <span className="truncate font-medium">{appt.title}</span>
      </div>
      {height > 38 && (
        <div className={cn('mt-0.5 text-[10px] tabular-nums opacity-80', isCancelled && 'line-through')}>
          {formatTime(appt.start_time)} – {formatTime(appt.end_time)}
        </div>
      )}
      {height > 56 && adresseBloc && (
        <div className="mt-0.5 flex items-center gap-1 truncate text-[10px] opacity-70">
          <MapPin className="h-2.5 w-2.5 shrink-0" />
          <span className="truncate">{adresseBloc}</span>
        </div>
      )}
      {height > 80 && offreBloc && (
        <div className="mt-0.5 flex items-center gap-1 truncate text-[10px] font-medium opacity-90">
          <Gift className="h-2.5 w-2.5 shrink-0" />
          <span className="truncate">{offreBloc}</span>
        </div>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Time-grid day column (shared by day & week views)
// ---------------------------------------------------------------------------

function TimeGridDay({
  day,
  appts,
  today,
  onApptClick,
}: {
  day: Date;
  appts: Appointment[];
  today: Date;
  onApptClick: (appt: Appointment) => void;
}) {
  const placed = useMemo(() => placeAppointments(appts), [appts]);
  const isToday = isSameDay(day, today);

  return (
    <div className="relative" style={{ height: `${GRID_HEIGHT}px` }}>
      {/* Hour grid lines */}
      {HOURS.map((_, i) => (
        <div
          key={i}
          className="absolute left-0 right-0 border-t border-border/50"
          style={{ top: `${i * SLOT_HEIGHT}px` }}
        />
      ))}
      {/* Today highlight */}
      {isToday && <div className="absolute inset-0 bg-primary/[0.03]" />}
      {/* Now indicator */}
      {isToday && <NowIndicator />}
      {/* Appointments */}
      {placed.map((p) => (
        <AppointmentBlock key={p.appt.id} placed={p} onApptClick={onApptClick} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Time column (shared)
// ---------------------------------------------------------------------------

function TimeColumn() {
  return (
    <div className="w-16 shrink-0">
      {HOURS.map((h) => (
        <div
          key={h}
          className="border-t border-border/50 pr-2 pt-1 text-right"
          style={{ height: `${SLOT_HEIGHT}px` }}
        >
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {String(h).padStart(2, '0')}:00
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Day view
// ---------------------------------------------------------------------------

export function DayView({
  currentDate,
  appts,
  today,
  onApptClick,
}: {
  currentDate: Date;
  appts: Appointment[];
  today: Date;
  onApptClick: (appt: Appointment) => void;
}) {
  const dayAppts = useMemo(
    () => appts.filter((a) => isSameDay(new Date(a.start_time), currentDate)),
    [appts, currentDate]
  );

  return (
    <div className="flex">
      <TimeColumn />
      <div className="flex-1 border-l border-border">
        <TimeGridDay day={currentDate} appts={dayAppts} today={today} onApptClick={onApptClick} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// La semaine sur un telephone
// ---------------------------------------------------------------------------

/**
 * Sept colonnes ne tiennent pas sur 375 px.
 *
 * La grille horaire demandait 700 px de large : sur un telephone, on voyait
 * lundi et un morceau de mardi, et il fallait faire defiler lateralement pour
 * atteindre jeudi. Un planning qu'on ne voit pas d'un coup ne sert a rien --
 * c'est justement pour l'embrasser du regard qu'on l'ouvre.
 *
 * La semaine devient donc une liste : un jour apres l'autre, du haut vers le
 * bas, chaque rendez-vous sur toute la largeur. On perd la lecture des
 * chevauchements et des trous entre deux interventions ; on gagne de voir la
 * semaine. Sur un ecran large, la grille reste.
 *
 * Les jours vides restent affiches : savoir que mercredi est libre fait
 * partie de ce qu'on vient chercher.
 */
function SemaineEnListe({
  jours,
  appts,
  today,
  onApptClick,
}: {
  jours: Date[];
  appts: Appointment[];
  today: Date;
  onApptClick: (appt: Appointment) => void;
}) {
  return (
    <div className="divide-y divide-border">
      {jours.map((day) => {
        const duJour = appts
          .filter((a) => isSameDay(new Date(a.start_time), day))
          .sort((a, b) => a.start_time.localeCompare(b.start_time));
        const estAujourdhui = isSameDay(day, today);

        return (
          <section key={day.toISOString()} className="py-2">
            <h3 className={cn(
              'flex items-baseline gap-2 px-1 pb-1.5 text-sm',
              estAujourdhui ? 'font-semibold text-primary' : 'font-medium text-foreground',
            )}>
              {cap(format(day, 'EEEE d MMMM', { locale: fr }))}
              <span className="ml-auto text-xs font-normal tabular-nums text-muted-foreground">
                {duJour.length === 0 ? 'libre' : duJour.length}
              </span>
            </h3>

            {duJour.length > 0 && (
              <ul className="space-y-1.5">
                {duJour.map((appt) => (
                  <li key={appt.id}>
                    <RendezVousEnLigne appt={appt} onApptClick={onApptClick} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** Un rendez-vous sur toute la largeur, assez haut pour le doigt. */
function RendezVousEnLigne({
  appt,
  onApptClick,
}: {
  appt: Appointment;
  onApptClick: (appt: Appointment) => void;
}) {
  const Icon = TYPE_ICONS[appt.type] ?? CalendarIcon;
  const { adresse } = clientDuRendezVous(appt as AppointmentAvecClient);

  return (
    <button
      type="button"
      onClick={() => onApptClick(appt)}
      className={cn(
        'flex min-h-[44px] w-full items-start gap-2 rounded-lg border px-2.5 py-2 text-left transition-shadow active:shadow-sm',
        STATUS_STYLES[appt.status],
      )}
    >
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="shrink-0 text-xs font-semibold tabular-nums">
            {formatTime(appt.start_time)}
          </span>
          <span className="truncate text-sm font-medium">{appt.title}</span>
        </span>
        <span className="mt-0.5 flex items-center gap-1 text-[11px] opacity-80">
          <span className="shrink-0 tabular-nums">
            jusqu’à {formatTime(appt.end_time)}
          </span>
          {adresse && (
            <>
              <MapPin className="ml-1 h-2.5 w-2.5 shrink-0" />
              <span className="truncate">{adresse}</span>
            </>
          )}
        </span>
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Week view
// ---------------------------------------------------------------------------

export function WeekView({
  currentDate,
  appts,
  today,
  onApptClick,
}: {
  currentDate: Date;
  appts: Appointment[];
  today: Date;
  onApptClick: (appt: Appointment) => void;
}) {
  const estMobile = useEstMobile();
  const weekDays = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(currentDate, { weekStartsOn: 1 }),
        end: endOfWeek(currentDate, { weekStartsOn: 1 }),
      }),
    [currentDate]
  );

  if (estMobile) {
    return (
      <SemaineEnListe jours={weekDays} appts={appts} today={today} onApptClick={onApptClick} />
    );
  }

  return (
    <div className="md:min-w-0">
      {/* Day headers */}
      <div className="flex border-b border-border">
        <div className="w-16 shrink-0" />
        {weekDays.map((day) => {
          const isToday = isSameDay(day, today);
          return (
            <div
              key={day.toISOString()}
              className="flex-1 border-l border-border py-2 text-center"
            >
              <div className="text-[11px] uppercase text-muted-foreground">
                {format(day, 'EEE', { locale: fr })}
              </div>
              <div
                className={cn(
                  'mx-auto mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-sm font-medium tabular-nums',
                  isToday ? 'bg-primary text-primary-foreground' : 'text-foreground'
                )}
              >
                {format(day, 'd', { locale: fr })}
              </div>
            </div>
          );
        })}
      </div>
      {/* Grid */}
      <div className="flex">
        <TimeColumn />
        {weekDays.map((day) => {
          const dayAppts = appts.filter((a) => isSameDay(new Date(a.start_time), day));
          return (
            <div key={day.toISOString()} className="flex-1 border-l border-border">
              <TimeGridDay
                day={day}
                appts={dayAppts}
                today={today}
                onApptClick={onApptClick}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Month view
// ---------------------------------------------------------------------------

export function MonthView({
  currentDate,
  appts,
  today,
  onApptClick,
  onDayClick,
}: {
  currentDate: Date;
  appts: Appointment[];
  today: Date;
  onApptClick: (appt: Appointment) => void;
  onDayClick: (day: Date) => void;
}) {
  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [currentDate]);

  const estMobile = useEstMobile();
  const apptsByDay = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const appt of appts) {
      const key = format(new Date(appt.start_time), 'yyyy-MM-dd');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(appt);
    }
    return map;
  }, [appts]);

  return (
    <div className="md:min-w-0">
      {/* Weekday headers */}
      <div className="grid grid-cols-7 border-b border-border">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="py-2 text-center text-[11px] font-medium uppercase text-muted-foreground"
          >
            {label}
          </div>
        ))}
      </div>
      {/* Day cells */}
      <div className="grid grid-cols-7 border-l border-t border-border">
        {days.map((day) => {
          const key = format(day, 'yyyy-MM-dd');
          const dayAppts = apptsByDay.get(key) ?? [];
          const inMonth = isSameMonth(day, currentDate);
          const isToday = isSameDay(day, today);

          return (
            <div
              key={day.toISOString()}
              className={cn(
                'border-b border-r border-border p-1.5',
                // Sur telephone, 7 colonnes font 48 px : un titre n'y tient
                // pas, et une case haute de 112 px reduirait le mois a trois
                // semaines visibles.
                estMobile ? 'min-h-[58px]' : 'min-h-[112px]',
                !inMonth && 'bg-muted/30'
              )}
            >
              <button
                type="button"
                onClick={() => onDayClick(day)}
                className="mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium tabular-nums transition-colors hover:bg-muted"
              >
                <span
                  className={cn(
                    'flex h-6 w-6 items-center justify-center rounded-full',
                    isToday
                      ? 'bg-primary text-primary-foreground'
                      : inMonth
                        ? 'text-foreground'
                        : 'text-muted-foreground/50'
                  )}
                >
                  {format(day, 'd', { locale: fr })}
                </span>
              </button>

              {/* Sur telephone, des points : a 48 px de large, « 09:30 I… »
                  n'apprend rien, alors que la densite d'une journee se lit
                  d'un coup d'oeil. Le jour s'ouvre d'une tape. */}
              {estMobile ? (
                dayAppts.length > 0 && (
                  <div className="flex flex-wrap gap-0.5">
                    {dayAppts.slice(0, 4).map((appt) => (
                      <span
                        key={appt.id}
                        className={cn('h-1.5 w-1.5 rounded-full', STATUS_POINT[appt.status])}
                        aria-hidden
                      />
                    ))}
                    <span className="sr-only">
                      {dayAppts.length} rendez-vous
                    </span>
                  </div>
                )
              ) : (
              <div className="space-y-0.5">
                {dayAppts.slice(0, 3).map((appt) => (
                  <button
                    key={appt.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onApptClick(appt);
                    }}
                    className={cn(
                      'block w-full truncate rounded px-1 py-0.5 text-left text-[10px] font-medium leading-tight transition-opacity hover:opacity-80',
                      PASTILLE_STATUT_RDV[appt.status]
                    )}
                  >
                    {formatTime(appt.start_time)} {appt.title}
                  </button>
                ))}
                {dayAppts.length > 3 && (
                  <button
                    type="button"
                    onClick={() => onDayClick(day)}
                    className="block w-full px-1 text-left text-[10px] text-muted-foreground hover:text-foreground"
                  >
                    +{dayAppts.length - 3} autre{dayAppts.length - 3 > 1 ? 's' : ''}
                  </button>
                )}
              </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Appointment detail sheet
// ---------------------------------------------------------------------------

function OffreCommerciale({
  leadId, appointmentId, offre, onEnregistree, modifiable,
}: {
  leadId: string | null;
  appointmentId: string;
  offre: string | null;
  onEnregistree: () => void;
  modifiable: boolean;
}) {
  const [edition, setEdition] = useState(false);
  const [saisie, setSaisie] = useState(offre ?? '');

  // Un autre rendez-vous ouvert dans le meme panneau doit repartir de sa
  // propre offre, pas de la saisie precedente.
  useEffect(() => { setSaisie(offre ?? ''); setEdition(false); }, [appointmentId, leadId, offre]);

  const enregistrer = useMutation({
    // Le lead fait foi quand il existe. Sans lead -- rendez-vous repris de
    // Google -- l'offre n'a nulle part ou vivre sinon sur le rendez-vous.
    mutationFn: async (valeur: string) => {
      const offer = valeur.trim() || null;
      const { error } = leadId
        ? await updateLead(leadId, { offer })
        : await updateAppointment(appointmentId, { offer });
      if (error) throw new Error(error);
    },
    onSuccess: () => {
      setEdition(false);
      toast.success('Offre enregistrée');
      onEnregistree();
    },
    onError: (e: Error) => toast.error("L'offre n'a pas été enregistrée", { description: e.message }),
  });

  if (!edition) {
    return (
      <div className="flex items-start justify-between gap-3 rounded-xl border border-border p-3 text-sm">
        <div className="flex min-w-0 items-start gap-2">
          <Gift className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Cadeau / offre annoncé</p>
            {offre ? (
              <p className="mt-0.5 font-medium text-foreground">{offre}</p>
            ) : (
              <p className="mt-0.5 text-muted-foreground">Aucune offre annoncée</p>
            )}
          </div>
        </div>
        {modifiable && (
          <Button variant="ghost" size="sm" className="h-7 shrink-0 rounded-full text-xs" onClick={() => setEdition(true)}>
            {offre ? 'Modifier' : 'Renseigner'}
          </Button>
        )}
      </div>
    );
  }

  return (
    <form
      className="rounded-xl border border-border p-3"
      onSubmit={(e) => { e.preventDefault(); enregistrer.mutate(saisie); }}
    >
      <Label htmlFor="rdv-offre" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Cadeau / offre annoncé
      </Label>
      <Input
        id="rdv-offre" autoFocus
        value={saisie} onChange={(e) => setSaisie(e.target.value)}
        placeholder="ex. Virement jusqu'à 300 €, PS5…"
        className="mt-1.5 h-9 rounded-lg"
      />
      <div className="mt-2 flex gap-2">
        <Button type="submit" size="sm" className="rounded-full" disabled={enregistrer.isPending}>
          Enregistrer
        </Button>
        <Button type="button" size="sm" variant="ghost" className="rounded-full"
          onClick={() => { setSaisie(offre ?? ''); setEdition(false); }}>
          Annuler
        </Button>
      </div>
    </form>
  );
}

function AppointmentDetailSheet({
  open,
  onOpenChange,
  appointment,
  profiles,
  onConfirm,
  onComplete,
  onCancel,
  onDelete,
  updating,
  deleting,
  onOffreEnregistree,
  peutModifier,
  peutSupprimer,
  peutNaviguerHorsPlanning,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  appointment: Appointment | null;
  profiles: Profile[];
  onConfirm: () => void;
  onComplete: () => void;
  onCancel: () => void;
  onDelete: () => void;
  updating: boolean;
  deleting: boolean;
  peutModifier: boolean;
  peutSupprimer: boolean;
  peutNaviguerHorsPlanning: boolean;
  /** L'offre est ecrite sur le lead : les rendez-vous doivent etre relus. */
  onOffreEnregistree: () => void;
}) {
  if (!appointment) return null;

  const Icon = TYPE_ICONS[appointment.type] ?? CalendarIcon;
  const assigned = profiles.find((p) => p.id === appointment.assigned_user_id);
  const client = clientDuRendezVous(appointment as AppointmentAvecClient);
  // L'itineraire part de l'adresse en texte : un rendez-vous repris de Google
  // n'a pas ses propres coordonnees, et celles du lead peuvent designer un
  // autre lieu que l'adresse affichee.
  const itineraire = client.adresse ? lienItineraire({ address: client.adresse }) : null;
  const start = new Date(appointment.start_time);
  const end = new Date(appointment.end_time);
  const isPast = end.getTime() < Date.now();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-muted/40">
              <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <SheetTitle className={appointment.status === 'cancelled' ? 'line-through' : ''}>
                {appointment.title}
              </SheetTitle>
              <SheetDescription>
                {cap(format(start, 'EEEE d MMMM yyyy', { locale: fr }))}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-2">
          {/* Type & status badges */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="gap-1">
              <Icon className="h-3 w-3" />
              {TYPE_LABELS[appointment.type]}
            </Badge>
            <Badge
              variant="outline"
              className={cn(
                'border-transparent',
                appointment.status === 'scheduled' && 'bg-upcoming-soft text-upcoming',
                appointment.status === 'confirmed' && 'bg-done-soft text-done',
                appointment.status === 'completed' && 'bg-muted text-muted-foreground',
                appointment.status === 'cancelled' && 'bg-urgent-soft text-urgent',
                appointment.status === 'no_show' && 'bg-due-soft text-due'
              )}
            >
              {LIBELLE_STATUT_RDV[appointment.status]}
            </Badge>
          </div>

          {/* Time */}
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="tabular-nums">
              {formatTime(appointment.start_time)} – {formatTime(appointment.end_time)}
            </span>
            {isPast && appointment.status !== 'completed' && appointment.status !== 'cancelled' && (
              <Badge variant="outline" className="ml-1 text-[10px] text-muted-foreground">
                Passé
              </Badge>
            )}
          </div>

          {appointment.type === 'intervention'
            && appointment.status !== 'completed'
            && appointment.status !== 'cancelled' && (
              <InterventionWeather
                startTime={appointment.start_time}
                ville={client.ville}
                codePostal={client.codePostal}
                citycode={appointment.citycode}
                latitude={appointment.latitude}
                longitude={appointment.longitude}
              />
            )}

          {/* Client : ou aller, qui appeler. C'est ce que le technicien
              regarde avant de partir ; ca ne doit dependre ni du champ
              adresse du rendez-vous, ni de ce que Google en savait. */}
          {(client.adresse || client.telephone || client.nom) ? (
            <div className="rounded-xl border border-border p-3 text-sm">
              {client.nom && (
                <p className="font-medium text-foreground">{client.nom}</p>
              )}
              {client.adresse && (
                <div className="mt-1.5 flex items-start gap-2 text-muted-foreground">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{client.adresse}</span>
                </div>
              )}
              {client.telephone && (
                <div className="mt-1 flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-4 w-4 shrink-0" />
                  <a href={`tel:${client.telephone}`} className="hover:underline">{client.telephone}</a>
                </div>
              )}
              {(itineraire || client.telephone) && (
                <div className="mt-3 flex gap-2">
                  {itineraire && (
                    <Button asChild size="sm" className="flex-1 rounded-full">
                      <a href={itineraire} target="_blank" rel="noopener noreferrer">
                        <MapPin className="mr-1.5 h-3.5 w-3.5" />Itinéraire
                      </a>
                    </Button>
                  )}
                  {client.telephone && (
                    <Button asChild size="sm" variant="outline" className="flex-1 rounded-full">
                      <a href={`tel:${client.telephone}`}>
                        <Phone className="mr-1.5 h-3.5 w-3.5" />Appeler
                      </a>
                    </Button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Aucun client rattaché : ni adresse ni téléphone à afficher.
            </p>
          )}

          {/* Offre commerciale : ce que le client attend en plus de la pose.
              Le technicien doit l'avoir en tete avant de sonner. Elle vit sur
              le lead -- une offre par intervention -- et se saisit ici sans
              rouvrir la fiche. */}
          <OffreCommerciale
            leadId={client.leadId}
            appointmentId={appointment.id}
            offre={client.offre}
            onEnregistree={onOffreEnregistree}
            modifiable={peutNaviguerHorsPlanning}
          />

          {/* Description */}
          {appointment.description && (
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-sm text-muted-foreground">{appointment.description}</p>
            </div>
          )}

          {/* Associations */}
          <div className="space-y-2 border-t border-border pt-4">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Associations
            </h3>
            <dl className="space-y-2">
              {appointment.case_id && (
                <div className="flex items-center justify-between text-sm">
                  <dt className="text-muted-foreground">Dossier</dt>
                  <dd>
                    {peutNaviguerHorsPlanning ? (
                      <a
                        href={`/cases?id=${appointment.case_id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        Ouvrir le dossier
                      </a>
                    ) : <span className="text-muted-foreground">Rattaché</span>}
                  </dd>
                </div>
              )}
              {appointment.lead_id && (
                <div className="flex items-center justify-between text-sm">
                  <dt className="text-muted-foreground">Lead</dt>
                  <dd>
                    {peutNaviguerHorsPlanning ? (
                      <a
                        href={`/leads?id=${appointment.lead_id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        Ouvrir le lead
                      </a>
                    ) : <span className="text-muted-foreground">Rattaché</span>}
                  </dd>
                </div>
              )}
              {appointment.contact_id && (
                <div className="flex items-center justify-between text-sm">
                  <dt className="text-muted-foreground">Contact</dt>
                  <dd className="font-mono text-xs text-muted-foreground">
                    #{appointment.contact_id.slice(0, 8)}
                  </dd>
                </div>
              )}
              <div className="flex items-center justify-between text-sm">
                <dt className="text-muted-foreground">Conseiller</dt>
                <dd className="font-medium">
                  {assigned ? profileName(assigned) : 'Non assigné'}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        {peutModifier ? (
        <SheetFooter className="flex-row flex-wrap gap-2 border-t border-border pt-4">
          {appointment.status !== 'confirmed' && appointment.status !== 'completed' && (
            <Button
              variant="outline"
              size="sm"
              onClick={onConfirm}
              disabled={updating}
              className="gap-1.5"
            >
              <CheckCircle2 className="h-4 w-4 text-done" />
              Confirmer
            </Button>
          )}
          {appointment.status !== 'completed' && (
            <Button
              variant="outline"
              size="sm"
              onClick={onComplete}
              disabled={updating}
              className="gap-1.5"
            >
              <CheckCircle2 className="h-4 w-4" />
              Terminer
            </Button>
          )}
          {appointment.status !== 'cancelled' && (
            <Button
              variant="outline"
              size="sm"
              onClick={onCancel}
              disabled={updating}
              className="gap-1.5"
            >
              <XCircle className="h-4 w-4 text-urgent" />
              Annuler
            </Button>
          )}
          {peutSupprimer && (
            <Button
              variant="outline"
              size="sm"
              onClick={onDelete}
              disabled={deleting}
              className="ml-auto gap-1.5 text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-4 w-4" />
              Supprimer
            </Button>
          )}
        </SheetFooter>
        ) : (
          <div className="border-t border-border px-4 pt-4 text-xs text-muted-foreground">
            Planning partagé en lecture seule pour ce rendez-vous.
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Create appointment dialog
// ---------------------------------------------------------------------------

const appointmentSchema = z
  .object({
    title: z.string().min(1, 'Le titre est requis'),
    description: z.string().optional(),
    date: z.string().min(1, 'La date est requise'),
    startTime: z.string().min(1, "L'heure de début est requise"),
    endTime: z.string().min(1, "L'heure de fin est requise"),
    address: z.string().optional(),
    type: z.enum(['intervention', 'call', 'meeting', 'other']),
    assigned_user_id: z.string().optional(),
    linkType: z.enum(['none', 'case', 'lead']),
    caseId: z.string().optional(),
    leadId: z.string().optional(),
  })
  .refine((data) => data.startTime < data.endTime, {
    message: "L'heure de fin doit être postérieure à l'heure de début",
    path: ['endTime'],
  });

type AppointmentFormValues = z.infer<typeof appointmentSchema>;

function CreateAppointmentDialog({
  open,
  onOpenChange,
  profiles,
  onCreate,
  creating,
  initialLeadId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  profiles: Profile[];
  onCreate: (data: Partial<Appointment>) => void;
  creating: boolean;
  /** Fourni depuis une fiche lead : le client et son adresse sont preselectionnes. */
  initialLeadId?: string;
}) {
  const form = useForm<AppointmentFormValues>({
    resolver: zodResolver(appointmentSchema),
    defaultValues: {
      title: '',
      description: '',
      date: format(new Date(), 'yyyy-MM-dd'),
      startTime: '09:00',
      endTime: '10:00',
      address: '',
      type: 'intervention',
      assigned_user_id: '',
      linkType: 'none',
      caseId: '',
      leadId: '',
    },
  });

  const leadsQuery = useQuery<Lead[], Error>({
    queryKey: ['calendar', 'leads'],
    queryFn: () => fetchLeads({}),
    enabled: open,
  });

  const casesQuery = useQuery<WindscreenCase[], Error>({
    queryKey: ['calendar', 'cases'],
    queryFn: () => fetchCases({}),
    enabled: open,
  });

  function handleSubmit(values: AppointmentFormValues) {
    const startDateTime = new Date(`${values.date}T${values.startTime}`);
    const endDateTime = new Date(`${values.date}T${values.endTime}`);

    onCreate({
      title: values.title,
      description: values.description || null,
      start_time: startDateTime.toISOString(),
      end_time: endDateTime.toISOString(),
      address: values.address || null,
      type: values.type,
      status: 'scheduled',
      assigned_user_id: values.assigned_user_id || null,
      case_id: values.linkType === 'case' && values.caseId ? values.caseId : null,
      lead_id: values.linkType === 'lead' && values.leadId ? values.leadId : null,

      // Coordonnées du lieu du rendez-vous. Sans elles, la carte devrait
      // emprunter celles du client — un autre endroit dès que l'intervention
      // n'a pas lieu à son domicile.
      latitude: lieu?.latitude ?? null,
      longitude: lieu?.longitude ?? null,
      citycode: lieu?.citycode ?? null,
      geo_precision: lieu?.geo_precision ?? null,
    } as Partial<Appointment>);
  }

  function handleOpenChange(v: boolean) {
    if (!v) {
      form.reset();
      setAdresseReprise(false);
      setLieu(null);
    }
    onOpenChange(v);
  }

  const linkType = form.watch('linkType');
  const errors = form.formState.errors;

  // Signale que l'adresse ne vient pas d'une saisie : elle a ete reprise de la
  // fiche du lead, et reste modifiable.
  const [adresseReprise, setAdresseReprise] = useState(false);

  /**
   * Lieu retenu, avec ses coordonnees.
   *
   * Une adresse tapee a la main ne porte pas de point : seule une suggestion
   * choisie dans la Base Adresse Nationale, ou reprise d'un lead deja
   * localise, permet de placer le rendez-vous sur la carte. Retomber sur les
   * coordonnees du client enverrait le technicien a une autre adresse que
   * celle affichee.
   */
  const [lieu, setLieu] = useState<AdresseNormalisee | null>(null);

  // ---- Disponibilite de l'intervenant ----
  const date = form.watch('date');
  const heureDebut = form.watch('startTime');
  const heureFin = form.watch('endTime');
  const intervenant = form.watch('assigned_user_id');

  const creneau = useMemo(() => {
    if (!date || !heureDebut || !heureFin) return null;
    const debut = new Date(`${date}T${heureDebut}`);
    const fin = new Date(`${date}T${heureFin}`);
    if (Number.isNaN(debut.getTime()) || Number.isNaN(fin.getTime())) return null;
    if (fin <= debut) return null;
    return { debut: debut.toISOString(), fin: fin.toISOString() };
  }, [date, heureDebut, heureFin]);

  const conflitsQuery = useQuery<ConflitRendezVous[], Error>({
    queryKey: ['conflits', creneau?.debut, creneau?.fin, intervenant],
    queryFn: () => chercherConflits({
      debut: creneau!.debut,
      fin: creneau!.fin,
      assignedUserId: intervenant,
    }),
    enabled: open && Boolean(creneau) && Boolean(intervenant),
  });

  const journeeQuery = useQuery<ConflitRendezVous[], Error>({
    queryKey: ['journee', date, intervenant],
    queryFn: () => journeeDe({ date, assignedUserId: intervenant }),
    enabled: open && Boolean(date) && Boolean(intervenant),
  });

  const conflits = conflitsQuery.data ?? [];
  const journee = (journeeQuery.data ?? []).filter(
    (r) => !conflits.some((c) => c.id === r.id),
  );

  /**
   * Choisir un lead remplit l'adresse et le titre.
   *
   * On ne remplace jamais une adresse deja saisie : elle a ete tapee pour ce
   * rendez-vous-la, et l'ecraser ferait perdre l'information sans prevenir.
   */
  const reprendreDuLead = useCallback((leadId: string) => {
    const lead = (leadsQuery.data ?? []).find((l) => l.id === leadId);
    if (!lead) return;

    const adresseDifferente = Boolean(
      lead.intervention_address || lead.intervention_postal_code || lead.intervention_city,
    );
    const adresse = adresseDifferente
      ? [lead.intervention_address, lead.intervention_postal_code, lead.intervention_city].filter(Boolean).join(' ')
      : [lead.address, lead.postal_code, lead.city].filter(Boolean).join(' ');
    if (adresse && !form.getValues('address')?.trim()) {
      form.setValue('address', adresse);
      setAdresseReprise(true);

      // On reprend aussi le point : c'est la meme adresse, deja localisee sur
      // la fiche. Sans lui, le rendez-vous naitrait sans position.
      setLieu({
        address: adresseDifferente ? lead.intervention_address : lead.address,
        postal_code: adresseDifferente ? lead.intervention_postal_code : lead.postal_code,
        city: adresseDifferente ? lead.intervention_city : lead.city,
        citycode: (adresseDifferente ? lead.intervention_citycode : lead.citycode) ?? null,
        latitude: (adresseDifferente ? lead.intervention_latitude : lead.latitude) ?? null,
        longitude: (adresseDifferente ? lead.intervention_longitude : lead.longitude) ?? null,
        geo_precision: (adresseDifferente ? lead.intervention_geo_precision : lead.geo_precision) ?? null,
      });
    }

    if (!form.getValues('title')?.trim()) {
      const nom = [lead.first_name, lead.last_name].filter(Boolean).join(' ');
      form.setValue('title', nom ? `Intervention — ${nom}` : 'Intervention');
    }
  }, [form, leadsQuery.data]);

  useEffect(() => {
    if (!open || !initialLeadId || !leadsQuery.data) return;
    form.setValue('linkType', 'lead');
    form.setValue('leadId', initialLeadId);
    reprendreDuLead(initialLeadId);
  }, [form, initialLeadId, leadsQuery.data, open, reprendreDuLead]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nouveau rendez-vous</DialogTitle>
          <DialogDescription>Planifier un rendez-vous ou une intervention.</DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="appt-title">Titre</Label>
            <Input id="appt-title" placeholder="Intervention pare-brise..." {...form.register('title')} />
            {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="appt-desc">Description</Label>
            <Textarea
              id="appt-desc"
              rows={2}
              placeholder="Détails du rendez-vous..."
              {...form.register('description')}
            />
          </div>

          {/* Date + times */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="appt-date">Date</Label>
              <Input id="appt-date" type="date" {...form.register('date')} />
              {errors.date && <p className="text-xs text-destructive">{errors.date.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="appt-start">Début</Label>
              <Input id="appt-start" type="time" {...form.register('startTime')} />
              {errors.startTime && (
                <p className="text-xs text-destructive">{errors.startTime.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="appt-end">Fin</Label>
              <Input id="appt-end" type="time" {...form.register('endTime')} />
              {errors.endTime && (
                <p className="text-xs text-destructive">{errors.endTime.message}</p>
              )}
            </div>
          </div>

          {/* Type + assigned user */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Controller
                control={form.control}
                name="type"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="intervention">Intervention</SelectItem>
                      <SelectItem value="call">Appel</SelectItem>
                      <SelectItem value="meeting">Réunion</SelectItem>
                      <SelectItem value="other">Autre</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Conseiller</Label>
              <Controller
                control={form.control}
                name="assigned_user_id"
                render={({ field }) => (
                  // Radix reserve la chaine vide pour effacer la selection : une
                  // SelectItem de valeur '' fait lever le composant et emporte
                  // toute l'application. On passe donc par une valeur sentinelle,
                  // retraduite en null a la soumission.
                  <Select
                    value={field.value || SANS_CONSEILLER}
                    onValueChange={(v) => field.onChange(v === SANS_CONSEILLER ? '' : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Non assigné" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SANS_CONSEILLER}>Non assigné</SelectItem>
                      {profiles.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {profileName(p)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          {/* Link to case / lead */}
          <div className="space-y-1.5">
            <Label>Associer à</Label>
            <Controller
              control={form.control}
              name="linkType"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucune association</SelectItem>
                    <SelectItem value="case">Un dossier</SelectItem>
                    <SelectItem value="lead">Un lead</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          {linkType === 'case' && (
            <div className="space-y-1.5">
              <Label>Dossier</Label>
              <Controller
                control={form.control}
                name="caseId"
                render={({ field }) => (
                  <Select value={field.value ?? ''} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner un dossier" />
                    </SelectTrigger>
                    <SelectContent>
                      {(casesQuery.data ?? []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.case_number}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {casesQuery.isLoading && <Skeleton className="h-4 w-24" />}
            </div>
          )}

          {linkType === 'lead' && (
            <div className="space-y-1.5">
              <Label>Lead</Label>
              <Controller
                control={form.control}
                name="leadId"
                render={({ field }) => (
                  <Select
                    value={field.value ?? ''}
                    onValueChange={(v) => { field.onChange(v); reprendreDuLead(v); }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner un lead" />
                    </SelectTrigger>
                    <SelectContent>
                      {(leadsQuery.data ?? []).map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {[l.first_name, l.last_name].filter(Boolean).join(' ') || 'Lead'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {leadsQuery.isLoading && <Skeleton className="h-4 w-24" />}
            </div>
          )}

          {/* Adresse — placee apres l'association : choisir un lead la
              remplit, et on doit le voir se produire. */}
          <div className="space-y-1.5">
            <ChampAdresse
              id="appt-addr"
              label="Adresse de l'intervention"
              valeur={form.watch('address') ?? ''}
              onValeurChange={(v) => {
                form.setValue('address', v);
                // Une saisie libre ne correspond plus au point choisi : le
                // conserver placerait le rendez-vous à l'adresse précédente.
                setLieu(null);
                setAdresseReprise(false);
              }}
              onChoisir={(a) => {
                form.setValue(
                  'address',
                  [a.address, a.postal_code, a.city].filter(Boolean).join(' '),
                );
                setLieu(a);
                setAdresseReprise(false);
              }}
              placeholder="Numéro, rue, ville…"
            />
            {adresseReprise && (
              <p className="text-xs text-muted-foreground">
                Reprise de la fiche du lead — modifiable si l'intervention a
                lieu ailleurs.
              </p>
            )}
            {form.watch('address')?.trim() && lieu?.latitude == null && (
              <p className="text-xs text-due">
                Adresse non localisée : choisissez une suggestion pour que ce
                rendez-vous apparaisse sur la carte.
              </p>
            )}
            {lieu?.geo_precision === 'approximatif' && (
              <p className="text-xs text-muted-foreground">
                Position au centre de la commune, pas au numéro — aucun
                itinéraire ne sera proposé.
              </p>
            )}
          </div>

          {/* Disponibilité — n'empêche pas d'enregistrer. Deux rendez-vous
              simultanés peuvent être légitimes (un appel pendant qu'un
              collègue roule, deux poseurs le même matin) : c'est à la
              personne qui planifie de trancher, mais en le sachant. */}
          {conflits.length > 0 && (
            <div className="rounded-xl border border-due/30 bg-due-soft px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-sm font-medium text-due">
                <CircleAlert className="h-4 w-4 shrink-0" />
                {conflits.length === 1
                  ? 'Un rendez-vous occupe déjà ce créneau'
                  : `${conflits.length} rendez-vous occupent déjà ce créneau`}
              </p>
              <ul className="mt-1.5 space-y-1">
                {conflits.map((c) => (
                  <li key={c.id} className="text-xs text-due">
                    {formatTime(c.debut)}–{formatTime(c.fin)} · {c.titre}
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-[11px] text-due/80">
                Vous pouvez enregistrer quand même si c'est voulu.
              </p>
            </div>
          )}

          {conflits.length === 0 && journee.length > 0 && (
            <div className="rounded-xl border border-border bg-muted/40 px-3 py-2.5">
              <p className="text-xs font-medium text-foreground">
                Déjà prévu ce jour-là
              </p>
              <ul className="mt-1 space-y-0.5">
                {journee.map((r) => (
                  <li key={r.id} className="text-xs text-muted-foreground">
                    {formatTime(r.debut)}–{formatTime(r.fin)} · {r.titre}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={creating} className="gap-1.5">
              {creating ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                  Création...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  {conflits.length > 0 ? 'Créer malgré le conflit' : 'Créer le rendez-vous'}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function CalendarPage() {
  const queryClient = useQueryClient();
  const { profile, user } = useAuth();
  const estTechnicien = profile?.role === 'technician';
  const navigate = useNavigate();
  const location = useLocation();
  const today = useMemo(() => new Date(), []);

  // Sur téléphone, sept colonnes rendent les rendez-vous illisibles. La vue
  // jour est donc le point d'entrée, sans empêcher de choisir semaine ensuite.
  const [view, setView] = useState<View>(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
      ? 'day'
      : 'week'
  );
  const [currentDate, setCurrentDate] = useState<Date>(today);
  const [advisorFilter, setAdvisorFilter] = useState('all');
  const [techFilter, setTechFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);
  const [confirmerSuppression, setConfirmerSuppression] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [initialLeadId, setInitialLeadId] = useState<string | undefined>(() => {
    const state = location.state as { createForLeadId?: string } | null;
    return state?.createForLeadId;
  });

  // La fiche lead ouvre directement le vrai formulaire de rendez-vous. L'etat
  // de navigation est ensuite retire pour que Recharger ne rouvre pas la boite.
  useEffect(() => {
    if (!initialLeadId) return;
    setCreateOpen(true);
    navigate(location.pathname, { replace: true, state: null });
  }, [initialLeadId, location.pathname, navigate]);

  // ---- Effective assigned user filter (advisor & technician are mutually exclusive) ----
  const effectiveAssignedUserId =
    advisorFilter !== 'all'
      ? advisorFilter
      : techFilter !== 'all'
        ? techFilter
        : undefined;

  // ---- Date range for query ----
  const { rangeStart, rangeEnd } = useMemo(() => {
    if (view === 'day') {
      return { rangeStart: dayStart(currentDate), rangeEnd: dayEnd(currentDate) };
    }
    // La carte se raisonne a la semaine : c'est l'horizon d'une tournee.
    if (view === 'week' || view === 'carte') {
      return {
        rangeStart: dayStart(startOfWeek(currentDate, { weekStartsOn: 1 })),
        rangeEnd: dayEnd(endOfWeek(currentDate, { weekStartsOn: 1 })),
      };
    }
    return {
      rangeStart: dayStart(startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 })),
      rangeEnd: dayEnd(endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 })),
    };
  }, [view, currentDate]);

  // ---- Queries ----
  const appointmentsQuery = useQuery<Appointment[], Error>({
    queryKey: ['appointments', rangeStart.toISOString(), rangeEnd.toISOString(), effectiveAssignedUserId],
    queryFn: () =>
      fetchAppointments({
        startDate: rangeStart.toISOString(),
        endDate: rangeEnd.toISOString(),
        assignedUserId: effectiveAssignedUserId,
      }),
    // Le temps réel est la voie normale. Ce rafraîchissement discret couvre
    // aussi une publication momentanément indisponible : chacun finit par
    // revoir le même planning sans avoir à recharger la page.
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (!profile?.workspace_id) return;

    const canal = supabase
      .channel(`planning-partage:${profile.workspace_id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appointments',
          filter: `workspace_id=eq.${profile.workspace_id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['appointments'] });
          queryClient.invalidateQueries({ queryKey: ['interventions-carte'] });
        },
      )
      .subscribe();

    return () => { void supabase.removeChannel(canal); };
  }, [profile?.workspace_id, queryClient]);

  const profilesQuery = useQuery<Profile[], Error>({
    queryKey: ['profiles'],
    queryFn: () => fetchProfiles(),
  });

  // ---- Carte ----
  // Seules les interventions se placent sur une carte : un lead « a rappeler »
  // n'a pas de lieu, et l'afficher noierait les deplacements reels.
  const carteQuery = useQuery({
    queryKey: ['interventions-carte', rangeStart.toISOString(), rangeEnd.toISOString(), effectiveAssignedUserId],
    queryFn: () => fetchInterventionsCarte({
      debut: rangeStart.toISOString(),
      fin: rangeEnd.toISOString(),
      assignedUserId: effectiveAssignedUserId,
    }),
    enabled: view === 'carte',
  });

  const carte = carteQuery.data;

  const { data: nonLocalisees } = useQuery({
    queryKey: ['interventions-non-localisees', rangeStart.toISOString(), rangeEnd.toISOString()],
    queryFn: () => compterInterventionsNonLocalisees({
      debut: rangeStart.toISOString(),
      fin: rangeEnd.toISOString(),
    }),
    enabled: view === 'carte',
  });

  const [avancement, setAvancement] = useState<Avancement | null>(null);

  const localisation = useMutation({
    mutationFn: async () => {
      const periode = { debut: rangeStart.toISOString(), fin: rangeEnd.toISOString() };

      // Perimetre volontairement etroit : geocoder tout le carnet ferait des
      // centaines d'appels pour des points que personne n'ira voir.
      const ids = await leadsDInterventions(periode);
      const parLead = await localiserLeadsManquants({
        idsLimites: ids,
        onAvancement: setAvancement,
      });

      // Les rendez-vous qui portent leur propre adresse echappent a la reprise
      // des leads : leur point ne peut venir que de cette adresse-la.
      const parRendezVous = await localiserRendezVousManquants({
        ...periode,
        onAvancement: (a) => setAvancement({
          ...a,
          traites: parLead.traites + a.traites,
          total: parLead.total + a.total,
        }),
      });

      return {
        localises: parLead.localises + parRendezVous.localises,
        introuvables: parLead.introuvables + parRendezVous.introuvables,
      };
    },
    onSuccess: (r) => {
      setAvancement(null);
      queryClient.invalidateQueries({ queryKey: ['interventions-carte'] });
      queryClient.invalidateQueries({ queryKey: ['interventions-non-localisees'] });
      toast.success(`${r.localises} intervention(s) localisée(s)`, {
        description: r.introuvables > 0
          ? `${r.introuvables} adresse(s) introuvable(s) dans le référentiel.`
          : undefined,
      });
    },
    onError: (e: Error) => {
      setAvancement(null);
      toast.error('La localisation a échoué', { description: e.message });
    },
  });

  // Les filtres sont replies par defaut sur telephone : on vient voir le
  // planning, pas le restreindre.
  const [filtresOuverts, setFiltresOuverts] = useState(false);
  const estMobile = useEstMobile();
  const filtresActifs = [advisorFilter, techFilter, statusFilter]
    .filter((v) => v !== 'all').length;

  // ---- Client-side status filter ----
  const filteredAppts = useMemo(() => {
    const appts = appointmentsQuery.data ?? [];
    if (statusFilter === 'all') return appts;
    return appts.filter((a) => a.status === statusFilter);
  }, [appointmentsQuery.data, statusFilter]);

  const profiles = profilesQuery.data ?? [];
  const advisors = profiles.filter((p) =>
    ['admin', 'manager', 'advisor'].includes(p.role)
  );
  const technicians = profiles.filter((p) => p.role === 'technician');

  // ---- Mutations ----
  const createMutation = useMutation({
    mutationFn: async (data: Partial<Appointment>) => {
      const res = await createAppointment(data);
      if (res.error || !res.appointment) {
        throw new Error(res.error ?? 'Le rendez-vous n’a pas été créé');
      }
      if (data.lead_id) {
        const { error } = await updateLead(data.lead_id, { status: 'appointment_scheduled' });
        if (error) {
          // Evite qu'un nouvel essai cree un doublon : si la seconde ecriture
          // echoue, on retire le rendez-vous qui vient juste d'etre cree.
          const annulation = await deleteAppointment(res.appointment.id);
          if (annulation.error) {
            throw new Error(`Rendez-vous créé, mais étape du lead non mise à jour : ${error}`);
          }
          throw new Error(`Le rendez-vous n’a pas été conservé car l’étape du lead n’a pas pu être mise à jour : ${error}`);
        }
      }
      return res.appointment;
    },
    onSuccess: (appointment) => {
      toast.success('Rendez-vous créé', { description: appointment.title });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['relances'] });
      setCreateOpen(false);
      setInitialLeadId(undefined);
    },
    onError: (err) => toast.error('Erreur lors de la création', { description: err.message }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id, updates, leadId, previousStatus,
    }: {
      id: string;
      updates: Partial<Appointment>;
      leadId?: string | null;
      previousStatus?: AppointmentStatus;
    }) => {
      const res = await updateAppointment(id, updates);
      if (res.error) throw new Error(res.error);

      if (updates.status === 'completed' && leadId) {
        const { error } = await updateLead(leadId, { status: 'converted' });
        if (error) {
          if (previousStatus) {
            const retour = await updateAppointment(id, { status: previousStatus });
            if (retour.error) {
              throw new Error(`Intervention terminée, mais dossier non clôturé : ${error}`);
            }
          }
          throw new Error(`L’intervention n’a pas été terminée car le dossier n’a pas pu être clôturé : ${error}`);
        }
      }
    },
    onSuccess: (_, vars) => {
      toast.success('Rendez-vous mis à jour');
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['relances'] });
      setSelectedAppt((prev) => (prev ? { ...prev, ...vars.updates } : prev));
    },
    onError: (err) => toast.error('Erreur lors de la mise à jour', { description: err.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAppointment(id),
    onSuccess: (res) => {
      if (res.error) {
        toast.error('Erreur lors de la suppression', { description: res.error });
        return;
      }
      toast.success('Rendez-vous supprimé');
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      setDetailOpen(false);
      setSelectedAppt(null);
    },
    onError: (err) => toast.error('Erreur lors de la suppression', { description: err.message }),
  });

  // La fiche s'ouvre en surface superposee : l'agenda reste monte derriere,
  // avec sa periode et ses filtres intacts.
  const ouvrirIntervention = (leadId: string) => {
    navigate(`/interventions/${leadId}`, { state: { background: fondDepuis(location) } });
  };

  // ---- Navigation ----
  function goPrev() {
    if (view === 'day') setCurrentDate((d) => subDays(d, 1));
    else if (view === 'week' || view === 'carte') setCurrentDate((d) => subDays(d, 7));
    else setCurrentDate((d) => subMonths(d, 1));
  }

  function goNext() {
    if (view === 'day') setCurrentDate((d) => addDays(d, 1));
    else if (view === 'week' || view === 'carte') setCurrentDate((d) => addDays(d, 7));
    else setCurrentDate((d) => addMonths(d, 1));
  }

  function goToday() {
    setCurrentDate(new Date());
  }

  // ---- Appointment click ----
  function handleApptClick(appt: Appointment) {
    setSelectedAppt(appt);
    setDetailOpen(true);
  }

  // ---- Detail sheet actions ----
  function handleConfirm() {
    if (!selectedAppt) return;
    updateMutation.mutate({ id: selectedAppt.id, updates: { status: 'confirmed' } });
  }
  function handleComplete() {
    if (!selectedAppt) return;
    updateMutation.mutate({
      id: selectedAppt.id,
      updates: { status: 'completed' },
      // Un appel ou une reunion termines ne signifient pas que le vitrage a
      // ete pose. Seule une intervention clot le parcours commercial.
      leadId: selectedAppt.type === 'intervention' ? selectedAppt.lead_id : null,
      previousStatus: selectedAppt.status,
    });
  }
  function handleCancelAppt() {
    if (!selectedAppt) return;
    updateMutation.mutate({ id: selectedAppt.id, updates: { status: 'cancelled' } });
  }
  function handleDelete() {
    // La confirmation est portee par ConfirmerSuppression : un rendez-vous
    // efface au clic ne se recupere pas.
    setConfirmerSuppression(true);
  }

  function supprimerVraiment() {
    if (!selectedAppt) return;
    setConfirmerSuppression(false);
    deleteMutation.mutate(selectedAppt.id);
  }

  // ---- Period label ----
  // Entre deux fleches et le bouton « Aujourd'hui », il reste environ 150 px
  // sur un telephone : « Mardi 6 octobre 2026 » y passe a la ligne et pousse
  // toute la barre. L'annee se devine, le jour abrege se lit.
  const periodLabel = useMemo(() => {
    if (view === 'day') {
      return cap(format(currentDate, estMobile ? 'EEE d MMM' : 'EEEE d MMMM yyyy', { locale: fr }));
    }
    if (view === 'week' || view === 'carte') {
      const start = startOfWeek(currentDate, { weekStartsOn: 1 });
      const end = endOfWeek(currentDate, { weekStartsOn: 1 });
      if (estMobile) {
        return `${format(start, 'd', { locale: fr })} – ${format(end, 'd MMM', { locale: fr })}`;
      }
      if (isSameMonth(start, end)) {
        return `${format(start, 'd', { locale: fr })} – ${format(end, 'd MMMM yyyy', { locale: fr })}`;
      }
      return `${format(start, 'd MMM', { locale: fr })} – ${format(end, 'd MMM yyyy', { locale: fr })}`;
    }
    return cap(format(currentDate, estMobile ? 'MMM yyyy' : 'MMMM yyyy', { locale: fr }));
  }, [view, currentDate, estMobile]);

  const isLoading = appointmentsQuery.isLoading;
  const hasAppts = filteredAppts.length > 0;

  return (
    <div className="flex min-h-full flex-col bg-background">
      <PageHeader
        title="Agenda"
        description="Planning et rendez-vous"
        action={!estTechnicien ? (
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
            <GoogleCalendarControl onSynced={() => {
              queryClient.invalidateQueries({ queryKey: ['appointments'] });
              queryClient.invalidateQueries({ queryKey: ['interventions-carte'] });
            }} />
            <Button className="gap-1.5 rounded-full" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Nouveau rendez-vous
            </Button>
          </div>
        ) : undefined}
      />

      {/* Toolbar */}
      <div className="gutter-x border-b border-border py-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {/* Navigation */}
          <div className="flex w-full items-center gap-2 lg:w-auto">
            <Button variant="outline" size="icon" className="shrink-0 md:h-8 md:w-8" onClick={goPrev} aria-label="Période précédente">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-0 flex-1 text-center text-sm font-medium text-foreground lg:min-w-[160px] lg:flex-none">
              {periodLabel}
            </span>
            <Button variant="outline" size="icon" className="shrink-0 md:h-8 md:w-8" onClick={goNext} aria-label="Période suivante">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="shrink-0 md:h-8" onClick={goToday}>
              Aujourd'hui
            </Button>
          </div>

          {/* View toggle + filters */}
          <div className="grid w-full grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap lg:w-auto">
            {/* View toggle */}
            <div className="col-span-2 grid grid-cols-4 items-center rounded-lg border border-border bg-muted/40 p-0.5 sm:inline-flex">
              {(['day', 'week', 'month', 'carte'] as View[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  className={cn(
                    'min-h-11 rounded-md px-2 py-1 text-sm font-medium transition-colors md:min-h-0 md:px-3',
                    view === v
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                  onClick={() => setView(v)}
                >
                  {v === 'day' ? 'Jour' : v === 'week' ? 'Semaine' : v === 'month' ? 'Mois' : 'Carte'}
                </button>
              ))}
            </div>

            {/* Trois listes deroulantes repoussaient le premier rendez-vous
                sous la ligne de flottaison d'un telephone. Elles se replient,
                et le bouton dit combien de filtres sont actifs -- sans quoi
                on ne saurait pas qu'une vue est restreinte. */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="col-span-2 rounded-full sm:hidden"
              onClick={() => setFiltresOuverts((ouverts) => !ouverts)}
              aria-expanded={filtresOuverts}
            >
              <SlidersHorizontal className="mr-1.5 h-4 w-4" />
              Filtres
              {filtresActifs > 0 && (
                <span className="ml-1.5 rounded-full bg-primary px-1.5 text-[11px] font-semibold tabular-nums text-primary-foreground">
                  {filtresActifs}
                </span>
              )}
            </Button>

            <div className={cn(
              // `contents` au-dessus de `sm` : les trois listes retrouvent
              // leur place dans la barre, comme si ce conteneur n'existait pas.
              'col-span-2 grid grid-cols-1 gap-2 sm:contents',
              !filtresOuverts && 'hidden sm:contents',
            )}>
            {/* Advisor filter */}
            <Select
              value={advisorFilter}
              onValueChange={(v) => {
                setAdvisorFilter(v);
                setTechFilter('all');
              }}
            >
              <SelectTrigger className="w-full sm:w-[160px] md:h-8">
                <SelectValue placeholder="Conseiller" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les conseillers</SelectItem>
                {advisors.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {profileName(p)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Technician filter */}
            <Select
              value={techFilter}
              onValueChange={(v) => {
                setTechFilter(v);
                setAdvisorFilter('all');
              }}
            >
              <SelectTrigger className="w-full sm:w-[160px] md:h-8">
                <SelectValue placeholder="Technicien" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les techniciens</SelectItem>
                {technicians.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {profileName(p)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Status filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[150px] md:h-8">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="scheduled">Planifié</SelectItem>
                <SelectItem value="confirmed">Confirmé</SelectItem>
                <SelectItem value="completed">Terminé</SelectItem>
                <SelectItem value="cancelled">Annulé</SelectItem>
                <SelectItem value="no_show">Absent</SelectItem>
              </SelectContent>
            </Select>
            </div>
          </div>
        </div>
      </div>

      {/* Calendar body */}
      <div className="flex-1 overflow-x-auto p-2 sm:p-4 lg:p-6">
        {isLoading ? (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Skeleton className="h-8 w-full" />
            </div>
            <Skeleton className="h-[600px] w-full rounded-lg" />
          </div>
        ) : appointmentsQuery.isError ? (
          // Sans cette branche, une requete en echec tombait sur « Aucun
          // rendez-vous » : une panne ressemblait a une journee vide, et un
          // technicien pouvait rentrer chez lui en croyant n'avoir rien.
          <EtatErreur
            titre="Planning indisponible"
            erreur={appointmentsQuery.error}
            onReessayer={() => void appointmentsQuery.refetch()}
            className="min-h-[400px] rounded-xl border border-dashed border-border"
          />
        ) : !hasAppts ? (
          <div className="flex min-h-[400px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border">
            <CalendarIcon className="h-10 w-10 text-muted-foreground/30" />
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">Aucun rendez-vous</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Aucun rendez-vous sur cette période.
              </p>
            </div>
            {!estTechnicien && (
              <Button variant="outline" size="sm" className="mt-1 gap-1.5" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" />
                Nouveau rendez-vous
              </Button>
            )}
          </div>
        ) : view === 'carte' ? (
          /* `dvh` et non `vh` : sur telephone la barre d'adresse se retracte,
             et `100vh` laissait la carte depasser sous l'ecran. */
          <div className="h-[calc(100dvh-20rem)] min-h-[360px] sm:h-[calc(100dvh-16rem)] sm:min-h-[420px]">
            <CarteInterventions
              interventions={carte?.interventions ?? []}
              tronque={carte?.tronque ?? false}
              onOuvrirLead={ouvrirIntervention}
              nonLocalisees={nonLocalisees ?? 0}
              onLocaliser={() => localisation.mutate()}
              localisationEnCours={localisation.isPending}
              avancement={avancement}
            />
          </div>
        ) : view === 'day' ? (
          <DayView
            currentDate={currentDate}
            appts={filteredAppts}
            today={today}
            onApptClick={handleApptClick}
          />
        ) : view === 'week' ? (
          <WeekView
            currentDate={currentDate}
            appts={filteredAppts}
            today={today}
            onApptClick={handleApptClick}
          />
        ) : (
          <MonthView
            currentDate={currentDate}
            appts={filteredAppts}
            today={today}
            onApptClick={handleApptClick}
            onDayClick={(day) => {
              setCurrentDate(day);
              setView('day');
            }}
          />
        )}
      </div>

      {/* Detail sheet */}
      <AppointmentDetailSheet
        open={detailOpen}
        onOpenChange={setDetailOpen}
        appointment={selectedAppt}
        profiles={profiles}
        onConfirm={handleConfirm}
        onComplete={handleComplete}
        onCancel={handleCancelAppt}
        onDelete={handleDelete}
        updating={updateMutation.isPending}
        deleting={deleteMutation.isPending}
        peutModifier={!estTechnicien || selectedAppt?.assigned_user_id === user?.id}
        peutSupprimer={!estTechnicien}
        peutNaviguerHorsPlanning={!estTechnicien}
        onOffreEnregistree={() => {
          queryClient.invalidateQueries({ queryKey: ['appointments'] });
          queryClient.invalidateQueries({ queryKey: ['leads'] });
          // Prefixe : couvre aussi ['lead', id], la fiche ouverte a cote.
          queryClient.invalidateQueries({ queryKey: ['lead'] });
        }}
      />

      {!estTechnicien && <ConfirmerSuppression
        ouvert={confirmerSuppression}
        onOuvertChange={setConfirmerSuppression}
        nom={selectedAppt?.title ?? 'ce rendez-vous'}
        consequence="Le rendez-vous sera retiré du planning. Le client n'en sera pas informé automatiquement."
        enCours={deleteMutation.isPending}
        onConfirmer={supprimerVraiment}
        alternative={
          <>
            Si le client a annulé, préférez le passer en{' '}
            <span className="font-medium text-foreground">Annulé</span> : l'historique
            reste consultable et le créneau se libère.
          </>
        }
      />}

      {/* Create dialog */}
      {!estTechnicien && <CreateAppointmentDialog
        open={createOpen}
        onOpenChange={(ouvert) => {
          setCreateOpen(ouvert);
          if (!ouvert) setInitialLeadId(undefined);
        }}
        profiles={profiles}
        onCreate={(data) => createMutation.mutate(data)}
        creating={createMutation.isPending}
        initialLeadId={initialLeadId}
      />}
    </div>
  );
}
