import { useMemo, useState } from 'react';
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

import { PageHeader } from '@/components/PageHeader';
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

import {
  fetchAppointments,
  createAppointment,
  updateAppointment,
  deleteAppointment,
  fetchProfiles,
  fetchLeads,
  fetchCases,
} from '@/services/crm-service';
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

type View = 'day' | 'week' | 'month';

const SLOT_HEIGHT = 60; // px per hour
const DAY_START_HOUR = 8;
const DAY_END_HOUR = 18;
const DAY_START_MIN = DAY_START_HOUR * 60;
const TOTAL_MINUTES = (DAY_END_HOUR - DAY_START_HOUR) * 60;
const GRID_HEIGHT = TOTAL_MINUTES * (SLOT_HEIGHT / 60); // 600px

const HOURS = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, i) => i + DAY_START_HOUR);

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: 'Planifié',
  confirmed: 'Confirmé',
  completed: 'Terminé',
  cancelled: 'Annulé',
  no_show: 'Absent',
};

const STATUS_STYLES: Record<AppointmentStatus, string> = {
  scheduled: 'bg-blue-50/80 border-blue-200/70 text-blue-900',
  confirmed: 'bg-green-50/80 border-green-200/70 text-green-900',
  completed: 'bg-gray-100/80 border-gray-200/70 text-gray-600',
  cancelled: 'bg-red-50/70 border-red-200/70 text-red-800 line-through opacity-60',
  no_show: 'bg-amber-50/80 border-amber-200/70 text-amber-900',
};

