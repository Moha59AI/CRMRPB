import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('le technicien est limite au planning partage', async () => {
  const [permissions, layout, calendar, migration] = await Promise.all([
    read('src/config/permissions.ts'),
    read('src/layouts/app-layout.tsx'),
    read('src/features/calendar/calendar-page.tsx'),
    read('supabase/migrations/20261006200000_planning_partage_techniciens.sql'),
  ]);

  assert.match(permissions, /role === 'technician'/);
  assert.match(permissions, /chemin === '\/calendar'/);
  assert.match(permissions, /case 'technician': return '\/calendar'/);
  assert.match(layout, /!estTechnicien && <CopilotRadar/);
  assert.match(layout, /!estTechnicien && \(/);
  assert.match(layout, /!estMobile && <ClocheNotifications/);
  assert.match(calendar, /planning-partage:/);
  assert.match(calendar, /refetchInterval: 30_000/);
  assert.match(calendar, /peutModifier=\{!estTechnicien \|\| selectedAppt\?\.assigned_user_id === user\?\.id\}/);
  assert.match(migration, /workspace_id = public\.get_workspace_id\(\)/);
  assert.match(migration, /alter publication supabase_realtime add table public\.appointments/);
});
