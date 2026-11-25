import { supabase } from '../../../packages/auth/index.ts';
import { presenceDeadline } from './presenceTimeout.ts';
import { parseDraft } from './socialPresenceModel.ts';
import type { PresenceDraft } from './socialPresenceModel.ts';

async function requireOwner(ownerId: string) {
  const { data, error } = await presenceDeadline(supabase.auth.getUser());
  if (error || !data.user || data.user.is_anonymous || data.user.id !== ownerId) {
    throw new Error('Iniciá sesión nuevamente para acceder a tu configuración privada.');
  }
}
const cloudError = () => new Error('El guardado privado en la nube todavía no está disponible. Tu borrador local se conserva.');
export async function loadCloudPresence(ownerId: string): Promise<{ draft: PresenceDraft; revision: number } | null> {
  await requireOwner(ownerId);
  const { data, error } = await presenceDeadline(supabase.from('youapp_social_workspaces')
    .select('owner_id,draft,revision').eq('owner_id', ownerId).maybeSingle());
  if (error) throw cloudError();
  if (!data) return null;
  if (data.owner_id !== ownerId) throw cloudError();
  return { draft: parseDraft(JSON.stringify(data.draft), ownerId), revision: data.revision };
}
export async function saveCloudPresence(draft: PresenceDraft, revision: number | null): Promise<number> {
  await requireOwner(draft.ownerId);
  const safe = parseDraft(JSON.stringify(draft), draft.ownerId);
  const table = supabase.from('youapp_social_workspaces');
  const query = revision === null
    ? table.insert({ owner_id: draft.ownerId, draft: safe })
    : table.update({ draft: safe }).eq('owner_id', draft.ownerId).eq('revision', revision);
  const { data, error } = await presenceDeadline(query.select('owner_id,revision').maybeSingle());
  if (error?.code === '23505' || (!error && !data)) {
    throw new Error('La configuración cambió en otra sesión. Recargá antes de volver a guardar; tu borrador local está conservado.');
  }
  if (error || !data || data.owner_id !== draft.ownerId) throw cloudError();
  return data.revision;
}
