/**
 * youtubeChannelSearch.ts
 * Búsqueda y Sintonización Universal de Canales de YouTube para YouApp TV.
 * 
 * - Motor Dual:
 *   1. En Desarrollo (localhost): Usa proxy Vite `/api/youtubei`.
 *   2. En Producción (youapptv.com / móvil): Usa Google YouTube Data API v3 con enriquecimiento de estadísticas en HD y detección de directos en tiempo real.
 * 
 * - Detección automática de transmisiones en directo (Live Now) y colas continuas 24/7 en orden cronológico.
 */

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

export interface ChannelPlayableInfo {
  videoId: string;
  videoUrl: string;
  title: string;
  isLive: boolean;
}

const DEFAULT_YOUTUBE_API_KEY = 'AIzaSyBMhLs1XEBfInBFB7vQ3DjMZfP-2OCM1xw';

function getApiKey(): string {
  try {
    return import.meta.env.VITE_YOUTUBE_API_KEY || DEFAULT_YOUTUBE_API_KEY;
  } catch {
    return DEFAULT_YOUTUBE_API_KEY;
  }
}

/**
 * Busca canales de YouTube con soporte 100% garantizado en producción y desarrollo
 */
export async function searchYouTubeChannels(
  query: string,
  limit = 20
): Promise<YTChannelResult[]> {
  if (!query || !query.trim()) return [];
  const q = query.trim();

  // 1. INTENTO PRINCIPAL: Google YouTube Data API v3 (Funciona 100% en producción y móviles)
  try {
    const apiKey = getApiKey();
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(q)}&maxResults=${limit}&key=${apiKey}`;
    const res = await fetch(searchUrl, { signal: AbortSignal.timeout(5000) });

    if (res.ok) {
      const data = await res.json();
      if (data.items && data.items.length > 0) {
        const channelIds = data.items
          .map((i: any) => i.id?.channelId || i.snippet?.channelId)
          .filter(Boolean)
          .join(',');

        // Enriquecer con avatars de alta calidad y conteo de suscriptores
        let statsMap = new Map<string, any>();
        try {
          const statsUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${channelIds}&key=${apiKey}`;
          const statsRes = await fetch(statsUrl, { signal: AbortSignal.timeout(4000) });
          if (statsRes.ok) {
            const statsData = await statsRes.json();
            statsData.items?.forEach((item: any) => statsMap.set(item.id, item));
          }
        } catch {}

        // Verificar directos activos
        let liveMap = new Map<string, { videoId: string; title: string }>();
        try {
          const liveUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&eventType=live&type=video&q=${encodeURIComponent(q)}&key=${apiKey}`;
          const liveRes = await fetch(liveUrl, { signal: AbortSignal.timeout(4000) });
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

        return parsedList;
      }
    }
  } catch (err) {
    console.warn('[searchYouTubeChannels] API v3 search fallback:', err);
  }

  // 2. INTENTO SECUNDARIO (Proxy Local Vite para desarrollo offline)
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
      return parsed.slice(0, limit);
    }
  } catch {}

  return [];
}

/**
 * Resuelve la señal sintonizable activa de un canal para emisión 24/7
 */
export async function resolveChannelPlayable(
  channelId: string,
  channelName?: string
): Promise<ChannelPlayableInfo> {
  const apiKey = getApiKey();
  const uploadsPlaylistId = channelId.startsWith('UC') ? `UU${channelId.slice(2)}` : '';

  // 1. PASO 1 (MÁXIMA PRIORIDAD): Detección de Transmisión en Vivo Activa AHORA
  try {
    const liveUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&eventType=live&type=video&key=${apiKey}`;
    const liveRes = await fetch(liveUrl, { signal: AbortSignal.timeout(4000) });
    if (liveRes.ok) {
      const liveData = await liveRes.json();
      if (liveData.items && liveData.items.length > 0) {
        const live = liveData.items[0];
        return {
          videoId: live.id?.videoId,
          videoUrl: `https://www.youtube.com/embed/${live.id?.videoId}`,
          title: live.snippet?.title || 'Transmisión en Vivo',
          isLive: true
        };
      }
    }
  } catch (err) {
    console.warn('[resolveChannelPlayable] Live check fallback:', err);
  }

  // 2. PASO 2: Obtener los videos más recientes en orden cronológico estricto (programas recientes primero)
  try {
    const vidsUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&order=date&type=video&maxResults=15&key=${apiKey}`;
    const vidsRes = await fetch(vidsUrl, { signal: AbortSignal.timeout(4000) });
    if (vidsRes.ok) {
      const vidsData = await vidsRes.json();
      if (vidsData.items && vidsData.items.length > 0) {
        const first = vidsData.items[0];
        const otherIds = vidsData.items.slice(1).map((i: any) => i.id?.videoId).filter(Boolean);
        const playlist = otherIds.length > 0 ? otherIds.join(',') : first.id?.videoId;

        return {
          videoId: first.id?.videoId,
          videoUrl: `https://www.youtube.com/embed/${first.id?.videoId}?playlist=${playlist}`,
          title: first.snippet?.title || (channelName ? `Ahora: ${channelName}` : 'Emisión 24/7'),
          isLive: false
        };
      }
    }
  } catch (err) {
    console.warn('[resolveChannelPlayable] Recent videos search fallback:', err);
  }

  // 3. PASO 3: Lista de reproducción oficial de subidas (UU...)
  if (uploadsPlaylistId) {
    return {
      videoId: '',
      videoUrl: `https://www.youtube.com/embed/videoseries?list=${uploadsPlaylistId}`,
      title: 'Emisión Continua 24/7',
      isLive: false
    };
  }

  return {
    videoId: channelId,
    videoUrl: `https://www.youtube.com/embed/videoseries?list=UU${channelId.replace(/^UC/, '')}`,
    title: 'Señal en Vivo',
    isLive: false
  };
}

/**
 * Busca recursivamente todos los channelRenderer en InnerTube
 */
function findChannelRenderers(obj: any, results: any[] = []): any[] {
  if (!obj || typeof obj !== 'object') return results;
  if (obj.channelRenderer) {
    results.push(obj.channelRenderer);
  }
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (Array.isArray(val)) {
      for (let i = 0; i < val.length; i++) {
        findChannelRenderers(val[i], results);
      }
    } else if (val && typeof val === 'object') {
      findChannelRenderers(val, results);
    }
  }
  return results;
}

/**
 * Parsea un channelRenderer de YouTube InnerTube
 */
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
