/*
# File d'attente des leads Meta

## Problème résolu

`meta-lead-webhook` appelait l'API Graph de façon synchrone, à l'intérieur du
handler, avant de répondre à Meta. Meta impose une réponse en moins de 20
secondes : un appel Graph lent, un token expiré, ou simplement plusieurs leads
dans un même payload suffisaient à dépasser le délai. Meta considère alors la
livraison en échec et rejoue l'événement — d'où des doublons et du retard.

## Solution

Le webhook se contente désormais d'empiler les `leadgen_id` et répond 200
immédiatement. Un worker (`meta-process-queue`), déclenché chaque minute par
pg_cron, dépile et appelle l'API Graph hors du chemin critique.

`webhook_events` sert de file : `processing_status` porte l'état et
`processing_attempts` le compteur de tentatives. On y ajoute `next_attempt_at`
pour le backoff exponentiel sur 429 et sur token expiré.
*/

-- Colonne de backoff
ALTER TABLE webhook_events
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz DEFAULT now();

-- Dédoublonnage préalable (l'index unique ci-dessous échouerait sinon)
DELETE FROM webhook_events a
USING webhook_events b
WHERE a.ctid < b.ctid
  AND a.workspace_id = b.workspace_id
  AND a.provider = b.provider
  AND a.external_event_id = b.external_event_id
  AND a.external_event_id IS NOT NULL;

-- Idempotence : Meta renvoie parfois deux fois le même leadgen_id.
-- L'unicité est garantie par la base, pas par un SELECT préalable
-- (qui laisse une fenêtre de concurrence entre deux livraisons simultanées).
CREATE UNIQUE INDEX IF NOT EXISTS webhook_events_external_id_uniq
  ON webhook_events (workspace_id, provider, external_event_id)
  WHERE external_event_id IS NOT NULL;

-- Index de dépilement
CREATE INDEX IF NOT EXISTS webhook_events_queue_idx
  ON webhook_events (processing_status, next_attempt_at);
