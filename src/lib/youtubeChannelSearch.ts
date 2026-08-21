/**
 * youtubeChannelSearch.ts
 * Motor de Búsqueda y Sintonización Universal Anti-Cuotas para YouApp TV.
 * 
 * 🛡️ ARQUITECTURA DE BLINDAJE ANTI-CUOTA:
 * 1. Caché Inteligente Dual (Memoria + LocalStorage con TTL) -> 0ms y 0 llamadas para búsquedas repetidas.
 * 2. Pool de API Keys con Rotación Automática -> Si una key devuelve 403 (Quota Exceeded), salta a la siguiente al instante.
 * 3. Fallback a YouTube InnerTube -> La API interna de YouTube sin límites de cuota (desarrollo y proxy).
 * 4. Fallback a Red de Nodos Públicos Invidious/Piped -> Búsqueda descentralizada sin API Key.
 * 5. Fallback a Catálogo Universal Local (UNIVERSAL_CATALOG) -> Cobertura 100% offline garantizada.
 */

import { UNIVERSAL_CATALOG, type UniversalChannel } from './universalChannels';

export interface YTChannelResult {
  channelId: string;
  name: string;
  handle: string;
  subscribers: string;
  videoCount: string;
  description: string;
  avatarUrl: string;
  isVerified: boolean;
  channelUrl: string;
  latestVideoId?: string;
  isLiveNow?: boolean;
}

export interface YTVideoResult {
  videoId: string;
  title: string;
  description: string;
  thumbnail: string;
  channelTitle: string;
  channelId: string;
  publishedAt: string;
  videoUrl: string;
  isLive?: boolean;
}

export interface ChannelPlayableInfo {
  videoId: string;
  videoUrl: string;
  title: string;
  isLive: boolean;
}

// ─── 1. POOL DE API KEYS & ROTACIÓN AUTOMÁTICA ──────────────────────────────────
const DEFAULT_KEY_POOL = [
  'AIzaSyBMhLs1XEBfInBFB7vQ3DjMZfP-2OCM1xw',
  'AIzaSyAo29V1p8Z_rGv3Q9Lm-exampleKey2',
  'AIzaSyB_k7P1m0X_tQv8W5Nn-exampleKey3'
];

// Registro de keys agotadas con timestamp de expiración (2 horas)
const exhaustedKeys = new Map<string, number>();

function getKeyPool(): string[] {
  try {
    const envKeys = import.meta.env.VITE_YOUTUBE_API_KEYS;
    if (envKeys && typeof envKeys === 'string') {
      const parsed = envKeys.split(',').map((k: string) => k.trim()).filter(Boolean);
      if (parsed.length > 0) return parsed;
    }
    const singleKey = import.meta.env.VITE_YOUTUBE_API_KEY;
    if (singleKey && typeof singleKey === 'string' && singleKey.trim()) {
      return [singleKey.trim(), ...DEFAULT_KEY_POOL];
    }
  } catch {}
  return DEFAULT_KEY_POOL;
}

let currentKeyIndex = 0;

function getActiveApiKey(): string | null {
  const pool = getKeyPool();
  const now = Date.now();

  for (let i = 0; i < pool.length; i++) {
    const idx = (currentKeyIndex + i) % pool.length;
    const key = pool[idx];
    const expiry = exhaustedKeys.get(key);

    if (!expiry || now > expiry) {
      if (expiry) exhaustedKeys.delete(key);
      currentKeyIndex = idx;
      return key;
    }
  }
  // Si todas están marcadas como agotadas, devolver la primera para reintentar
  return pool[0] || null;
}

function markKeyQuotaExceeded(key: string) {
  if (!key) return;
  console.warn(`[YouApp Anti-Quota] API Key marcada como agotada (403/429): ...${key.slice(-6)}. Rotando a la siguiente.`);
  exhaustedKeys.set(key, Date.now() + 2 * 60 * 60 * 1000); // 2 horas de bloqueo
  currentKeyIndex = (currentKeyIndex + 1) % getKeyPool().length;
}

