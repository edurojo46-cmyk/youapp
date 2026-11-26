// ============================================================================
// YOUAPP SOCIAL MIXTO V1 (Comunidad propia YOUAPP + Enlaces oficiales YouTube)
// - Me gusta y Seguir se guardan en YOUAPP (localStorage + Supabase user_metadata).
// - Suscribirse y Me gusta en YouTube abren el canal/video oficial (0 cuota API).
// - Contadores y acciones de YOUAPP permanecen separados de YouTube.
// ============================================================================

import { supabase } from '../supabase';

const STORAGE_KEY = 'youapp_social_graph_v1';
export const SOCIAL_GRAPH_CHANGED_EVENT = 'youapp:social-graph-changed';

export interface FollowedCreatorMeta {
  key: string;
  name: string;
  provider?: string;
  sourceUrl?: string;
  followedAt: string;
}

export interface LikedVideoMeta {
  key: string;
  title: string;
  author?: string;
  thumbnailUrl?: string;
  sourceUrl?: string;
  likedAt: string;
}

export interface YouAppSocialGraph {
  likedSignalIds: string[];
  followedSignalIds: string[];
  likedVideoKeys: string[];
  followedCreatorsMeta?: FollowedCreatorMeta[];
  likedVideosMeta?: LikedVideoMeta[];
  likeCounts?: Record<string, number>;
  updatedAt: string;
}

function defaultGraph(): YouAppSocialGraph {
  return {
    likedSignalIds: [],
    followedSignalIds: [],
    likedVideoKeys: [],
    followedCreatorsMeta: [],
    likedVideosMeta: [],
    likeCounts: {},
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
      followedCreatorsMeta: Array.isArray(parsed?.followedCreatorsMeta) ? parsed.followedCreatorsMeta : [],
      likedVideosMeta: Array.isArray(parsed?.likedVideosMeta) ? parsed.likedVideosMeta : [],
      likeCounts: parsed?.likeCounts && typeof parsed.likeCounts === 'object' ? parsed.likeCounts : {},
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
    followedCreatorsMeta: (graph.followedCreatorsMeta || []).slice(0, 120),
    likedVideosMeta: (graph.likedVideosMeta || []).slice(0, 120),
    likeCounts: graph.likeCounts || {},
    updatedAt: new Date().toISOString()
  };
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event(SOCIAL_GRAPH_CHANGED_EVENT));
    } catch {
      // ignore quota
    }
  }
  void syncSocialGraphToCloud(next);
  return next;
}

export function toggleLikeVideoWithMeta(
  prev: YouAppSocialGraph,
  meta: Omit<LikedVideoMeta, 'likedAt'>
): { graph: YouAppSocialGraph; active: boolean; count: number } {
  const exists = prev.likedVideoKeys.includes(meta.key);
  const nextKeys = exists
    ? prev.likedVideoKeys.filter((x) => x !== meta.key)
    : [meta.key, ...prev.likedVideoKeys.filter((x) => x !== meta.key)];
  const prevMeta = prev.likedVideosMeta || [];
  const nextMeta = exists
    ? prevMeta.filter((x) => x.key !== meta.key)
    : [{ ...meta, likedAt: new Date().toISOString() }, ...prevMeta.filter((x) => x.key !== meta.key)];
  const prevCounts = prev.likeCounts || {};
  const curCount = Number(prevCounts[meta.key] || (exists ? 1 : 0));
  const nextCount = exists ? Math.max(0, curCount - 1) : curCount + 1;
  const nextCounts = { ...prevCounts, [meta.key]: nextCount };
  const saved = saveSocialGraph({
    ...prev,
    likedVideoKeys: nextKeys,
    likedVideosMeta: nextMeta,
    likeCounts: nextCounts
  });
  return { graph: saved, active: !exists, count: nextCount };
}

export function toggleFollowCreatorWithMeta(
  prev: YouAppSocialGraph,
  meta: Omit<FollowedCreatorMeta, 'followedAt'>
): { graph: YouAppSocialGraph; active: boolean } {
  const exists = prev.followedSignalIds.includes(meta.key);
  const nextIds = exists
    ? prev.followedSignalIds.filter((x) => x !== meta.key)
    : [meta.key, ...prev.followedSignalIds.filter((x) => x !== meta.key)];
  const prevMeta = prev.followedCreatorsMeta || [];
  const nextMeta = exists
    ? prevMeta.filter((x) => x.key !== meta.key)
    : [{ ...meta, followedAt: new Date().toISOString() }, ...prevMeta.filter((x) => x.key !== meta.key)];
  const saved = saveSocialGraph({
    ...prev,
    followedSignalIds: nextIds,
    followedCreatorsMeta: nextMeta
  });
  return { graph: saved, active: !exists };
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

/** Obtiene vistas reales y fecha de publicación de un video de YouTube (0 cuota API · Supabase + fallback local) */
export async function fetchYouTubeVideoMeta(videoId: string): Promise<VideoPublicMeta | null> {
  const clean = (videoId || '').trim();
  if (!/^[A-Za-z0-9_-]{11}$/.test(clean)) return null;
  const cached = clientMetaCache.get(clean);
  if (cached) return cached;

  // 1. Consulta directa a Supabase `youapp_index` (funciona en youapptv.com y en local · 0 cuota)
  try {
    const { data: row } = await supabase
      .from('youapp_index')
      .select('*')
      .or(`video_id.eq.${clean},provider_content_id.eq.${clean}`)
      .limit(1)
      .maybeSingle();

    if (row) {
      const r = row as Record<string, any>;
      const rawViews = Number(r.view_count ?? r.views ?? r.metadata?.viewCount ?? 0);
      const rawDate =
        (typeof r.published_at === 'string' && r.published_at) ||
        (typeof r.metadata?.publishedAt === 'string' && r.metadata.publishedAt) ||
        (typeof r.created_at === 'string' && r.created_at) ||
        null;
      const meta: VideoPublicMeta = {
        viewCount: Number.isFinite(rawViews) && rawViews > 0 ? rawViews : null,
        publishedAt: rawDate,
        isLive: Boolean(r.is_live)
      };
      if (meta.viewCount !== null || meta.publishedAt !== null) {
        clientMetaCache.set(clean, meta);
        return meta;
      }
    }
  } catch {
    // continúa al fallback local
  }

  // 2. Fallback local (Vite dev middleware en localhost / LAN)
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

/** Solo número de vistas compacto (ej: "12,4 mil", "1,2 M", "845") */
export function formatCompactViews(views: number | null | undefined, _isLive = false): string | null {
  if (typeof views !== 'number' || !Number.isFinite(views) || views <= 0) return null;
  if (views >= 1_000_000) {
    return `${(views / 1_000_000).toFixed(views >= 10_000_000 ? 0 : 1).replace('.', ',')} M`;
  }
  if (views >= 1_000) {
    return `${(views / 1_000).toFixed(views >= 100_000 ? 0 : 1).replace('.', ',')} mil`;
  }
  return views.toLocaleString('es-AR');
}

/** Solo fecha corta d/m/aa (ej: "1/7/23") */
export function formatPublishedDateEs(rawDate: string | null | undefined): string | null {
  if (!rawDate) return null;
  const parsed = new Date(rawDate);
  if (Number.isNaN(parsed.getTime())) return null;
  const d = parsed.getDate();
  const m = parsed.getMonth() + 1;
  const yy = String(parsed.getFullYear()).slice(-2);
  return `${d}/${m}/${yy}`;
}