const STATUS_PILL: Record<AppointmentStatus, string> = {
  scheduled: 'bg-blue-100/80 text-blue-800',
  confirmed: 'bg-green-100/80 text-green-800',
  completed: 'bg-gray-100/80 text-gray-600',
  cancelled: 'bg-red-100/80 text-red-800 line-through',
  no_show: 'bg-amber-100/80 text-amber-800',
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
      <div className="-ml-1 h-2 w-2 rounded-full bg-red-500" />
      <div className="h-px flex-1 bg-red-500" />
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
      {height > 56 && appt.address && (
        <div className="mt-0.5 flex items-center gap-1 truncate text-[10px] opacity-70">
          <MapPin className="h-2.5 w-2.5 shrink-0" />
          <span className="truncate">{appt.address}</span>
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

function DayView({
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
// Week view
// ---------------------------------------------------------------------------

function WeekView({
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
  const weekDays = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(currentDate, { weekStartsOn: 1 }),
        end: endOfWeek(currentDate, { weekStartsOn: 1 }),
      }),
    [currentDate]
  );

  return (
    <div>
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

function MonthView({
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
    <div>
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
                'min-h-[112px] border-b border-r border-border p-1.5',
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

              {/* Appointment pills */}
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
                      STATUS_PILL[appt.status]
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
}) {
  if (!appointment) return null;

  const Icon = TYPE_ICONS[appointment.type] ?? CalendarIcon;
  const assigned = profiles.find((p) => p.id === appointment.assigned_user_id);
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
                appointment.status === 'scheduled' && 'bg-blue-100 text-blue-800',
                appointment.status === 'confirmed' && 'bg-green-100 text-green-800',
                appointment.status === 'completed' && 'bg-gray-100 text-gray-600',
                appointment.status === 'cancelled' && 'bg-red-100 text-red-800',
                appointment.status === 'no_show' && 'bg-amber-100 text-amber-800'
              )}
            >
              {STATUS_LABELS[appointment.status]}
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

          {/* Address */}
          {appointment.address && (
            <div className="flex items-start gap-2 text-sm">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <span>{appointment.address}</span>
            </div>
          )}

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
                    <a
                      href={`/cases?id=${appointment.case_id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      Ouvrir le dossier
                    </a>
                  </dd>
                </div>
              )}
              {appointment.lead_id && (
                <div className="flex items-center justify-between text-sm">
                  <dt className="text-muted-foreground">Lead</dt>
                  <dd>
                    <a
                      href={`/leads?id=${appointment.lead_id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      Ouvrir le lead
                    </a>
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

        <SheetFooter className="flex-row flex-wrap gap-2 border-t border-border pt-4">
          {appointment.status !== 'confirmed' && appointment.status !== 'completed' && (
            <Button
              variant="outline"
              size="sm"
              onClick={onConfirm}
              disabled={updating}
              className="gap-1.5"
            >
              <CheckCircle2 className="h-4 w-4 text-green-600" />
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
              <XCircle className="h-4 w-4 text-red-500" />
              Annuler
            </Button>
          )}
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
        </SheetFooter>
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
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  profiles: Profile[];
  onCreate: (data: Partial<Appointment>) => void;
  creating: boolean;
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
    });
  }

  function handleOpenChange(v: boolean) {
    if (!v) form.reset();
    onOpenChange(v);
  }

  const linkType = form.watch('linkType');
  const errors = form.formState.errors;

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

          {/* Address */}
          <div className="space-y-1.5">
            <Label htmlFor="appt-addr">Adresse</Label>
            <Input id="appt-addr" placeholder="12 rue des Lilas, Paris..." {...form.register('address')} />
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
                  <Select value={field.value ?? ''} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Non assigné" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Non assigné</SelectItem>
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
                  <Select value={field.value ?? ''} onValueChange={field.onChange}>
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
                  Créer le rendez-vous
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
  const today = useMemo(() => new Date(), []);

  const [view, setView] = useState<View>('week');
  const [currentDate, setCurrentDate] = useState<Date>(today);
  const [advisorFilter, setAdvisorFilter] = useState('all');
  const [techFilter, setTechFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

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
    if (view === 'week') {
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
  });

  const profilesQuery = useQuery<Profile[], Error>({
    queryKey: ['profiles'],
    queryFn: () => fetchProfiles(),
  });

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
    mutationFn: (data: Partial<Appointment>) => createAppointment(data),
    onSuccess: (res) => {
      if (res.error) {
        toast.error('Erreur lors de la création', { description: res.error });
        return;
      }
      toast.success('Rendez-vous créé', { description: res.appointment?.title });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      setCreateOpen(false);
    },
    onError: (err) => toast.error('Erreur lors de la création', { description: err.message }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Appointment> }) =>
      updateAppointment(id, updates),
    onSuccess: (res, vars) => {
      if (res.error) {
        toast.error('Erreur lors de la mise à jour', { description: res.error });
        return;
      }
      toast.success('Rendez-vous mis à jour');
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
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

  // ---- Navigation ----
  function goPrev() {
    if (view === 'day') setCurrentDate((d) => subDays(d, 1));
    else if (view === 'week') setCurrentDate((d) => subDays(d, 7));
    else setCurrentDate((d) => subMonths(d, 1));
  }

  function goNext() {
    if (view === 'day') setCurrentDate((d) => addDays(d, 1));
    else if (view === 'week') setCurrentDate((d) => addDays(d, 7));
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
    updateMutation.mutate({ id: selectedAppt.id, updates: { status: 'completed' } });
  }
  function handleCancelAppt() {
    if (!selectedAppt) return;
    updateMutation.mutate({ id: selectedAppt.id, updates: { status: 'cancelled' } });
  }
  function handleDelete() {
    if (!selectedAppt) return;
    deleteMutation.mutate(selectedAppt.id);
  }

  // ---- Period label ----
  const periodLabel = useMemo(() => {
    if (view === 'day') {
      return cap(format(currentDate, 'EEEE d MMMM yyyy', { locale: fr }));
    }
    if (view === 'week') {
      const start = startOfWeek(currentDate, { weekStartsOn: 1 });
      const end = endOfWeek(currentDate, { weekStartsOn: 1 });
      if (isSameMonth(start, end)) {
        return `${format(start, 'd', { locale: fr })} – ${format(end, 'd MMMM yyyy', { locale: fr })}`;
      }
      return `${format(start, 'd MMM', { locale: fr })} – ${format(end, 'd MMM yyyy', { locale: fr })}`;
    }
    return cap(format(currentDate, 'MMMM yyyy', { locale: fr }));
  }, [view, currentDate]);

  const isLoading = appointmentsQuery.isLoading;
  const hasAppts = filteredAppts.length > 0;

  return (
    <div className="flex min-h-full flex-col bg-background">
      <PageHeader
        title="Agenda"
        description="Planning et rendez-vous"
        action={
          <Button className="rounded-full gap-1.5" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Nouveau rendez-vous
          </Button>
        }
      />

      {/* Toolbar */}
      <div className="border-b border-border px-6 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Navigation */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={goPrev}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[160px] text-center text-sm font-medium text-foreground">
              {periodLabel}
            </span>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={goNext}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="ml-1 h-8" onClick={goToday}>
              Aujourd'hui
            </Button>
          </div>

          {/* View toggle + filters */}
          <div className="flex flex-wrap items-center gap-2">
            {/* View toggle */}
            <div className="inline-flex items-center rounded-lg border border-border bg-muted/40 p-0.5">
              {(['day', 'week', 'month'] as View[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  className={cn(
                    'rounded-md px-3 py-1 text-sm font-medium transition-colors',
                    view === v
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                  onClick={() => setView(v)}
                >
                  {v === 'day' ? 'Jour' : v === 'week' ? 'Semaine' : 'Mois'}
                </button>
              ))}
            </div>

            {/* Advisor filter */}
            <Select
              value={advisorFilter}
              onValueChange={(v) => {
                setAdvisorFilter(v);
                setTechFilter('all');
              }}
            >
              <SelectTrigger className="h-8 w-[160px]">
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
              <SelectTrigger className="h-8 w-[160px]">
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
              <SelectTrigger className="h-8 w-[150px]">
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

      {/* Calendar body */}
      <div className="flex-1 overflow-x-auto p-6">
        {isLoading ? (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Skeleton className="h-8 w-full" />
            </div>
            <Skeleton className="h-[600px] w-full rounded-lg" />
          </div>
        ) : !hasAppts ? (
          <div className="flex min-h-[400px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border">
            <CalendarIcon className="h-10 w-10 text-muted-foreground/30" />
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">Aucun rendez-vous</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Aucun rendez-vous sur cette période. Cliquez sur « Nouveau rendez-vous » pour en créer un.
              </p>
            </div>
            <Button variant="outline" size="sm" className="mt-1 gap-1.5" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Nouveau rendez-vous
            </Button>
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
      />

      {/* Create dialog */}
      <CreateAppointmentDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        profiles={profiles}
        onCreate={(data) => createMutation.mutate(data)}
        creating={createMutation.isPending}
      />
    </div>
  );
}
