import {
  accessToken, adminClient, automationAuthorized, corsHeaders, getGoogleConnection,
  jsonResponse, requireAdmin,
} from '../_shared/google-ads.ts';

const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const DEFAULT_CALENDAR_ID = 'primary';
const TIME_ZONE = 'Europe/Paris';

/*
  Reconnaitre une intervention dans un evenement Google.

  Les rendez-vous se posent dans Google Agenda, et le CRM les importe. Tout
  importer en `other` revenait a dire qu'aucun n'etait une intervention : la
  carte, qui ne charge que celles-la, restait vide une semaine entiere alors
  que les rendez-vous etaient bien la. La reprise en lot des coordonnees, qui
  filtre pareil, ne les voyait pas davantage.

  Le signal n'est pas a inventer : l'atelier ecrit la plaque entre parentheses
  dans le titre, et c'est deja de cette convention que
  `rattacher_rendez_vous_clients` se sert pour retrouver le client. Un titre
  qui dit « Intervention » compte aussi -- il ne reste alors qu'a lui trouver
  un lieu.

  Un « Rappel - ... » n'en est pas une, et doit rester `other`.
*/
const PLAQUE_ENTRE_PARENTHESES = /\([A-Za-z0-9 -]{5,12}\)/;

function typeDepuisTitre(titre: string): 'intervention' | 'other' {
  const t = titre.trim();
  return PLAQUE_ENTRE_PARENTHESES.test(t) || /^intervention\b/i.test(t)
    ? 'intervention'
    : 'other';
}

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
  // Pour un evenement cree par le CRM avec ce jeton, `creator.email` est le
  // compte Google qui a autorise. C'est le seul moyen de le connaitre sans
  // demander la portee calendar.readonly (Calendars.get) ni openid.
  creator?: { email?: string; self?: boolean };
  organizer?: { email?: string; self?: boolean };
};

/** Ce que l'on apprend sur l'agenda au passage, sans appel supplementaire. */
type IdentiteAgenda = {
  /** `summary` de la reponse events.list : pour l'agenda principal, le nom du compte. */
  nom: string | null;
  /** Adresse du compte Google, deduite des evenements crees par le CRM. */
  compte: string | null;
};

type SyncResult = {
  created: number;
  updatedInGoogle: number;
  updatedInCrm: number;
  cancelled: number;
  /** Rendez-vous nes dans Google et repris dans le CRM. */
  imported: number;
  /** Rendez-vous rattaches a un client via la plaque du titre. */
  linked: number;
};

function calendarUrl(calendarId: string, suffix = ''): string {
  return `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}${suffix}`;
}

async function googleRequest<T>(token: string, url: string, init: RequestInit = {}): Promise<T> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...(init.headers ?? {}),
        },
      });
    } catch (error) {
      clearTimeout(timeout);
      if (attempt < 2) {
        console.warn(`Google Agenda indisponible, nouvelle tentative (${attempt}/2)`);
        continue;
      }
      const timedOut = error instanceof DOMException && error.name === 'AbortError';
      throw new Error(timedOut
        ? 'Google Agenda ne repond pas dans le delai imparti'
        : `Connexion Google Agenda impossible : ${error instanceof Error ? error.message : String(error)}`);
    }
    clearTimeout(timeout);

    const responseText = await response.text();
    let payload: unknown = {};
    try {
      payload = responseText ? JSON.parse(responseText) : {};
    } catch {
      payload = { message: responseText.slice(0, 1000) };
    }
    if (response.ok) return payload as T;

    const root = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
    const error = root.error && typeof root.error === 'object'
      ? root.error as Record<string, unknown>
      : {};
    const message = String(error.message ?? root.message ?? `Google Agenda HTTP ${response.status}`);
    if (attempt < 2 && (response.status === 429 || response.status >= 500)) {
      console.warn(`Google Agenda HTTP ${response.status}, nouvelle tentative (${attempt}/2)`);
      continue;
    }
    throw new Error(message);
  }

  throw new Error('Connexion Google Agenda impossible');
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