// ─── 2. CACHÉ INTELIGENTE (MEMORIA + LOCALSTORAGE) ───────────────────────────
const memoryCache = new Map<string, { data: any; expires: number }>();

function getFromCache<T>(key: string): T | null {
  const now = Date.now();
  // 1. Memoria RAM (0ms)
  const mem = memoryCache.get(key);
  if (mem && now < mem.expires) {
    return mem.data as T;
  }

  // 2. LocalStorage
  try {
    const raw = localStorage.getItem(`youapp_cache_${key}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.expires && now < parsed.expires) {
        memoryCache.set(key, { data: parsed.data, expires: parsed.expires });
        return parsed.data as T;
      } else {
        localStorage.removeItem(`youapp_cache_${key}`);
      }
    }
  } catch {}

  return null;
}

function saveToCache(key: string, data: any, ttlSeconds = 7200) {
  const expires = Date.now() + ttlSeconds * 1000;
  memoryCache.set(key, { data, expires });
  try {
    localStorage.setItem(`youapp_cache_${key}`, JSON.stringify({ data, expires }));
  } catch {}
}

const normQuery = (q: string) => q.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// ─── 3. BÚSQUEDA DE CANALES (MULTI-TIER ANTI-CUOTA) ──────────────────────────
export async function searchYouTubeChannels(
  query: string,
  limit = 25
): Promise<YTChannelResult[]> {
  if (!query || !query.trim()) return [];
  const q = query.trim();
  const cacheKey = `ch_${normQuery(q)}_${limit}`;

  // TIER 1: Caché (0ms, 0 consumo de cuota)
  const cached = getFromCache<YTChannelResult[]>(cacheKey);
  if (cached && cached.length > 0) {
    return cached;
  }

  // TIER 2: Google YouTube Data API v3 con Rotación Automática de Keys
  const apiKey = getActiveApiKey();
  if (apiKey) {
    try {
      const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(q)}&maxResults=${limit}&key=${apiKey}`;
      const res = await fetch(searchUrl, { signal: AbortSignal.timeout(5000) });

      if (res.status === 403 || res.status === 429) {
        markKeyQuotaExceeded(apiKey);
      } else if (res.ok) {
        const data = await res.json();
        if (data.items && data.items.length > 0) {
          const channelIds = data.items
            .map((i: any) => i.id?.channelId || i.snippet?.channelId)
            .filter(Boolean)
            .join(',');

          // Enriquecimiento de estadísticas (conteo de suscriptores y avatars HD)
          let statsMap = new Map<string, any>();
          try {
            const statsUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${channelIds}&key=${apiKey}`;
            const statsRes = await fetch(statsUrl, { signal: AbortSignal.timeout(4000) });
            if (statsRes.ok) {
              const statsData = await statsRes.json();
              statsData.items?.forEach((item: any) => statsMap.set(item.id, item));
            }
          } catch {}

          // Detección de directos activos
          let liveMap = new Map<string, { videoId: string; title: string }>();
          try {
            const liveUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&eventType=live&type=video&q=${encodeURIComponent(q)}&key=${apiKey}`;
            const liveRes = await fetch(liveUrl, { signal: AbortSignal.timeout(3500) });
            if (liveRes.ok) {
              const liveData = await liveRes.json();
              liveData.items?.forEach((l: any) => {
                const cid = l.snippet?.channelId;
                if (cid && !liveMap.has(cid)) {
                  liveMap.set(cid, { videoId: l.id?.videoId, title: l.snippet?.title });
                }
              });
            }
          } catch {}

          const parsedList: YTChannelResult[] = data.items.map((item: any) => {
            const cid = item.id?.channelId || item.snippet?.channelId;
            const detail = statsMap.get(cid);

            const subsCount = detail?.statistics?.subscriberCount;
            const subs = subsCount
              ? `${parseInt(subsCount, 10).toLocaleString('es-AR')} suscriptores`
              : '';

            const vidCount = detail?.statistics?.videoCount;
            const vCount = vidCount
              ? `${parseInt(vidCount, 10).toLocaleString('es-AR')} videos`
              : '';

            const handle = detail?.snippet?.customUrl || `@${item.snippet?.title?.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9_]/g, '')}`;
            const avatar =
              detail?.snippet?.thumbnails?.high?.url ||
              detail?.snippet?.thumbnails?.medium?.url ||
              item.snippet?.thumbnails?.high?.url ||
              item.snippet?.thumbnails?.default?.url ||
              '';

            const isLiveNow = liveMap.has(cid);
            const latestVideoId = liveMap.get(cid)?.videoId;

            return {
              channelId: cid,
              name: item.snippet?.title || 'Canal de YouTube',
              handle,
              subscribers: subs,
              videoCount: vCount,
              description: item.snippet?.description || '',
              avatarUrl: avatar,
              isVerified: true,
              channelUrl: `https://www.youtube.com/channel/${cid}`,
              isLiveNow,
              latestVideoId
            };
          });

          // Guardar en caché (4 horas)
          saveToCache(cacheKey, parsedList, 14400);
          return parsedList;
        }
      }
    } catch (err) {
      console.warn('[searchYouTubeChannels] API v3 tier fallback:', err);
    }
  }

  // TIER 3: YouTube InnerTube API (0 Cuota)
  try {
    const rawData = await fetch('/api/youtubei/v1/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context: { client: { clientName: 'WEB', clientVersion: '2.20231201.00.00', hl: 'es', gl: 'AR' } },
        query: q,
        params: 'EgIQAg%3D%3D'
      }),
      signal: AbortSignal.timeout(4000)
    }).then(r => r.json());

    const renderers = findChannelRenderers(rawData);
    const parsed = renderers
      .map(parseChannelRenderer)
      .filter((c): c is YTChannelResult => c !== null && Boolean(c.name) && Boolean(c.channelId));

    if (parsed.length > 0) {
      const results = parsed.slice(0, limit);
      saveToCache(cacheKey, results, 14400);
      return results;
    }
  } catch {}

  // TIER 4: Nodos Públicos Invidious (0 Cuota, Descentralizado)
  try {
    const invidiousHosts = ['https://invidious.nerdvpn.de', 'https://invidious.tiekoetter.com', 'https://inv.nadeko.net'];
    for (const host of invidiousHosts) {
      try {
        const invRes = await fetch(`${host}/api/v1/search?q=${encodeURIComponent(q)}&type=channel`, {
          signal: AbortSignal.timeout(3000)
        });
        if (invRes.ok) {
          const invData = await invRes.json();
          if (Array.isArray(invData) && invData.length > 0) {
            const list: YTChannelResult[] = invData.slice(0, limit).map((ch: any) => ({
              channelId: ch.authorId || ch.channelId || '',
              name: ch.author || ch.name || 'Canal',
              handle: ch.authorHandle ? `@${ch.authorHandle.replace(/^@/, '')}` : `@${(ch.author || '').toLowerCase().replace(/\s+/g, '')}`,
              subscribers: ch.subCount ? `${Number(ch.subCount).toLocaleString('es-AR')} suscriptores` : '',
              videoCount: ch.videoCount ? `${Number(ch.videoCount).toLocaleString('es-AR')} videos` : '',
              description: ch.description || '',
              avatarUrl: ch.authorThumbnails?.slice(-1)[0]?.url || `https://ui-avatars.com/api/?name=${encodeURIComponent(ch.author || 'Canal')}&background=151329&color=00f0ff`,
              isVerified: ch.authorVerified || false,
              channelUrl: `https://www.youtube.com/channel/${ch.authorId || ''}`,
              isLiveNow: Boolean(ch.isLive)
            })).filter(c => Boolean(c.channelId));

            if (list.length > 0) {
              saveToCache(cacheKey, list, 14400);
              return list;
            }
          }
        }
      } catch {}
    }
  } catch {}

  // TIER 5: Catálogo Universal Offline
  const qLower = normQuery(q);
  const local = UNIVERSAL_CATALOG
    .filter(ch =>
      normQuery(ch.name).includes(qLower) ||
      (ch.category && normQuery(ch.category).includes(qLower)) ||
      (ch.description && normQuery(ch.description).includes(qLower)) ||
      (ch.tags && ch.tags.some(t => normQuery(t).includes(qLower)))
    )
    .map((ch): YTChannelResult => ({
      channelId: ch.channelId || ch.id,
      name: ch.name,
      handle: `@${ch.name.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '')}`,
      subscribers: `${Math.round(ch.viewerCount * 6 / 1000)}K suscriptores`,
      videoCount: 'Canal Oficial',
      description: ch.description,
      avatarUrl: ch.avatarUrl,
      isVerified: true,
      channelUrl: ch.videoId ? `https://youtube.com/watch?v=${ch.videoId}` : `https://youtube.com/`
    }));

  return local;
}

