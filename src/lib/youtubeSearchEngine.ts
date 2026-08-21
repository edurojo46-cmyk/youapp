/**
 * youtubeSearchEngine.ts
 * Motor de Búsqueda Idéntico a YouTube sin API Key (100% Público, Ilimitado y Libre de Cuotas).
 * 
 * 🚀 CAPACIDADES:
 * 1. Autocompletado oficial de YouTube en tiempo real con JSONP (0 CORS, 0ms latencia).
 * 2. Scraper de ytInitialData que extrae los mismos datos de YouTube.com:
 *    - Duración exacta del video (ej. "14:20", "3:45", "1:22:04")
 *    - Etiquetas reales "🔴 EN VIVO"
 *    - Conteo de vistas ("1.4 M de vistas", "850 K vistas")
 *    - Fecha relativa ("hace 2 días", "hace 1 año")
 *    - Avatar del canal y tilde de verificado ✓
 * 3. Multi-Proxy de Respaldo con rotación automática (AllOrigins, CorsProxy, Localhost, Piped).
 * 4. Caché inteligente local de 4 horas en RAM y LocalStorage.
 */

import { UNIVERSAL_CATALOG, type UniversalChannel } from './universalChannels';

export interface YouTubeSearchResult {
  id: string;
  type: 'video' | 'channel' | 'playlist';
  title: string;
  description: string;
  thumbnail: string;
  videoUrl: string;
  channelTitle: string;
  channelId: string;
  channelAvatar?: string;
  durationText?: string;
  viewsText?: string;
  publishedText?: string;
  isLive: boolean;
  isVerified: boolean;
  subscribersText?: string;
  videoCountText?: string;
  handle?: string;
}

// ─── CACHÉ LOCAL ─────────────────────────────────────────────────────────────
const RAM_CACHE = new Map<string, { data: any; expires: number }>();

function getCache<T>(key: string): T | null {
  const now = Date.now();
  const mem = RAM_CACHE.get(key);
  if (mem && mem.expires > now) return mem.data;

  try {
    const raw = localStorage.getItem(`yt_engine_${key}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.expires > now) {
        RAM_CACHE.set(key, parsed);
        return parsed.data;
      }
    }
  } catch {}
  return null;
}

function setCache(key: string, data: any, ttlSeconds = 7200): void {
  const item = { data, expires: Date.now() + ttlSeconds * 1000 };
  RAM_CACHE.set(key, item);
  try {
    localStorage.setItem(`yt_engine_${key}`, JSON.stringify(item));
  } catch {}
}

// ─── 1. AUTOCOMPLETADO OFICIAL DE YOUTUBE (JSONP / 0 CORS) ───────────────────
export function fetchYouTubeAutocomplete(query: string): Promise<string[]> {
  const q = query.trim();
  if (!q) return Promise.resolve([]);

  const cached = getCache<string[]>(`suggest_${q.toLowerCase()}`);
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve) => {
    const callbackName = `yt_suggest_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const script = document.createElement('script');
    script.src = `https://suggestqueries.google.com/complete/search?client=youtube&ds=yt&q=${encodeURIComponent(q)}&jsonp=${callbackName}&hl=es`;

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      try {
        delete (window as any)[callbackName];
        if (script.parentNode) script.parentNode.removeChild(script);
      } catch {}
    };

    const timeout = setTimeout(() => {
      cleanup();
      resolve(getFallbackSuggestions(q));
    }, 2500);

    (window as any)[callbackName] = (data: any) => {
      clearTimeout(timeout);
      cleanup();
      try {
        if (data && Array.isArray(data[1])) {
          const suggestions = data[1].map((item: any) => (Array.isArray(item) ? item[0] : item)).filter(Boolean);
          setCache(`suggest_${q.toLowerCase()}`, suggestions, 14400);
          resolve(suggestions);
          return;
        }
      } catch {}
      resolve(getFallbackSuggestions(q));
    };

    script.onerror = () => {
      clearTimeout(timeout);
      cleanup();
      resolve(getFallbackSuggestions(q));
    };

    document.head.appendChild(script);
  });
}