/** Memorise le compte des qu'un evenement cree par le CRM le revele. */
function retenirCompte(identite: IdentiteAgenda, events: GoogleEvent[]): void {
  if (identite.compte) return;
  for (const event of events) {
    const email = event.creator?.email ?? event.organizer?.email;
    if (email && email.includes('@')) {
      identite.compte = email;
      return;
    }
  }
}

/**
 * Evenements de l'agenda sur la fenetre de synchronisation.
 *
 * Par defaut, seuls les evenements nes dans le CRM (marques d'une propriete
 * privee) sont lus : les rendez-vous personnels restent chez Google. Avec
 * `toutLire`, la lecture porte sur tout l'agenda -- c'est le reglage
 * « importer les rendez-vous crees dans Google », choisi explicitement.
 */
async function listCrmEvents(
  token: string,
  calendarId: string,
  workspaceId: string,
  identite: IdentiteAgenda,
  toutLire = false,
): Promise<GoogleEvent[]> {
  const events: GoogleEvent[] = [];
  let pageToken = '';
  const timeMin = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const timeMax = new Date(Date.now() + 365 * 86_400_000).toISOString();

  do {
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      maxResults: '2500',
      showDeleted: 'true',
      singleEvents: 'true',
    });
    if (!toutLire) params.set('privateExtendedProperty', `crmrpb_workspace_id=${workspaceId}`);
    if (pageToken) params.set('pageToken', pageToken);
    const page = await googleRequest<{ items?: GoogleEvent[]; nextPageToken?: string; summary?: string }>(
      token,
      `${calendarUrl(calendarId, '/events')}?${params}`,
    );
    if (!identite.nom && page.summary?.trim()) identite.nom = page.summary.trim();
    events.push(...(page.items ?? []));
    pageToken = page.nextPageToken ?? '';
  } while (pageToken);

  retenirCompte(identite, events);

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
  console.info(`[google-calendar-sync] Demarrage workspace ${workspaceId}`);
  const connection = await getGoogleConnection(workspaceId);
  const settings = (connection.settings ?? {}) as Record<string, unknown>;
  if (!settings.calendar_authorized_at) throw new Error('Google Agenda n est pas encore autorise');

  const calendarId = String(settings.calendar_id || DEFAULT_CALENDAR_ID);
  console.info('[google-calendar-sync] Recuperation du jeton OAuth');
  const token = await accessToken(workspaceId, settings);
  console.info('[google-calendar-sync] Jeton OAuth obtenu');
  const identite: IdentiteAgenda = { nom: null, compte: null };
  const importerTout = settings.calendar_import_all === true;
  const googleEvents = await listCrmEvents(token, calendarId, workspaceId, identite, importerTout);
  console.info(`[google-calendar-sync] ${googleEvents.length} evenement(s) CRM trouve(s) chez Google`);
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
  console.info(`[google-calendar-sync] ${(data ?? []).length} rendez-vous CRM a traiter`);

  const result: SyncResult = { created: 0, updatedInGoogle: 0, updatedInCrm: 0, cancelled: 0, imported: 0, linked: 0 };

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
      retenirCompte(identite, [updatedEvent]);
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
    retenirCompte(identite, [createdEvent]);
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

  // ── Import des rendez-vous nes dans Google ─────────────────────────────
  //
  // Un evenement Google qui ne porte pas la marque du CRM et n'est rattache a
  // aucun rendez-vous devient un rendez-vous CRM de type « autre » : il
  // apparait dans l'agenda sans passer pour une intervention, sans lead, sans
  // technicien. Les tours suivants le traitent comme n'importe quel
  // rendez-vous lie -- modifie d'un cote, repris de l'autre.
  //
  // Les evenements « journee entiere » sont laisses de cote : anniversaires,
  // jours feries, blocages -- ce ne sont pas des rendez-vous, et c'est
  // precisement le bruit qu'on ne veut pas dans l'agenda de travail.
  if (importerTout) {
    const dejaLies = new Set(
      ((data ?? []) as AppointmentRow[])
        .map((a) => a.google_calendar_event_id)
        .filter((id): id is string => Boolean(id)),
    );

    for (const event of googleEvents) {
      if (!event.id || event.status === 'cancelled') continue;
      if (event.extendedProperties?.private?.crmrpb_appointment_id) continue;
      if (dejaLies.has(event.id)) continue;
      if (!event.start?.dateTime || !event.end?.dateTime) continue; // journee entiere

      const startTime = eventDateTime(event.start);
      const endTime = eventDateTime(event.end);
      if (!startTime || !endTime) continue;

      const importe = {
        workspace_id: workspaceId,
        title: event.summary?.trim() || 'Rendez-vous Google',
        address: event.location?.trim() || null,
        start_time: startTime,
        end_time: endTime,
      };

      const { error: importError } = await adminClient
        .from('appointments')
        .insert({
          ...importe,
          type: typeDepuisTitre(importe.title),
          status: 'scheduled',
          google_calendar_event_id: event.id,
          google_calendar_html_link: event.htmlLink ?? null,
          google_calendar_updated_at: event.updated ?? new Date().toISOString(),
          // Hash volontairement absent : au tour suivant, le CRM verra une
          // difference, poussera l'evenement vers Google et le marquera de sa
          // propriete privee. Apres ce cycle, il est lie comme les autres.
          google_calendar_payload_hash: null,
          google_calendar_origin: 'google',
        });
      if (importError) throw new Error(importError.message);
      result.imported++;
    }
    if (result.imported) console.info(`[google-calendar-sync] ${result.imported} rendez-vous importe(s) depuis Google`);
  }

  // Un rendez-vous repris de Google arrive sans client. Son titre porte la
  // plaque, et la plaque suffit a retrouver le lead ou le contact -- donc
  // l'adresse et le telephone que l'agenda doit montrer.
  const { data: rattaches, error: rattachementError } = await adminClient
    .rpc('rattacher_rendez_vous_clients', { p_workspace_id: workspaceId });
  if (rattachementError) throw new Error(`rattachement clients: ${rattachementError.message}`);
  result.linked = Number(rattaches ?? 0);
  if (result.linked) console.info(`[google-calendar-sync] ${result.linked} rendez-vous rattache(s) a un client`);

  // Relire les réglages avant de les enrichir évite d'écraser une modification
  // Google Ads enregistrée pendant une synchronisation Agenda un peu longue.
  const currentConnection = await getGoogleConnection(workspaceId);
  const currentSettings = (currentConnection.settings ?? {}) as Record<string, unknown>;
  const { error: connectionError } = await adminClient
    .from('integration_connections')
    .update({
      settings: {
        ...currentSettings,
        // L'API Calendars.get exige calendar.readonly, alors que la
        // synchronisation n'a besoin que de calendar.events. Garder ces
        // valeurs locales évite de demander un droit Google plus large.
        calendar_id: calendarId,
        // Le nom vient de la reponse events.list quand Google le donne ; pour
        // l'agenda principal c'est le nom du compte, ce qui leve l'ambiguite
        // « lequel de mes comptes Google ? ».
        calendar_name: identite.nom ?? String(settings.calendar_name || 'Agenda principal Google'),
        calendar_account_email: identite.compte ?? (settings.calendar_account_email ?? null),
        calendar_time_zone: String(settings.calendar_time_zone || TIME_ZONE),
        calendar_last_synced_at: new Date().toISOString(),
        calendar_last_error: null,
      },
    })
    .eq('id', currentConnection.id);
  if (connectionError) throw new Error(connectionError.message);

  console.info(`[google-calendar-sync] Termine : ${JSON.stringify(result)}`);

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
