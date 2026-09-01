/**
 * creatorGraph.ts — Fase 10: Creator Graph V1
 *
 * Cliente del Creator Graph para el frontend.
 * Conecta con la edge function `creator-graph` via Supabase Functions.
 *
 * ┌──────────────────────────────────────────────────────────────┐
 * │                        CREADOR X                            │
 * │                                                              │
 * │  YouTube ──────┐                                             │
 * │  TikTok ───────┤                                             │
 * │  Instagram ────┤  →  creator_accounts  →  creator_entity     │
 * │  Twitch ───────┤                                             │
 * │  Facebook ─────┘                                             │
 * │                                                              │
 * │  creator_entity → youapp_index (creator_entity_id foreign)  │
 * └──────────────────────────────────────────────────────────────┘
 *
 * V1 soporta: YouTube + Twitch (sync con API oficial)
 * V2 agregará: Vimeo, Instagram, TikTok, X
 */

import { supabase } from './supabase';

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface CreatorAccount {
  id: string;
  provider: 'youtube' | 'twitch' | 'vimeo' | 'instagram' | 'tiktok' | 'x' | 'peertube';
  handle: string;
  provider_creator_id?: string;
  display_name?: string;
  canonical_url?: string;
  video_count?: number;
  connected: boolean;
  authorized: boolean;
  last_synced_at?: string;
}

export interface CreatorEntity {
  id: string;
  canonical_name: string;
  description?: string;
  avatar_url?: string;
  category?: string;
  country?: string;
  language?: string;
  entity_type: 'person' | 'organization' | 'media';
  creator_accounts?: CreatorAccount[];
  created_at?: string;
  updated_at?: string;
}

export interface ResolveOptions {
  name: string;
  provider?: string;
  handle?: string;
  description?: string;
  category?: string;
  country?: string;
  language?: string;
}

// ── Cache local en memoria (evitar llamadas repetidas) ────────────────────────

const _entityCache = new Map<string, CreatorEntity>();
const _handleCache = new Map<string, string>(); // "youtube:MrBeast" → entity_id

function cacheKey(provider: string, handle: string) {
  return `${provider}:${handle.toLowerCase()}`;
}

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * Busca o crea una creator_entity por nombre.
 * Si se proveen provider + handle, los vincula automáticamente.
 */
export async function resolveCreator(opts: ResolveOptions): Promise<CreatorEntity | null> {
  try {
    const { data, error } = await (supabase.functions as any).invoke('creator-graph', {
      body: { action: 'resolve', ...opts }
    });
    if (error || !data?.entity) return null;
    const entity: CreatorEntity = data.entity;
    _entityCache.set(entity.id, entity);
    if (opts.provider && opts.handle) {
      _handleCache.set(cacheKey(opts.provider, opts.handle), entity.id);
    }
    return entity;
  } catch {
    return null;
  }
}

/**
 * Vincula una cuenta de plataforma a una creator_entity existente.
 */
export async function linkAccount(
  entityId: string,
  provider: string,
  handle: string,
  providerCreatorId?: string,
  canonicalUrl?: string
): Promise<boolean> {
  try {
    const { error } = await (supabase.functions as any).invoke('creator-graph', {
      body: {
        action: 'link',
        entity_id: entityId,
        provider,
        handle,
        provider_creator_id: providerCreatorId,
        canonical_url: canonicalUrl
      }
    });
    return !error;
  } catch {
    return false;
  }
}

/**
 * Sincroniza metadatos de YouTube/Twitch para todas las cuentas
 * de una creator_entity (best-effort, no bloquea el UI).
 */
export async function syncCreator(entityId: string): Promise<number> {
  try {
    const { data } = await (supabase.functions as any).invoke('creator-graph', {
      body: { action: 'sync', entity_id: entityId }
    });
    return data?.synced || 0;
  } catch {
    return 0;
  }
}

/**
 * Obtiene una creator_entity con todas sus cuentas vinculadas.
 * Usa cache en memoria para evitar llamadas redundantes.
 */