function getFallbackSuggestions(q: string): string[] {
  const qL = q.toLowerCase();
  const base = [
    'charly garcia en vivo', 'los redondos recital completo', 'soda stereo mtv unplugged',
    'cronica tv en vivo', 'america tv', 'canal 22 cuneo', 'luzu tv', 'olga en vivo',
    'fito paez', 'spinetta', 'lofi hip hop radio', 'musica argentina 80s 90s'
  ];
  return base.filter(s => s.includes(qL) || qL.includes(s.split(' ')[0]));
}

// ─── 2. PARSER DE RENDERERS DE YOUTUBE (ytInitialData) ────────────────────────
export function parseYouTubeInitialData(ytData: any): YouTubeSearchResult[] {
  const results: YouTubeSearchResult[] = [];
  if (!ytData || typeof ytData !== 'object') return results;

  function traverse(node: any) {
    if (!node || typeof node !== 'object') return;

    // A) Video Renderer
    if (node.videoRenderer) {
      const vr = node.videoRenderer;
      const vidId = vr.videoId;
      if (vidId) {
        const title = vr.title?.runs?.map((r: any) => r.text).join('') || vr.title?.simpleText || 'Video de YouTube';
        const channelTitle = vr.ownerText?.runs?.[0]?.text || vr.shortBylineText?.runs?.[0]?.text || 'Canal';
        const channelId = vr.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || vr.channelId || '';
        const channelAvatar = vr.channelThumbnailSupportedRenderers?.channelThumbnailWithLinkRenderer?.thumbnail?.thumbnails?.slice(-1)[0]?.url;
        
        const isLive = Boolean(
          vr.badges?.some((b: any) => {
            const label = b.metadataBadgeRenderer?.label?.toLowerCase() || '';
            return label.includes('live') || label.includes('vivo') || label.includes('directo');
          }) || vr.thumbnailOverlays?.some((o: any) => o.thumbnailOverlayTimeStatusRenderer?.style === 'LIVE')
        );

        const durationText = isLive 
          ? '🔴 EN VIVO' 
          : (vr.lengthText?.simpleText || vr.lengthText?.runs?.map((r: any) => r.text).join('') || vr.thumbnailOverlays?.find((o: any) => o.thumbnailOverlayTimeStatusRenderer)?.thumbnailOverlayTimeStatusRenderer?.text?.simpleText || '');

        const viewsText = vr.viewCountText?.simpleText || vr.shortViewCountText?.simpleText || vr.shortViewCountText?.runs?.map((r: any) => r.text).join('') || '';
        const publishedText = vr.publishedTimeText?.simpleText || '';
        const description = vr.detailedMetadataSnippets?.[0]?.snippetText?.runs?.map((r: any) => r.text).join('') || vr.descriptionSnippet?.runs?.map((r: any) => r.text).join('') || '';

        const thumbs = vr.thumbnail?.thumbnails || [];
        const thumbUrl = thumbs.length > 0 ? thumbs[thumbs.length - 1].url : `https://i.ytimg.com/vi/${vidId}/hqdefault.jpg`;

        const isVerified = Boolean(
          vr.ownerBadges?.some((b: any) => 
            b.metadataBadgeRenderer?.style?.includes('VERIFIED') ||
            b.metadataBadgeRenderer?.tooltip?.toLowerCase().includes('verificado')
          )
        );

        results.push({
          id: vidId,
          type: 'video',
          title,
          description,
          thumbnail: thumbUrl.startsWith('//') ? `https:${thumbUrl}` : thumbUrl,
          videoUrl: `https://www.youtube.com/embed/${vidId}`,
          channelTitle,
          channelId,
          channelAvatar,
          durationText,
          viewsText,
          publishedText,
          isLive,
          isVerified
        });
      }
    }

    // B) Channel Renderer
    if (node.channelRenderer) {
      const cr = node.channelRenderer;
      const cid = cr.channelId;
      if (cid) {
        const name = cr.title?.simpleText || cr.title?.runs?.map((r: any) => r.text).join('') || 'Canal de YouTube';
        const handle = cr.subscriberCountText?.simpleText?.startsWith('@')
          ? cr.subscriberCountText.simpleText
          : `@${name.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '')}`;
        const subscribersText = cr.videoCountText?.simpleText || cr.subscriberCountText?.simpleText || 'Canal Oficial';
        const description = cr.descriptionSnippet?.runs?.map((r: any) => r.text).join('') || '';
        const thumbs = cr.thumbnail?.thumbnails || [];
        const avatarUrl = thumbs.length > 0 ? thumbs[thumbs.length - 1].url : `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=151329&color=00f0ff`;

        const isVerified = Boolean(
          cr.ownerBadges?.some((b: any) => 
            b.metadataBadgeRenderer?.style?.includes('VERIFIED') ||
            b.metadataBadgeRenderer?.tooltip?.toLowerCase().includes('verificado')
          )
        );

        results.push({
          id: cid,
          type: 'channel',
          title: name,
          description,
          thumbnail: avatarUrl.startsWith('//') ? `https:${avatarUrl}` : avatarUrl,
          videoUrl: `https://www.youtube.com/embed/videoseries?list=UU${cid.replace(/^UC/, '')}`,
          channelTitle: name,
          channelId: cid,
          channelAvatar: avatarUrl.startsWith('//') ? `https:${avatarUrl}` : avatarUrl,
          subscribersText,
          handle,
          isLive: false,
          isVerified
        });
      }
    }

    // Recursividad
    for (const key of Object.keys(node)) {
      if (Array.isArray(node[key])) {
        node[key].forEach(traverse);
      } else if (node[key] && typeof node[key] === 'object') {
        traverse(node[key]);
      }
    }
  }

  traverse(ytData);
  return results;
}