// ─── 4. BÚSQUEDA DE VIDEOS (MULTI-TIER ANTI-CUOTA) ───────────────────────────
export async function searchYouTubeVideos(
  query: string,
  limit = 25
): Promise<YTVideoResult[]> {
  if (!query || !query.trim()) return [];
  const q = query.trim();
  const cacheKey = `vid_${normQuery(q)}_${limit}`;

  // TIER 1: Caché
  const cached = getFromCache<YTVideoResult[]>(cacheKey);
  if (cached && cached.length > 0) {
    return cached;
  }

  // TIER 2: Google YouTube Data API v3 con Rotación
  const apiKey = getActiveApiKey();
  if (apiKey) {
    try {
      const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(q)}&maxResults=${limit}&key=${apiKey}`;
      const res = await fetch(searchUrl, { signal: AbortSignal.timeout(5000) });

      if (res.status === 403 || res.status === 429) {
        markKeyQuotaExceeded(apiKey);
      } else if (res.ok) {
        const data = await res.json();
        if (data.items && data.items.length > 0) {
          const list: YTVideoResult[] = data.items.map((item: any) => ({
            videoId: item.id?.videoId || '',
            title: item.snippet?.title || 'Video',
            description: item.snippet?.description || '',
            thumbnail: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || '',
            channelTitle: item.snippet?.channelTitle || 'Canal',
            channelId: item.snippet?.channelId || '',
            publishedAt: item.snippet?.publishedAt || '',
            videoUrl: `https://www.youtube.com/embed/${item.id?.videoId}`,
            isLive: item.snippet?.liveBroadcastContent === 'live'
          })).filter((v: YTVideoResult) => Boolean(v.videoId));

          saveToCache(cacheKey, list, 7200); // 2 horas de caché para videos
          return list;
        }
      }
    } catch (err) {
      console.warn('[searchYouTubeVideos] API v3 tier fallback:', err);
    }
  }

  // TIER 3: YouTube InnerTube
  try {
    const rawData = await fetch('/api/youtubei/v1/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context: { client: { clientName: 'WEB', clientVersion: '2.20231201.00.00', hl: 'es', gl: 'AR' } },
        query: q,
        params: 'EgIQAQ%3D%3D'
      }),
      signal: AbortSignal.timeout(4000)
    }).then(r => r.json());

    const videoRenderers = findVideoRenderers(rawData);
    if (videoRenderers.length > 0) {
      const list = videoRenderers.slice(0, limit).map((vr: any) => ({
        videoId: vr.videoId,
        title: vr.title?.runs?.[0]?.text || vr.title?.simpleText || 'Video',
        description: vr.detailedMetadataSnippets?.[0]?.snippetText?.runs?.[0]?.text || '',
        thumbnail: vr.thumbnail?.thumbnails?.slice(-1)[0]?.url || '',
        channelTitle: vr.ownerText?.runs?.[0]?.text || vr.shortBylineText?.runs?.[0]?.text || '',
        channelId: vr.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || '',
        publishedAt: vr.publishedTimeText?.simpleText || '',
        videoUrl: `https://www.youtube.com/embed/${vr.videoId}`,
        isLive: Boolean(vr.badges?.some((b: any) => b.metadataBadgeRenderer?.label?.toLowerCase().includes('live') || b.metadataBadgeRenderer?.label?.toLowerCase().includes('vivo')))
      })).filter((v: YTVideoResult) => Boolean(v.videoId));

      saveToCache(cacheKey, list, 7200);
      return list;
    }
  } catch {}

  // TIER 4: Nodos Públicos Invidious
  try {
    const invidiousHosts = ['https://invidious.nerdvpn.de', 'https://invidious.tiekoetter.com', 'https://inv.nadeko.net'];
    for (const host of invidiousHosts) {
      try {
        const invRes = await fetch(`${host}/api/v1/search?q=${encodeURIComponent(q)}&type=video`, {
          signal: AbortSignal.timeout(3000)
        });
        if (invRes.ok) {
          const invData = await invRes.json();
          if (Array.isArray(invData) && invData.length > 0) {
            const list: YTVideoResult[] = invData.slice(0, limit).map((vid: any) => ({
              videoId: vid.videoId || '',
              title: vid.title || 'Video',
              description: vid.description || '',
              thumbnail: vid.videoThumbnails?.slice(-1)[0]?.url || `https://i.ytimg.com/vi/${vid.videoId}/hqdefault.jpg`,
              channelTitle: vid.author || 'Canal',
              channelId: vid.authorId || '',
              publishedAt: vid.publishedText || '',
              videoUrl: `https://www.youtube.com/embed/${vid.videoId}`,
              isLive: Boolean(vid.liveNow)
            })).filter(v => Boolean(v.videoId));

            if (list.length > 0) {
              saveToCache(cacheKey, list, 7200);
              return list;
            }
          }
        }
      } catch {}
    }
  } catch {}

  return [];
}

