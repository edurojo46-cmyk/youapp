// ============================================================================
// YOUAPP SOCIAL MIXTO V1 (Comunidad propia YOUAPP + Enlaces oficiales YouTube)
// - Me gusta y Seguir se guardan en YOUAPP (localStorage + Supabase user_metadata).
// - Suscribirse y Me gusta en YouTube abren el canal/video oficial (0 cuota API).
// - Contadores y acciones de YOUAPP permanecen separados de YouTube.
// ============================================================================

import { supabase } from '../supabase';

const STORAGE_KEY = 'youapp_social_graph_v1';

export interface YouAppSocialGraph {
  likedSignalIds: string[];
  followedSignalIds: string[];
  likedVideoKeys: string[];
  updatedAt: string;
}

function defaultGraph(): YouAppSocialGraph {
  return {
    likedSignalIds: [],
    followedSignalIds: [],
    likedVideoKeys: [],
    updatedAt: new Date().toISOString()
  };
}

export function loadSocialGraph(): YouAppSocialGraph {
  if (typeof window === 'undefined') return defaultGraph();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultGraph();
    const parsed = JSON.parse(raw);
    return {
      likedSignalIds: Array.isArray(parsed?.likedSignalIds) ? parsed.likedSignalIds : [],
      followedSignalIds: Array.isArray(parsed?.followedSignalIds) ? parsed.followedSignalIds : [],
      likedVideoKeys: Array.isArray(parsed?.likedVideoKeys) ? parsed.likedVideoKeys : [],
      updatedAt: typeof parsed?.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString()
    };
  } catch {
    return defaultGraph();
  }
}

export function saveSocialGraph(graph: YouAppSocialGraph): YouAppSocialGraph {
  const next: YouAppSocialGraph = {
    likedSignalIds: Array.from(new Set(graph.likedSignalIds)).slice(0, 120),
    followedSignalIds: Array.from(new Set(graph.followedSignalIds)).slice(0, 120),
    likedVideoKeys: Array.from(new Set(graph.likedVideoKeys)).slice(0, 200),
    updatedAt: new Date().toISOString()
  };
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore quota
    }
  }
  void syncSocialGraphToCloud(next);
  return next;
}

async function syncSocialGraphToCloud(graph: YouAppSocialGraph): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (!user || user.is_anonymous) return;
    await supabase.auth.updateUser({
      data: { youapp_social_graph_v1: graph }
    });
  } catch {
    // fallback silencioso a localStorage
  }
}

export async function loadSocialGraphFromCloud(): Promise<YouAppSocialGraph | null> {
  try {
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user || user.is_anonymous) return null;
    const cloud = (user.user_metadata as any)?.youapp_social_graph_v1 as
      | Partial<YouAppSocialGraph>
      | undefined;
    if (!cloud || typeof cloud !== 'object') return null;

    const local = loadSocialGraph();
    const merged: YouAppSocialGraph = {
      likedSignalIds: Array.from(
        new Set([...(local.likedSignalIds || []), ...(cloud.likedSignalIds || [])])
      ).slice(0, 120),
      followedSignalIds: Array.from(
        new Set([...(local.followedSignalIds || []), ...(cloud.followedSignalIds || [])])
      ).slice(0, 120),
      likedVideoKeys: Array.from(
        new Set([...(local.likedVideoKeys || []), ...(cloud.likedVideoKeys || [])])
      ).slice(0, 200),
      updatedAt: new Date().toISOString()
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

export function toggleInList(list: string[], id: string): { next: string[]; active: boolean } {
  if (!id) return { next: list, active: false };
  const exists = list.includes(id);
  return exists
    ? { next: list.filter((x) => x !== id), active: false }
    : { next: [...list, id], active: true };
}

/** Construye enlace oficial de suscripción en YouTube (?sub_confirmation=1) sin gastar cuota API */
export function buildYouTubeSubscribeUrl(input: {
  channelId?: string | null;
  sourceUrl?: string | null;
}): string | null {
  const chId = (input.channelId || '').trim();
  if (/^UC[A-Za-z0-9_-]{22}$/.test(chId)) {
    return `https://www.youtube.com/channel/${chId}?sub_confirmation=1`;
  }
  const src = (input.sourceUrl || '').trim();
  const handleMatch = src.match(/youtube\.com\/(@[A-Za-z0-9._-]+)/i);
  if (handleMatch?.[1]) {
    return `https://www.youtube.com/${handleMatch[1]}?sub_confirmation=1`;
  }
  const chMatch = src.match(/youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})/i);
  if (chMatch?.[1]) {
    return `https://www.youtube.com/channel/${chMatch[1]}?sub_confirmation=1`;
  }
  if (/youtu\.be\/|youtube\.com\/watch/i.test(src)) {
    return src;
  }
  return null;
}

/** Enlace oficial al video en YouTube para dar Me gusta / interactuar en el original */
export function buildYouTubeVideoUrl(input: {
  videoId?: string | null;
  sourceUrl?: string | null;
}): string | null {
  const vid = (input.videoId || '').trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(vid)) {
    return `https://www.youtube.com/watch?v=${vid}`;
  }
  const src = (input.sourceUrl || '').trim();
  if (/youtu\.be\/|youtube\.com/i.test(src)) return src;
  return null;
}

export interface VideoPublicMeta {
  viewCount: number | null;
  publishedAt: string | null;
  isLive: boolean;
}

const clientMetaCache = new Map<string, VideoPublicMeta>();

/** Obtiene vistas reales y fecha de publicación de un video de YouTube (0 cuota API) */
export async function fetchYouTubeVideoMeta(videoId: string): Promise<VideoPublicMeta | null> {
  const clean = (videoId || '').trim();
  if (!/^[A-Za-z0-9_-]{11}$/.test(clean)) return null;
  const cached = clientMetaCache.get(clean);
  if (cached) return cached;
  try {
    const res = await fetch(`/api/mitv/video-meta?v=${encodeURIComponent(clean)}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.ok) return null;
    const meta: VideoPublicMeta = {
      viewCount: typeof data.viewCount === 'number' ? data.viewCount : null,
      publishedAt: typeof data.publishedAt === 'string' ? data.publishedAt : null,
      isLive: Boolean(data.isLive)
    };
    clientMetaCache.set(clean, meta);
    return meta;
  } catch {
    return null;
  }
}

export function formatCompactViews(views: number | null | undefined, isLive = false): string | null {
  if (typeof views !== 'number' || !Number.isFinite(views) || views <= 0) return null;
  let formatted: string;
  if (views >= 1_000_000) {
    formatted = `${(views / 1_000_000).toFixed(views >= 10_000_000 ? 0 : 1).replace('.', ',')} M`;
  } else if (views >= 1_000) {
    formatted = `${(views / 1_000).toFixed(views >= 100_000 ? 0 : 1).replace('.', ',')} mil`;
  } else {
    formatted = views.toLocaleString('es-AR');
  }
  return isLive ? `${formatted} mirando` : `${formatted} vistas`;
}

export function formatPublishedDateEs(rawDate: string | null | undefined): string | null {
  if (!rawDate) return null;
  const parsed = new Date(rawDate);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}
