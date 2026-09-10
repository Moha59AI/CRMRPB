import { createClient } from 'npm:@supabase/supabase-js@2.58.0';
import webpush from 'npm:web-push@3.6.7';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const admin = createClient(supabaseUrl, serviceRoleKey);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type SubscriptionInput = {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
};

type VapidKeys = { publicKey: string; privateKey: string };

const safeLeadPushTitles = new Set([
  'Nouveau lead Meta',
  'Nouveau lead Google Ads',
  'Nouveau lead CRM',
]);

function safeLeadPushContent(notification: {
  type?: unknown;
  push_title?: unknown;
  push_body?: unknown;
}): { title: string; body: string } | null {
  if (notification.type !== 'lead') return null;

  const title = typeof notification.push_title === 'string'
    ? notification.push_title.trim()
    : '';
  const body = typeof notification.push_body === 'string'
    ? notification.push_body.trim()
    : '';

  if (!safeLeadPushTitles.has(title)) return null;
  if (!/^Code postal (?:[0-9]{5}|non renseigné)$/u.test(body)) return null;
  return { title, body };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function bearer(req: Request): string {
  const value = req.headers.get('Authorization') ?? '';
  return value.startsWith('Bearer ') ? value.slice(7) : '';
}

function validSubscription(value: SubscriptionInput): value is {
  endpoint: string;
  keys: { p256dh: string; auth: string };
} {
  return typeof value.endpoint === 'string'
    && value.endpoint.startsWith('https://')
    && value.endpoint.length <= 2048
    && typeof value.keys?.p256dh === 'string'
    && value.keys.p256dh.length >= 32
    && typeof value.keys?.auth === 'string'
    && value.keys.auth.length >= 8;
}

async function authenticatedProfile(req: Request) {
  const token = bearer(req);
  if (!token) throw new Error('UNAUTHORIZED');

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) throw new Error('UNAUTHORIZED');

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, workspace_id')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (profileError) throw new Error(profileError.message);
  if (!profile) throw new Error('FORBIDDEN');
  return profile;
}

async function readVault(name: string): Promise<string | null> {
  const { data, error } = await admin.rpc('vault_read_secret', { secret_name: name });
  if (error) throw new Error(error.message);
  return typeof data === 'string' && data ? data : null;
}

async function getOrCreateVapidKeys(): Promise<VapidKeys> {
  const existing = await readVault('push_vapid_keys');
  if (existing) {
    const parsed = JSON.parse(existing) as Partial<VapidKeys>;
    if (parsed.publicKey && parsed.privateKey) return parsed as VapidKeys;
  }

  const generated = webpush.generateVAPIDKeys();
  const { data, error } = await admin.rpc('vault_get_or_create_secret', {
    secret_name: 'push_vapid_keys',
    proposed_secret: JSON.stringify(generated),
  });
  if (error || typeof data !== 'string') {
    throw new Error('Impossible de stocker les cles push : ' + (error?.message ?? 'reponse invalide'));
  }
  const parsed = JSON.parse(data) as Partial<VapidKeys>;
  if (!parsed.publicKey || !parsed.privateKey) throw new Error('Cles push invalides dans Vault');
  return parsed as VapidKeys;
}

async function dispatchAuthorized(req: Request): Promise<boolean> {
  const received = req.headers.get('x-push-secret') ?? '';
  if (!received) return false;
  const expected = await readVault('push_dispatch_secret');
  if (!expected || received.length !== expected.length) return false;

  // Comparaison sans arret au premier caractere different pour ne pas rendre
  // le secret mesurable octet par octet a travers le temps de reponse.
  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) {
    mismatch |= expected.charCodeAt(i) ^ received.charCodeAt(i);
  }
  return mismatch === 0;
}

async function sendToSubscription(
  subscription: { id: string; endpoint: string; p256dh: string; auth: string },
  payload: Record<string, unknown>,
) {
  const vapid = await getOrCreateVapidKeys();
  webpush.setVapidDetails(
    'mailto:contact@relaisparebrise.fr',
    vapid.publicKey,
    vapid.privateKey,
  );

  try {
    await webpush.sendNotification({
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.p256dh, auth: subscription.auth },
    }, JSON.stringify(payload), { TTL: 300 });

    await admin.from('push_subscriptions').update({
      last_success_at: new Date().toISOString(),
      failure_count: 0,
      updated_at: new Date().toISOString(),
    }).eq('id', subscription.id);
    return true;
  } catch (error) {
    const statusCode = Number((error as { statusCode?: number }).statusCode ?? 0);
    if (statusCode === 404 || statusCode === 410) {
      await admin.from('push_subscriptions').delete().eq('id', subscription.id);
    } else {
      await admin.rpc('increment_push_subscription_failure', { subscription_id: subscription.id });
    }
    console.error('web-push send', statusCode, error);
    return false;
  }
}

