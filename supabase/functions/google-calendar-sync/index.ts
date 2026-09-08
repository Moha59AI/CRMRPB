import {
  accessToken, adminClient, automationAuthorized, corsHeaders, getGoogleConnection,
  jsonResponse, requireAdmin,
} from '../_shared/google-ads.ts';

const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const DEFAULT_CALENDAR_ID = 'primary';
const TIME_ZONE = 'Europe/Paris';

type AppointmentRow = {
  id: string;
  workspace_id: string;
  title: string;
  start_time: string;
  end_time: string;
  address: string | null;
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';
  google_calendar_event_id: string | null;
  google_calendar_html_link: string | null;
  google_calendar_updated_at: string | null;
  google_calendar_payload_hash: string | null;
};

type GoogleEvent = {
  id?: string;
  status?: string;
  summary?: string;
  location?: string;
  htmlLink?: string;
  updated?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  extendedProperties?: { private?: Record<string, string> };
};

type CalendarMetadata = { id?: string; summary?: string; timeZone?: string };

type SyncResult = {
  created: number;
  updatedInGoogle: number;
  updatedInCrm: number;
  cancelled: number;
};

function calendarUrl(calendarId: string, suffix = ''): string {
  return `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}${suffix}`;
}

async function googleRequest<T>(token: string, url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const responseText = await response.text();
  let payload: unknown = {};
  try {
    payload = responseText ? JSON.parse(responseText) : {};
  } catch {
    payload = { message: responseText.slice(0, 1000) };
  }
  if (!response.ok) {
    const root = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
    const error = root.error && typeof root.error === 'object'
      ? root.error as Record<string, unknown>
      : {};
    throw new Error(String(error.message ?? root.message ?? `Google Agenda HTTP ${response.status}`));
  }
  return payload as T;
}

/**
 * Le contenu exporté est volontairement minimal. Les téléphones, notes,
 * documents, assurances et cadeaux ne sont jamais sélectionnés dans la base,
 * donc ils ne peuvent pas être envoyés à Google par erreur.
 */
function eventPayload(appointment: Pick<
  AppointmentRow,
  'id' | 'workspace_id' | 'title' | 'start_time' | 'end_time' | 'address'
>) {
  return {
    summary: appointment.title,
    location: appointment.address ?? undefined,
    start: { dateTime: appointment.start_time, timeZone: TIME_ZONE },
    end: { dateTime: appointment.end_time, timeZone: TIME_ZONE },
    extendedProperties: {
      private: {
        crmrpb_workspace_id: appointment.workspace_id,
        crmrpb_appointment_id: appointment.id,
      },
    },
  };
}