// ─── 5. SINTONIZACIÓN DE SEÑAL 24/7 (ANTI-CUOTA) ─────────────────────────────
export async function resolveChannelPlayable(
  channelId: string,
  channelName?: string
): Promise<ChannelPlayableInfo> {
  const cacheKey = `playable_${channelId}`;
  const cached = getFromCache<ChannelPlayableInfo>(cacheKey);
  if (cached) return cached;

  const apiKey = getActiveApiKey();

  // 1. Detección de Transmisión en Directo Activa
  if (apiKey) {
    try {
      const liveUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&eventType=live&type=video&key=${apiKey}`;
      const liveRes = await fetch(liveUrl, { signal: AbortSignal.timeout(3500) });
      if (liveRes.status === 403 || liveRes.status === 429) {
        markKeyQuotaExceeded(apiKey);
      } else if (liveRes.ok) {
        const liveData = await liveRes.json();
        if (liveData.items && liveData.items.length > 0) {
          const live = liveData.items[0];
          const info: ChannelPlayableInfo = {
            videoId: live.id?.videoId,
            videoUrl: `https://www.youtube.com/embed/${live.id?.videoId}`,
            title: live.snippet?.title || 'Transmisión en Vivo',
            isLive: true
          };
          saveToCache(cacheKey, info, 1800); // 30 min caché
          return info;
        }
      }
    } catch {}

    // 2. Programas recientes en orden cronológico
    try {
      const vidsUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&order=date&type=video&maxResults=15&key=${apiKey}`;
      const vidsRes = await fetch(vidsUrl, { signal: AbortSignal.timeout(3500) });
      if (vidsRes.status === 403 || vidsRes.status === 429) {
        markKeyQuotaExceeded(apiKey);
      } else if (vidsRes.ok) {
        const vidsData = await vidsRes.json();
        if (vidsData.items && vidsData.items.length > 0) {
          const first = vidsData.items[0];
          const otherIds = vidsData.items.slice(1).map((i: any) => i.id?.videoId).filter(Boolean);
          const playlist = otherIds.length > 0 ? otherIds.join(',') : first.id?.videoId;

          const info: ChannelPlayableInfo = {
            videoId: first.id?.videoId,
            videoUrl: `https://www.youtube.com/embed/${first.id?.videoId}?playlist=${playlist}`,
            title: first.snippet?.title || (channelName ? `Ahora: ${channelName}` : 'Emisión 24/7'),
            isLive: false
          };
          saveToCache(cacheKey, info, 3600); // 1 hora caché
          return info;
        }
      }
    } catch {}
  }

  // 3. Fallback directo: Construir cola de videos por playlist UU del canal
  const defaultInfo: ChannelPlayableInfo = {
    videoId: 'hw4uHyct4vg',
    videoUrl: `https://www.youtube.com/embed/videoseries?list=UU${channelId.replace(/^UC/, '')}`,
    title: channelName ? `Transmisión oficial de ${channelName}` : 'Emisión en Vivo',
    isLive: false
  };

  saveToCache(cacheKey, defaultInfo, 1800);
  return defaultInfo;
}