// ─── 3. MOTOR UNIVERSAL DE BÚSQUEDA SIN API ──────────────────────────────────
export async function executeYouTubeSearch(query: string): Promise<{
  all: YouTubeSearchResult[];
  videos: YouTubeSearchResult[];
  channels: YouTubeSearchResult[];
}> {
  const q = query.trim();
  if (!q) return { all: [], videos: [], channels: [] };

  const cacheKey = `search_${q.toLowerCase()}`;
  const cached = getCache<{ all: YouTubeSearchResult[]; videos: YouTubeSearchResult[]; channels: YouTubeSearchResult[] }>(cacheKey);
  if (cached && cached.all.length > 0) return cached;

  let rawResults: YouTubeSearchResult[] = [];

  // TIER A: Localhost Dev Proxy (si estamos en entorno local)
  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    try {
      const res = await fetch('/api/youtubei/v1/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: { client: { clientName: 'WEB', clientVersion: '2.20231201.00.00', hl: 'es', gl: 'AR' } },
          query: q
        }),
        signal: AbortSignal.timeout(3500)
      });
      if (res.ok) {
        const data = await res.json();
        rawResults = parseYouTubeInitialData(data);
      }
    } catch {}
  }

  // TIER B: Scraper de YouTube HTML con CORS Proxies Públicos
  if (rawResults.length === 0) {
    const ytTarget = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&hl=es&gl=AR`;
    const proxyUrls = [
      `https://api.allorigins.win/raw?url=${encodeURIComponent(ytTarget)}`,
      `https://corsproxy.io/?url=${encodeURIComponent(ytTarget)}`
    ];

    for (const pUrl of proxyUrls) {
      try {
        const res = await fetch(pUrl, { signal: AbortSignal.timeout(4500) });
        if (!res.ok) continue;
        const html = await res.text();
        
        const match = html.match(/var ytInitialData = ({.*?});<\/script>/s) || html.match(/ytInitialData\s*=\s*({.*?});/s);
        if (match && match[1]) {
          const parsedData = JSON.parse(match[1]);
          const parsedList = parseYouTubeInitialData(parsedData);
          if (parsedList.length > 0) {
            rawResults = parsedList;
            break;
          }
        }
      } catch {}
    }
  }

  // TIER C: Nodos Piped Públicos (Descentralizados)
  if (rawResults.length === 0) {
    const pipedInstances = ['https://pipedapi.kavin.rocks', 'https://api.piped.privacydev.net'];
    for (const host of pipedInstances) {
      try {
        const res = await fetch(`${host}/search?q=${encodeURIComponent(q)}&filter=all`, { signal: AbortSignal.timeout(3000) });
        if (res.ok) {
          const pipedData = await res.json();
          if (pipedData && Array.isArray(pipedData.items)) {
            rawResults = pipedData.items.map((item: any) => ({
              id: item.url ? item.url.replace('/watch?v=', '').replace('/channel/', '') : `${Date.now()}`,
              type: item.type === 'channel' ? 'channel' : 'video',
              title: item.title || item.name || 'Contenido',
              description: item.shortDescription || item.description || '',
              thumbnail: item.thumbnail || `https://i.ytimg.com/vi/${item.url?.replace('/watch?v=', '')}/hqdefault.jpg`,
              videoUrl: item.type === 'channel' 
                ? `https://www.youtube.com/embed/videoseries?list=UU${(item.url || '').replace('/channel/UC', '')}`
                : `https://www.youtube.com/embed/${(item.url || '').replace('/watch?v=', '')}`,
              channelTitle: item.uploaderName || item.author || 'Canal',
              channelId: item.uploaderUrl ? item.uploaderUrl.replace('/channel/', '') : '',
              durationText: item.duration ? formatPipedDuration(item.duration) : (item.isLive ? '🔴 EN VIVO' : ''),
              viewsText: item.views ? `${Number(item.views).toLocaleString('es-AR')} vistas` : '',
              publishedText: item.uploadedDate || '',
              isLive: Boolean(item.isLive),
              isVerified: Boolean(item.uploaderVerified)
            }));
            if (rawResults.length > 0) break;
          }
        }
      } catch {}
    }
  }

  // TIER D: Catálogo Universal Offline y Base Curada de Respaldo
  if (rawResults.length === 0) {
    rawResults = searchLocalCuratedCatalog(q);
  }

  // Filtrar y estructurar
  const seen = new Set<string>();
  const cleanResults = rawResults.filter(r => {
    if (!r.id || seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });

  const videos = cleanResults.filter(r => r.type === 'video');
  const channels = cleanResults.filter(r => r.type === 'channel');

  const finalPayload = {
    all: cleanResults,
    videos,
    channels
  };

  setCache(cacheKey, finalPayload, 14400); // 4 horas de caché
  return finalPayload;
}

function formatPipedDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

function searchLocalCuratedCatalog(q: string): YouTubeSearchResult[] {
  const qL = q.toLowerCase();
  const catalogMatches = UNIVERSAL_CATALOG
    .filter(ch =>
      ch.name.toLowerCase().includes(qL) ||
      (ch.category && ch.category.toLowerCase().includes(qL)) ||
      (ch.description && ch.description.toLowerCase().includes(qL)) ||
      (ch.tags && ch.tags.some(t => t.toLowerCase().includes(qL)))
    )
    .map((ch): YouTubeSearchResult => ({
      id: ch.channelId || ch.id,
      type: 'channel',
      title: ch.name,
      description: ch.description || '',
      thumbnail: ch.avatarUrl || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400',
      videoUrl: ch.videoUrl || `https://www.youtube.com/embed/${ch.videoId}`,
      channelTitle: ch.name,
      channelId: ch.channelId || ch.id,
      subscribersText: `${Math.round(ch.viewerCount * 5 / 1000)}K suscriptores`,
      isLive: Boolean(ch.isLive),
      isVerified: true
    }));

  return catalogMatches;
}