async function payloadHash(appointment: AppointmentRow): Promise<string> {
  const encoded = new TextEncoder().encode(JSON.stringify(eventPayload(appointment)));
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function eventDateTime(value: GoogleEvent['start']): string | null {
  if (value?.dateTime) {
    const parsed = new Date(value.dateTime);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  if (value?.date) {
    const parsed = new Date(`${value.date}T00:00:00Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  return null;
}

function googleIsNewer(event: GoogleEvent, knownUpdatedAt: string | null): boolean {
  if (!event.updated) return false;
  if (!knownUpdatedAt) return true;
  return new Date(event.updated).getTime() > new Date(knownUpdatedAt).getTime();
}

async function listCrmEvents(
  token: string,
  calendarId: string,
  workspaceId: string,
): Promise<GoogleEvent[]> {
  const events: GoogleEvent[] = [];
  let pageToken = '';
  const timeMin = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const timeMax = new Date(Date.now() + 365 * 86_400_000).toISOString();

  do {
    const params = new URLSearchParams({
      privateExtendedProperty: `crmrpb_workspace_id=${workspaceId}`,
      timeMin,
      timeMax,
      maxResults: '2500',
      showDeleted: 'true',
      singleEvents: 'true',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const page = await googleRequest<{ items?: GoogleEvent[]; nextPageToken?: string }>(
      token,
      `${calendarUrl(calendarId, '/events')}?${params}`,
    );
    events.push(...(page.items ?? []));
    pageToken = page.nextPageToken ?? '';
  } while (pageToken);

  return events;
}

async function saveCalendarError(workspaceId: string, message: string): Promise<void> {
  try {
    const connection = await getGoogleConnection(workspaceId);
    const settings = (connection.settings ?? {}) as Record<string, unknown>;
    const { error } = await adminClient
      .from('integration_connections')
      .update({ settings: { ...settings, calendar_last_error: message } })
      .eq('id', connection.id);
    if (error) console.error('Impossible de mémoriser l erreur Google Agenda:', error.message);
  } catch (error) {
    console.error('Impossible de lire la connexion Google:', error);
  }
}

async function syncWorkspace(workspaceId: string): Promise<SyncResult> {
  const connection = await getGoogleConnection(workspaceId);
  const settings = (connection.settings ?? {}) as Record<string, unknown>;
  if (!settings.calendar_authorized_at) throw new Error('Google Agenda n est pas encore autorise');

  const calendarId = String(settings.calendar_id || DEFAULT_CALENDAR_ID);
  const token = await accessToken(workspaceId, settings);
  const calendar = await googleRequest<CalendarMetadata>(token, calendarUrl(calendarId));
  const googleEvents = await listCrmEvents(token, calendarId, workspaceId);
  const eventsById = new Map(
    googleEvents.filter((event) => event.id).map((event) => [event.id as string, event]),
  );
  const eventsByAppointmentId = new Map(
    googleEvents
      .filter((event) => event.extendedProperties?.private?.crmrpb_appointment_id)
      .map((event) => [event.extendedProperties?.private?.crmrpb_appointment_id as string, event]),
  );

  const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const until = new Date(Date.now() + 365 * 86_400_000).toISOString();
  const { data, error } = await adminClient
    .from('appointments')
    .select([
      'id', 'workspace_id', 'title', 'start_time', 'end_time', 'address', 'status',
      'google_calendar_event_id', 'google_calendar_html_link',
      'google_calendar_updated_at', 'google_calendar_payload_hash',
    ].join(','))
    .eq('workspace_id', workspaceId)
    .gte('start_time', since)
    .lte('start_time', until)
    .order('start_time', { ascending: true })
    .limit(2000);
  if (error) throw new Error(error.message);

  const result: SyncResult = { created: 0, updatedInGoogle: 0, updatedInCrm: 0, cancelled: 0 };

  for (const rawAppointment of data ?? []) {
    const appointment = rawAppointment as AppointmentRow;
    const currentHash = await payloadHash(appointment);
    const crmChanged = currentHash !== appointment.google_calendar_payload_hash;
    const event = appointment.google_calendar_event_id
      ? eventsById.get(appointment.google_calendar_event_id)
      : eventsByAppointmentId.get(appointment.id);
    const remoteChanged = event ? googleIsNewer(event, appointment.google_calendar_updated_at) : false;

    if (event && remoteChanged && !crmChanged) {
      if (event.status === 'cancelled') {
        const { error: cancelError } = await adminClient
          .from('appointments')
          .update({
            status: 'cancelled',
            google_calendar_event_id: event.id ?? appointment.google_calendar_event_id,
            google_calendar_updated_at: event.updated ?? new Date().toISOString(),
            google_calendar_payload_hash: currentHash,
            google_calendar_origin: 'google',
          })
          .eq('id', appointment.id)
          .eq('workspace_id', workspaceId);
        if (cancelError) throw new Error(cancelError.message);
        result.cancelled++;
        continue;
      }

      const startTime = eventDateTime(event.start);
      const endTime = eventDateTime(event.end);
      if (startTime && endTime) {
        const imported = {
          ...appointment,
          title: event.summary?.trim() || appointment.title,
          address: event.location?.trim() || null,
          start_time: startTime,
          end_time: endTime,
        };
        const { error: importError } = await adminClient
          .from('appointments')
          .update({
            title: imported.title,
            address: imported.address,
            start_time: imported.start_time,
            end_time: imported.end_time,
            google_calendar_event_id: event.id ?? appointment.google_calendar_event_id,
            google_calendar_html_link: event.htmlLink ?? appointment.google_calendar_html_link,
            google_calendar_updated_at: event.updated ?? new Date().toISOString(),
            google_calendar_payload_hash: await payloadHash(imported),
            google_calendar_origin: 'google',
          })
          .eq('id', appointment.id)
          .eq('workspace_id', workspaceId);
        if (importError) throw new Error(importError.message);
        result.updatedInCrm++;
        continue;
      }
    }

    if (appointment.status === 'cancelled') {
      if (event && event.status !== 'cancelled' && event.id) {
        await googleRequest<Record<string, never>>(
          token,
          `${calendarUrl(calendarId, `/events/${encodeURIComponent(event.id)}`)}?sendUpdates=none`,
          { method: 'DELETE' },
        );
        result.cancelled++;
      }
      const { error: markCancelledError } = await adminClient
        .from('appointments')
        .update({
          google_calendar_event_id: event?.id ?? appointment.google_calendar_event_id,
          google_calendar_updated_at: event?.updated ?? new Date().toISOString(),
          google_calendar_payload_hash: currentHash,
          google_calendar_origin: 'crm',
        })
        .eq('id', appointment.id)
        .eq('workspace_id', workspaceId);
      if (markCancelledError) throw new Error(markCancelledError.message);
      continue;
    }

    if (event && event.status !== 'cancelled' && event.id) {
      if (!crmChanged) continue;
      const updatedEvent = await googleRequest<GoogleEvent>(
        token,
        `${calendarUrl(calendarId, `/events/${encodeURIComponent(event.id)}`)}?sendUpdates=none`,
        { method: 'PATCH', body: JSON.stringify(eventPayload(appointment)) },
      );
      const { error: updateError } = await adminClient
        .from('appointments')
        .update({
          google_calendar_event_id: updatedEvent.id ?? event.id,
          google_calendar_html_link: updatedEvent.htmlLink ?? event.htmlLink ?? null,
          google_calendar_updated_at: updatedEvent.updated ?? new Date().toISOString(),
          google_calendar_payload_hash: currentHash,
          google_calendar_origin: 'crm',
        })
        .eq('id', appointment.id)
        .eq('workspace_id', workspaceId);
      if (updateError) throw new Error(updateError.message);
      result.updatedInGoogle++;
      continue;
    }

    const createdEvent = await googleRequest<GoogleEvent>(
      token,
      `${calendarUrl(calendarId, '/events')}?sendUpdates=none`,
      { method: 'POST', body: JSON.stringify(eventPayload(appointment)) },
    );
    if (!createdEvent.id) throw new Error('Google Agenda n a pas renvoye d identifiant evenement');
    const { error: createError } = await adminClient
      .from('appointments')
      .update({
        google_calendar_event_id: createdEvent.id,
        google_calendar_html_link: createdEvent.htmlLink ?? null,
        google_calendar_updated_at: createdEvent.updated ?? new Date().toISOString(),
        google_calendar_payload_hash: currentHash,
        google_calendar_origin: 'crm',
      })
      .eq('id', appointment.id)
      .eq('workspace_id', workspaceId);
    if (createError) throw new Error(createError.message);
    result.created++;
  }

  // Relire les réglages avant de les enrichir évite d'écraser une modification
  // Google Ads enregistrée pendant une synchronisation Agenda un peu longue.
  const currentConnection = await getGoogleConnection(workspaceId);
  const currentSettings = (currentConnection.settings ?? {}) as Record<string, unknown>;
  const { error: connectionError } = await adminClient
    .from('integration_connections')
    .update({
      settings: {
        ...currentSettings,
        calendar_id: calendar.id ?? calendarId,
        calendar_name: calendar.summary ?? 'Agenda principal Google',
        calendar_time_zone: calendar.timeZone ?? TIME_ZONE,
        calendar_last_synced_at: new Date().toISOString(),
        calendar_last_error: null,
      },
    })
    .eq('id', currentConnection.id);
  if (connectionError) throw new Error(connectionError.message);

  return result;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method Not Allowed' }, 405);

  try {
    let workspaceIds: string[] = [];
    if (automationAuthorized(req)) {
      const { data, error } = await adminClient
        .from('integration_connections')
        .select('workspace_id, settings')
        .eq('provider', 'google');
      if (error) throw new Error(error.message);
      workspaceIds = [...new Set(
        (data ?? [])
          .filter((row) => Boolean((row.settings as Record<string, unknown> | null)?.calendar_authorized_at))
          .map((row) => row.workspace_id),
      )];
    } else {
      workspaceIds = [(await requireAdmin(req)).workspaceId];
    }

    const results = [];
    for (const workspaceId of workspaceIds) {
      try {
        results.push({ workspaceId, success: true, ...(await syncWorkspace(workspaceId)) });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await saveCalendarError(workspaceId, message);
        results.push({ workspaceId, success: false, error: message });
      }
    }

    const failed = results.filter((result) => !result.success);
    return jsonResponse({
      success: failed.length === 0,
      results,
      error: failed.length ? failed.map((result) => result.error).join(' | ') : null,
    }, failed.length ? 400 : 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === 'UNAUTHORIZED' ? 401 : message === 'FORBIDDEN' ? 403 : 500;
    return jsonResponse({ success: false, error: message }, status);
  }
});
