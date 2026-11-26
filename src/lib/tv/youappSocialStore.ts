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
  hiddenChannelKeys?: string[];
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
    hiddenChannelKeys: [],
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
      hiddenChannelKeys: Array.isArray(parsed?.hiddenChannelKeys) ? parsed.hiddenChannelKeys : [],
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
    hiddenChannelKeys: Array.from(new Set(graph.hiddenChannelKeys || [])).slice(0, 200),
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

export function normalizeHiddenChannelKey(channelName?: string, channelId?: string): string {
  const id = String(channelId || '').trim();
  if (id) return `id:${id.toLowerCase()}`;
  const name = String(channelName || '').trim().toLowerCase();
  return name ? `name:${name}` : '';
}

export function isChannelHiddenInGraph(
  graph: YouAppSocialGraph,
  channelName?: string,
  channelId?: string
): boolean {
  const list = graph.hiddenChannelKeys || [];
  if (list.length === 0) return false;
  const id = String(channelId || '').trim().toLowerCase();
  const name = String(channelName || '').trim().toLowerCase();
  return list.some(
    (k) => (id && k === `id:${id}`) || (name && k === `name:${name}`)
  );
}

export function hideChannelInGraph(
  prev: YouAppSocialGraph,
  channelName?: string,
  channelId?: string
): { graph: YouAppSocialGraph; key: string } {
  const key = normalizeHiddenChannelKey(channelName, channelId);
  if (!key) return { graph: prev, key: '' };
  const nextKeys = [key, ...(prev.hiddenChannelKeys || []).filter((k) => k !== key)];
  return { graph: saveSocialGraph({ ...prev, hiddenChannelKeys: nextKeys }), key };
}

export function unhideChannelInGraph(prev: YouAppSocialGraph, key: string): YouAppSocialGraph {
  if (!key) return prev;
  const nextKeys = (prev.hiddenChannelKeys || []).filter((k) => k !== key);
  return saveSocialGraph({ ...prev, hiddenChannelKeys: nextKeys });
}

export function clearHiddenChannelsInGraph(prev: YouAppSocialGraph): YouAppSocialGraph {
  return saveSocialGraph({ ...prev, hiddenChannelKeys: [] });
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
const META_SESSION_PREFIX = 'youapp_yt_meta_v1:';

function readCachedMeta(videoId: string): VideoPublicMeta | null {
  const mem = clientMetaCache.get(videoId);
  if (mem) return mem;
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(META_SESSION_PREFIX + videoId);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      const meta: VideoPublicMeta = {
        viewCount: typeof parsed.viewCount === 'number' ? parsed.viewCount : null,
        publishedAt: typeof parsed.publishedAt === 'string' ? parsed.publishedAt : null,
        isLive: Boolean(parsed.isLive)
      };
      clientMetaCache.set(videoId, meta);
      return meta;
    }
  } catch {
    // ignore
  }
  return null;
}

function writeCachedMeta(videoId: string, meta: VideoPublicMeta) {
  clientMetaCache.set(videoId, meta);
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(META_SESSION_PREFIX + videoId, JSON.stringify(meta));
  } catch {
    // ignore
  }
}

/** Obtiene vistas reales y fecha de publicación de un video de YouTube (Supabase + local + YouTube videos.list 1u cacheado) */
export async function fetchYouTubeVideoMeta(videoId: string): Promise<VideoPublicMeta | null> {
  const clean = (videoId || '').trim();
  if (!/^[A-Za-z0-9_-]{11}$/.test(clean)) return null;
  const cached = readCachedMeta(clean);
  if (cached && cached.viewCount !== null) return cached;

  let partial: VideoPublicMeta = cached || { viewCount: null, publishedAt: null, isLive: false };

  // 1. Consulta directa a Supabase `youapp_index` (0 cuota)
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
        null;
      partial = {
        viewCount: Number.isFinite(rawViews) && rawViews > 0 ? rawViews : partial.viewCount,
        publishedAt: rawDate || partial.publishedAt,
        isLive: Boolean(r.is_live)
      };
      if (partial.viewCount !== null && partial.publishedAt !== null) {
        writeCachedMeta(clean, partial);
        return partial;
      }
    }
  } catch {
    // continúa
  }

  // 2. Fallback local (Vite dev middleware en localhost / LAN, 0 cuota)
  if (
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      /^192\.168\./.test(window.location.hostname))
  ) {
    try {
      const res = await fetch(`/api/mitv/video-meta?v=${encodeURIComponent(clean)}`);
      if (res.ok) {
        const data = await res.json();
        if (data?.ok) {
          partial = {
            viewCount: typeof data.viewCount === 'number' && data.viewCount > 0 ? data.viewCount : partial.viewCount,
            publishedAt: typeof data.publishedAt === 'string' ? data.publishedAt : partial.publishedAt,
            isLive: Boolean(data.isLive)
          };
          if (partial.viewCount !== null) {
            writeCachedMeta(clean, partial);
            return partial;
          }
        }
      }
    } catch {
      // continúa
    }
  }

  // 3. Fallback oficial YouTube Data API (videos.list = 1 unidad, cacheado en sessionStorage)
  try {
    const apiKey =
      (import.meta as any)?.env?.VITE_YOUTUBE_API_KEY ||
      String((import.meta as any)?.env?.VITE_YOUTUBE_API_KEYS || '').split(',')[0]?.trim();
    if (apiKey) {
      const ytRes = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${encodeURIComponent(clean)}&key=${encodeURIComponent(apiKey)}`
      );
      if (ytRes.ok) {
        const ytJson = await ytRes.json();
        const item = Array.isArray(ytJson?.items) ? ytJson.items[0] : null;
        if (item) {
          const vCount = Number(item?.statistics?.viewCount ?? 0);
          const pub = typeof item?.snippet?.publishedAt === 'string' ? item.snippet.publishedAt : null;
          partial = {
            viewCount: Number.isFinite(vCount) && vCount > 0 ? vCount : partial.viewCount,
            publishedAt: pub || partial.publishedAt,
            isLive: item?.snippet?.liveBroadcastContent === 'live'
          };
          writeCachedMeta(clean, partial);
          return partial;
        }
      }
    }
  } catch {
    // fallback silencioso
  }

  if (partial.viewCount !== null || partial.publishedAt !== null) {
    writeCachedMeta(clean, partial);
    return partial;
  }
  return null;
}

/** Número de vistas compacto (ej: "12,4 mil vistas", "1,2 M vistas", "845 vistas") */
export function formatCompactViews(views: number | null | undefined, _isLive = false): string | null {
  if (typeof views !== 'number' || !Number.isFinite(views) || views <= 0) return null;
  let num: string;
  if (views >= 1_000_000) {
    num = `${(views / 1_000_000).toFixed(views >= 10_000_000 ? 0 : 1).replace('.', ',')} M`;
  } else if (views >= 1_000) {
    num = `${(views / 1_000).toFixed(views >= 100_000 ? 0 : 1).replace('.', ',')} mil`;
  } else {
    num = views.toLocaleString('es-AR');
  }
  return `${num} vistas`;
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