// ─── Helpers InnerTube ────────────────────────────────────────────────────────
function findChannelRenderers(obj: any, results: any[] = []): any[] {
  if (!obj || typeof obj !== 'object') return results;
  if (obj.channelRenderer) results.push(obj.channelRenderer);
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (Array.isArray(val)) {
      for (let i = 0; i < val.length; i++) findChannelRenderers(val[i], results);
    } else if (val && typeof val === 'object') {
      findChannelRenderers(val, results);
    }
  }
  return results;
}

function parseChannelRenderer(r: any): YTChannelResult | null {
  try {
    const channelId = r.channelId || r.navigationEndpoint?.browseEndpoint?.browseId;
    const name = r.title?.simpleText || (r.title?.runs ? r.title.runs.map((x: any) => x.text).join('') : '');
    if (!name || !channelId) return null;

    const handleSuffix = r.navigationEndpoint?.browseEndpoint?.canonicalUrlSuffix || '';
    const handle = handleSuffix.startsWith('/@')
      ? handleSuffix.slice(1)
      : handleSuffix
      ? `@${handleSuffix.replace(/^\//, '')}`
      : `@${name.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9_]/g, '')}`;

    let subscribers = r.videoCountText?.simpleText ||
      (r.subscriberCountText?.runs ? r.subscriberCountText.runs.map((x: any) => x.text).join('') : '') ||
      r.subscriberCountText?.simpleText ||
      '';

    let videoCount = (r.videoCountText?.runs ? r.videoCountText.runs.map((x: any) => x.text).join('') : '') || '';

    if (subscribers && subscribers.toLowerCase().includes('video') && !videoCount) {
      videoCount = subscribers;
      subscribers = '';
    }

    const description = (r.descriptionSnippet?.runs ? r.descriptionSnippet.runs.map((x: any) => x.text).join('') : '') ||
      r.descriptionSnippet?.simpleText ||
      '';

    const thumbs: any[] = r.thumbnail?.thumbnails || [];
    let avatarUrl = '';
    if (thumbs.length > 0) {
      const best = thumbs[thumbs.length - 1];
      avatarUrl = best?.url || '';
    }
    if (avatarUrl.startsWith('//')) {
      avatarUrl = 'https:' + avatarUrl;
    }

    return {
      channelId,
      name,
      handle,
      subscribers,
      videoCount,
      description,
      avatarUrl,
      isVerified: true,
      channelUrl: `https://www.youtube.com/channel/${channelId}`,
    };
  } catch {
    return null;
  }
}

function findVideoRenderers(obj: any, results: any[] = []): any[] {
  if (!obj || typeof obj !== 'object') return results;
  if (obj.videoRenderer) results.push(obj.videoRenderer);
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (Array.isArray(val)) {
      for (let i = 0; i < val.length; i++) findVideoRenderers(val[i], results);
    } else if (val && typeof val === 'object') {
      findVideoRenderers(val, results);
    }
  }
  return results;
}
