import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.58.0';

export const IONOS_IMAP_HOST = 'imap.ionos.fr';
export const IONOS_IMAP_PORT = 993;
export const IONOS_SMTP_HOST = 'smtp.ionos.fr';
export const IONOS_SMTP_PORT = 465;

export function ionosPasswordSecretName(workspaceId: string): string {
  return `ionos_email_password_${workspaceId}`;
}

export async function readIonosPassword(
  admin: SupabaseClient,
  workspaceId: string,
): Promise<string | null> {
  const { data, error } = await admin.rpc('vault_read_secret', {
    secret_name: ionosPasswordSecretName(workspaceId),
  });
  if (error) throw new Error(`IONOS_VAULT_READ_FAILED: ${error.message}`);
  return typeof data === 'string' && data.length > 0 ? data : null;
}

export async function writeIonosPassword(
  admin: SupabaseClient,
  workspaceId: string,
  password: string,
): Promise<void> {
  const secretName = ionosPasswordSecretName(workspaceId);
  const current = await readIonosPassword(admin, workspaceId);
  const rpc = current ? 'vault_update_secret' : 'vault_create_secret';
  const args = current
    ? { secret_name: secretName, new_secret: password }
    : { new_secret_name: secretName, new_secret: password };
  const { error } = await admin.rpc(rpc, args);
  if (error) throw new Error(`IONOS_VAULT_WRITE_FAILED: ${error.message}`);
}