export async function getCreator(entityId: string): Promise<CreatorEntity | null> {
  if (_entityCache.has(entityId)) return _entityCache.get(entityId)!;
  try {
    const { data, error } = await (supabase.functions as any).invoke('creator-graph', {
      body: { action: 'get', entity_id: entityId }
    });
    if (error || !data?.entity) return null;
    _entityCache.set(entityId, data.entity);
    return data.entity;
  } catch {
    return null;
  }
}

/**
 * Busca un creador por provider + handle.
 * Primero consulta el cache local, luego Supabase directamente.
 */
export async function findCreatorByHandle(
  provider: string,
  handle: string
): Promise<CreatorEntity | null> {
  const key = cacheKey(provider, handle);
  if (_handleCache.has(key)) {
    const entityId = _handleCache.get(key)!;
    return getCreator(entityId);
  }
  try {
    const { data: accounts } = await supabase
      .from('creator_accounts')
      .select('creator_entity_id, creator_entities(*)')
      .eq('provider', provider)
      .ilike('handle', handle)
      .maybeSingle();

    if (!accounts) return null;
    const entity = (accounts as any).creator_entities as CreatorEntity;
    if (entity) {
      _entityCache.set(entity.id, entity);
      _handleCache.set(key, entity.id);
    }
    return entity || null;
  } catch {
    return null;
  }
}

/**
 * Busca creadores por nombre o categoría.
 */
export async function searchCreators(
  query: string,
  category?: string,
  limit = 20
): Promise<CreatorEntity[]> {
  try {
    const { data } = await (supabase.functions as any).invoke('creator-graph', {
      body: { action: 'search', q: query, category, limit }
    });
    return data?.entities || [];
  } catch {
    return [];
  }
}

/**
 * Obtiene todos los videos de un creador desde youapp_index.
 * Cruza por creator_entity_id o por los channelIds de sus cuentas.
 */
export async function getCreatorVideos(entityId: string, limit = 20) {
  try {
    // 1. Obtener el creador y sus cuentas de YouTube
    const entity = await getCreator(entityId);
    if (!entity?.creator_accounts) return [];

    const youtubeAccount = entity.creator_accounts.find(a => a.provider === 'youtube');
    if (!youtubeAccount?.provider_creator_id) return [];

    // 2. Buscar en youapp_index por creator_id
    const { data } = await supabase
      .from('youapp_index')
      .select('*')
      .eq('creator_id', youtubeAccount.provider_creator_id)
      .order('published_at', { ascending: false })
      .limit(limit);

    return data || [];
  } catch {
    return [];
  }
}

/**
 * Enriquece un resultado de búsqueda con la creator_entity si existe.
 * Se llama de forma best-effort para no bloquear el pipeline.
 */
export async function enrichWithCreatorIdentity(
  channelId: string,
  channelTitle: string,
  provider: string = 'youtube'
): Promise<{ entityId?: string; canonicalName?: string; platforms?: string[] }> {
  try {
    const entity = await findCreatorByHandle(provider, channelId);
    if (!entity) return {};
    return {
      entityId: entity.id,
      canonicalName: entity.canonical_name,
      platforms: entity.creator_accounts?.map(a => a.provider) || []
    };
  } catch {
    return {};
  }
}

// ── Auto-register: cuando se descubre un canal nuevo, lo registra si no existe ─

const _pendingRegistrations = new Set<string>();

/**
 * Registra un canal de YouTube en el Creator Graph de forma asíncrona.
 * No bloquea el flujo de búsqueda — best-effort en background.
 */
export function autoRegisterChannel(
  channelId: string,
  channelTitle: string,
  provider: string = 'youtube'
): void {
  const key = cacheKey(provider, channelId);
  if (_pendingRegistrations.has(key) || _handleCache.has(key)) return;
  _pendingRegistrations.add(key);

  // Fire and forget — no await, no block
  resolveCreator({
    name: channelTitle,
    provider,
    handle: channelId,
  }).then(entity => {
    if (entity) {
      _handleCache.set(key, entity.id);
    }
    _pendingRegistrations.delete(key);
  }).catch(() => {
    _pendingRegistrations.delete(key);
  });
}