async function register(req: Request, body: Record<string, unknown>) {
  const profile = await authenticatedProfile(req);
  const subscription = (body.subscription ?? {}) as SubscriptionInput;
  if (!validSubscription(subscription)) return json({ error: 'Abonnement push invalide' }, 400);

  const { data: existing, error: existingError } = await admin
    .from('push_subscriptions')
    .select('id, user_id')
    .eq('endpoint', subscription.endpoint)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing && existing.user_id !== profile.id) {
    return json({ error: 'Cet appareil appartient deja a un autre compte' }, 409);
  }

  const values = {
    workspace_id: profile.workspace_id,
    user_id: profile.id,
    endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
    device_label: typeof body.device_label === 'string'
      ? body.device_label.slice(0, 80)
      : 'Appareil',
    failure_count: 0,
    updated_at: new Date().toISOString(),
  };

  const result = existing
    ? await admin.from('push_subscriptions').update(values).eq('id', existing.id)
    : await admin.from('push_subscriptions').insert(values);
  if (result.error) throw new Error(result.error.message);
  return json({ success: true });
}

async function testCurrentDevice(req: Request, body: Record<string, unknown>) {
  const profile = await authenticatedProfile(req);
  const endpoint = typeof body.endpoint === 'string' ? body.endpoint : '';
  const { data: subscription, error } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', profile.id)
    .eq('endpoint', endpoint)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!subscription) return json({ error: 'Cet appareil n’est pas inscrit' }, 404);

  const success = await sendToSubscription(subscription, {
    title: 'Notifications activées',
    body: 'Cet appareil recevra les alertes du CRM, même lorsque celui-ci est fermé.',
    link: '/today',
    tag: 'essai-push',
    force: true,
  });
  return success ? json({ success: true }) : json({ error: 'Envoi du test impossible' }, 502);
}

async function dispatch(body: Record<string, unknown>) {
  const notificationId = typeof body.notification_id === 'string' ? body.notification_id : '';
  if (!notificationId) return json({ error: 'Notification absente' }, 400);

  const { data: notification, error: notificationError } = await admin
    .from('notifications')
    .select('id, user_id, type, link, push_title, push_body')
    .eq('id', notificationId)
    .maybeSingle();
  if (notificationError) throw new Error(notificationError.message);
  if (!notification?.user_id) return json({ success: true, sent: 0 });

  const safePush = safeLeadPushContent(notification);

  const { data: subscriptions, error: subscriptionsError } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', notification.user_id);
  if (subscriptionsError) throw new Error(subscriptionsError.message);

  const results = await Promise.all((subscriptions ?? []).map((subscription) =>
    sendToSubscription(subscription, {
      // Le push traverse le service Apple/Google/Mozilla et peut apparaitre
      // sur un ecran verrouille : seuls la source du lead et un code postal
      // strictement valide sont autorises. Tout autre contenu reste generique.
      title: safePush?.title ?? 'Nouvelle notification CRM',
      body: safePush?.body ?? 'Ouvrez le CRM pour consulter la nouvelle information.',
      link: notification.link || '/today',
      tag: notification.id,
    })
  ));
  return json({ success: true, sent: results.filter(Boolean).length });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);

  try {
    const body = await req.json() as Record<string, unknown>;
    const action = typeof body.action === 'string' ? body.action : '';

    if (action === 'dispatch') {
      if (!(await dispatchAuthorized(req))) return json({ error: 'Unauthorized' }, 401);
      return await dispatch(body);
    }

    if (action === 'config') {
      await authenticatedProfile(req);
      const vapid = await getOrCreateVapidKeys();
      return json({ public_key: vapid.publicKey });
    }
    if (action === 'register') return await register(req, body);
    if (action === 'test') return await testCurrentDevice(req, body);
    return json({ error: 'Action inconnue' }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === 'UNAUTHORIZED' ? 401 : message === 'FORBIDDEN' ? 403 : 500;
    console.error('web-push', error);
    return json({ error: status === 500 ? 'Le service push est indisponible' : message }, status);
  }
});
