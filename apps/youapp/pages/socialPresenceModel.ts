export const SOCIAL_NETWORKS = [
  { id: 'youtube', name: 'YouTube', mark: '▶', color: '#dc2626', url: 'https://www.youtube.com/channel_switcher', requirement: 'Canal de YouTube y autorización de Google.' },
  { id: 'instagram', name: 'Instagram', mark: '◎', color: '#c026d3', url: 'https://www.instagram.com/', requirement: 'Cuenta profesional y autorización de Instagram o Meta.' },
  { id: 'facebook', name: 'Facebook', mark: 'f', color: '#2563eb', url: 'https://www.facebook.com/pages/', requirement: 'Página que administrás y autorización de Meta.' },
  { id: 'tiktok', name: 'TikTok', mark: '♪', color: '#0f172a', url: 'https://www.tiktok.com/', requirement: 'Cuenta de TikTok. Publicación sujeta a permisos y auditoría.' },
  { id: 'x', name: 'X', mark: '𝕏', color: '#334155', url: 'https://x.com/', requirement: 'Cuenta de X. Automatización pendiente de presupuesto aprobado.' }
] as const;
export type NetworkId = typeof SOCIAL_NETWORKS[number]['id'];
export type PlanChoice = 'later' | 'existing' | 'create';
export interface SocialPlan {
  choice: PlanChoice;
  handle: string;
  status: 'PENDING' | 'PENDING_AUTHORIZATION';
}
export interface PresenceDraft {
  version: 1;
  ownerId: string;
  name: string;
  handle: string;
  description: string;
  topic: string;
  language: string;
  country: string;
  plans: Record<NetworkId, SocialPlan>;
  updatedAt: string | null;
}
export function emptyDraft(ownerId: string): PresenceDraft {
  return {
    version: 1, ownerId, name: '', handle: '', description: '', topic: '', language: 'es', country: 'Argentina',
    plans: Object.fromEntries(SOCIAL_NETWORKS.map(n => [n.id, { choice: 'later', handle: '', status: 'PENDING' }])) as PresenceDraft['plans'],
    updatedAt: null
  };
}
const text = (value: unknown, max: number) => typeof value === 'string' ? value.slice(0, max) : '';
export function parseDraft(raw: string | null, ownerId: string): PresenceDraft {
  const draft = emptyDraft(ownerId);
  try {
    if (!raw || raw.length > 20000) return draft;
    const value = JSON.parse(raw);
    if (value.version !== 1 || value.ownerId !== ownerId) return draft;
    for (const [field, max] of [['name', 80], ['handle', 40], ['description', 300], ['topic', 80], ['language', 10], ['country', 60]] as const) {
      draft[field] = text(value[field], max);
    }
    for (const network of SOCIAL_NETWORKS) {
      const plan = value.plans?.[network.id];
      const choice: PlanChoice = ['existing', 'create', 'later'].includes(plan?.choice) ? plan.choice : 'later';
      // Browser storage is a planning draft, never evidence of ownership or connection.
      draft.plans[network.id] = { choice, handle: text(plan?.handle, 80), status: choice === 'existing' ? 'PENDING_AUTHORIZATION' : 'PENDING' };
    }
    draft.updatedAt = typeof value.updatedAt === 'string' && !Number.isNaN(Date.parse(value.updatedAt)) ? value.updatedAt : null;
  } catch { /* Malformed storage must not crash registration. */ }
  return draft;
}
export function saveDraft(storage: Pick<Storage, 'setItem'>, draft: PresenceDraft): PresenceDraft {
  if (!draft.name.trim()) throw new Error('Ingresá el nombre de tu marca o proyecto.');
  if (draft.handle && !/^[a-zA-Z0-9._-]{2,40}$/.test(draft.handle)) throw new Error('Usá de 2 a 40 letras, números, puntos, guiones o guiones bajos para el usuario.');
  const safe = parseDraft(JSON.stringify(draft), draft.ownerId);
  safe.name = safe.name.trim();
  safe.updatedAt = new Date().toISOString();
  storage.setItem(storageKey(draft.ownerId), JSON.stringify(safe));
  return safe;
}
export const storageKey = (ownerId: string) => 'youapp:presence:v1:' + encodeURIComponent(ownerId);
export function profileText(draft: PresenceDraft, networkId: NetworkId) {
  return [draft.name, '@' + (draft.plans[networkId].handle || draft.handle).replace(/^@/, ''), draft.description].filter(line => line !== '@').join('\n');
}
