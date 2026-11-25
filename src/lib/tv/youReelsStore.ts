// ============================================================================
// YOU REELS V1 — Colecciones Personales de Videos Verticales 9:16 (0 Cuota API)
// - Soporta Instagram Reels, TikTok, YouTube Shorts, Facebook Reels y X.
// - Guarda solo punteros en localStorage + sincronización en Supabase user_metadata.
// ============================================================================

import { supabase } from '../supabase';
import { resolveMiTvPointer, type MiTvItem } from './miTvStore';

const STORAGE_KEY = 'youapp_youreels_v1';

export type ReelItem = MiTvItem;

export interface ReelCollection {
  id: string;
  name: string;
  items: ReelItem[];
  updatedAt: string;
}

export interface YouReelsWorkspace {
  collections: ReelCollection[];
  activeCollectionId: string;
}

const DEFAULT_COLLECTION_ID = 'reels-mis-reels';

function defaultWorkspace(): YouReelsWorkspace {
  return {
    activeCollectionId: DEFAULT_COLLECTION_ID,
    collections: [
      {
        id: DEFAULT_COLLECTION_ID,
        name: 'Mis Reels',
        items: [],
        updatedAt: new Date().toISOString()
      }
    ]
  };
}

export async function resolveReelPointer(
  rawUrl: string
): Promise<{ ok: true; item: ReelItem } | { ok: false; error: string }> {
  const res = await resolveMiTvPointer(rawUrl, 'Ahora');
  if (!res.ok) {
    return {
      ok: false,
      error: 'Pegá una URL de Instagram Reel, TikTok, YouTube Short, Facebook Reel o X.'
    };
  }
  return res;
}

export function loadYouReelsWorkspace(): YouReelsWorkspace {
  if (typeof window === 'undefined') return defaultWorkspace();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultWorkspace();
    const parsed = JSON.parse(raw);
    const collections: ReelCollection[] =
      Array.isArray(parsed?.collections) && parsed.collections.length > 0
        ? parsed.collections
        : defaultWorkspace().collections;
    const activeCollectionId =
      typeof parsed?.activeCollectionId === 'string' &&
      collections.some((c) => c.id === parsed.activeCollectionId)
        ? parsed.activeCollectionId
        : collections[0].id;
    return { collections, activeCollectionId };
  } catch {
    return defaultWorkspace();
  }
}

export function saveYouReelsWorkspace(ws: YouReelsWorkspace): YouReelsWorkspace {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ws));
    } catch {
      // ignore quota errors
    }
  }
  void syncYouReelsToCloud(ws);
  return ws;
}

async function syncYouReelsToCloud(ws: YouReelsWorkspace): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (!user || user.is_anonymous) return;
    const compact = ws.collections.slice(0, 10).map((col) => ({
      id: col.id,
      name: col.name,
      updatedAt: col.updatedAt,
      items: col.items.slice(0, 40).map((it) => ({
        id: it.id,
        provider: it.provider,
        providerId: it.providerId,
        title: it.title.slice(0, 100),
        author: it.author.slice(0, 60),
        thumbnailUrl: it.thumbnailUrl,
        sourceUrl: it.sourceUrl,
        slot: it.slot,
        addedAt: it.addedAt
      }))
    }));
    await supabase.auth.updateUser({
      data: { youapp_youreels_v1: compact }
    });
  } catch {
    // fallback silencioso a localStorage
  }
}

export async function loadYouReelsFromCloud(): Promise<YouReelsWorkspace | null> {
  try {
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user || user.is_anonymous) return null;
    const cloudCols = (user.user_metadata as any)?.youapp_youreels_v1;
    if (!Array.isArray(cloudCols) || cloudCols.length === 0) return null;

    const local = loadYouReelsWorkspace();
    const byId = new Map<string, ReelCollection>();
    for (const c of local.collections) byId.set(c.id, c);
    for (const cc of cloudCols as ReelCollection[]) {
      if (!cc?.id || !Array.isArray(cc.items)) continue;
      const existing = byId.get(cc.id);
      const cloudTs = Date.parse(cc.updatedAt || '') || 0;
      const localTs = Date.parse(existing?.updatedAt || '') || 0;
      if (!existing || (cc.items.length > 0 && cloudTs > localTs)) {
        byId.set(cc.id, cc);
      }
    }
    const merged: YouReelsWorkspace = {
      collections: Array.from(byId.values()),
      activeCollectionId: local.activeCollectionId
    };
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      } catch {
        // ignore
      }
    }
    return merged;
  } catch {
    return null;
  }
}
