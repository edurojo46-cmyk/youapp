/**
 * youtubeChannelSearch.ts
 * Búsqueda y Resolución de Canales de YouTube para YouApp TV sin API Key.
 * 
 * - Motor: YouTube InnerTube API (v1/search y v1/browse)
 * - Detección inteligente de transmisiones en directo activas (Live Now).
 * - Cola continua 24/7 de emisiones cronológicas (las más recientes primero) si el canal no está en vivo.
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

/**
 * Payload oficial de InnerTube para buscar solo canales (filtro params: EgIQAg%3D%3D)
 */
function createInnerTubeSearchPayload(query: string) {
  return {
    context: {
      client: {
        clientName: 'WEB',
        clientVersion: '2.20231201.00.00',
        hl: 'es',
        gl: 'AR'
      }
    },
    query: query,
    params: 'EgIQAg%3D%3D' // Filtro canales únicamente
  };
}

/**
 * Payload para buscar directos en vivo en emisión ahora (filtro params: EgJAAQ%3D%3D)
 */
function createInnerTubeLivePayload(query: string) {
  return {
    context: {
      client: {
        clientName: 'WEB',
        clientVersion: '2.20231201.00.00',
        hl: 'es',
        gl: 'AR'
      }
    },
    query: query,
    params: 'EgJAAQ%3D%3D' // Filtro EN VIVO AHORA
  };
}

/**
 * Payload para consultar los videos y directos de un canal
 */
function createInnerTubeBrowsePayload(channelId: string) {
  return {
    context: {
      client: {
        clientName: 'WEB',
        clientVersion: '2.20231201.00.00',
        hl: 'es',
        gl: 'AR'
      }
    },
    browseId: channelId
  };
}

/**
 * Busca recursivamente todos los channelRenderer
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
 * Parsea un channelRenderer de YouTube
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
      r.subscriberCountText?.accessibility?.accessibilityData?.label ||
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

    const isVerified = Boolean(
      r.ownerBadges?.some((b: any) =>
        b.metadataBadgeRenderer?.style?.includes('VERIFIED') ||
        b.metadataBadgeRenderer?.icon?.iconType === 'CHECK_CIRCLE_THICK' ||
        b.metadataBadgeRenderer?.tooltip === 'Verificado'
      )
    );

    return {
      channelId,
      name,
      handle,
      subscribers,
      videoCount,
      description,
      avatarUrl,
      isVerified,
      channelUrl: `https://www.youtube.com/channel/${channelId}`,
    };
  } catch {
    return null;
  }
}

/**
 * Petición con soporte proxy multi-capa
 */
async function postInnerTube(endpoint: 'search' | 'browse', payload: any, timeoutMs = 6000): Promise<any> {
  const payloadStr = JSON.stringify(payload);

  const targets: { url: string; headers: Record<string, string> }[] = [
    // 1. Proxy local Vite (cero CORS)
    {
      url: `/api/youtubei/v1/${endpoint}`,
      headers: { 'Content-Type': 'application/json' }
    },
    // 2. Proxy CORS 1
    {
      url: `https://corsproxy.io/?${encodeURIComponent(`https://www.youtube.com/youtubei/v1/${endpoint}`)}`,
      headers: {
        'Content-Type': 'application/json',
        'X-YouTube-Client-Name': '1',
        'X-YouTube-Client-Version': '2.20231201.00.00'
      }
    },
    // 3. ThingProxy
    {
      url: `https://thingproxy.freeboard.io/fetch/https://www.youtube.com/youtubei/v1/${endpoint}`,
      headers: {
        'Content-Type': 'application/json',
        'X-YouTube-Client-Name': '1',
        'X-YouTube-Client-Version': '2.20231201.00.00'
      }
    }
  ];

  for (const t of targets) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);

      const res = await fetch(t.url, {
        method: 'POST',
        headers: t.headers,
        body: payloadStr,
        signal: ctrl.signal
      });
      clearTimeout(timer);

      if (res.ok) {
        const data = await res.json();
        if (data && (data.contents || data.responseContext)) {
          return data;
        }
      }
    } catch {
      // Probar siguiente
    }
  }

  throw new Error(`Fallo de conexión a InnerTube ${endpoint}`);
}

/**
 * Busca canales en YouTube sin API Key
 */
export async function searchYouTubeChannels(
  query: string,
  limit = 25
): Promise<YTChannelResult[]> {
  if (!query || !query.trim()) return [];

  const rawData = await postInnerTube('search', createInnerTubeSearchPayload(query.trim()));
  const renderers = findChannelRenderers(rawData);

  const parsed = renderers
    .map(parseChannelRenderer)
    .filter((c): c is YTChannelResult => c !== null && Boolean(c.name) && Boolean(c.channelId));

  // También verificar si hay directos activos para los canales encontrados
  try {
    const rawLive = await postInnerTube('search', createInnerTubeLivePayload(query.trim()), 4000);
    const liveVideoMap = new Map<string, { videoId: string; title: string }>();

    function scanLive(obj: any) {
      if (!obj || typeof obj !== 'object') return;
      if (obj.videoId && (obj.title?.runs || obj.title?.simpleText)) {
        const vid = obj.videoId;
        const title = obj.title?.runs?.[0]?.text || obj.title?.simpleText || '';
        const cid = obj.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId ||
          obj.shortBylineText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || '';
        if (cid && !liveVideoMap.has(cid)) {
          liveVideoMap.set(cid, { videoId: vid, title });
        }
      }
      for (const k of Object.keys(obj)) {
        const val = obj[k];
        if (Array.isArray(val)) val.forEach(scanLive);
        else if (val && typeof val === 'object') scanLive(val);
      }
    }
    scanLive(rawLive);

    parsed.forEach(c => {
      if (liveVideoMap.has(c.channelId)) {
        c.isLiveNow = true;
        c.latestVideoId = liveVideoMap.get(c.channelId)?.videoId;
      }
    });
  } catch {}

  const seen = new Set<string>();
  const unique: YTChannelResult[] = [];
  for (const item of parsed) {
    if (!seen.has(item.channelId)) {
      seen.add(item.channelId);
      unique.push(item);
    }
  }

  return unique.slice(0, limit);
}

/**
 * Resuelve la señal sintonizable activa de un canal para emisión 24/7
 * 
 * - Paso 1: Detección inteligente de transmisión EN VIVO activa en ese instante (Live Now).
 * - Paso 2: Si no está en directo, consulta la página del canal y arma la cola 24/7 con los programas más recientes.
 * - Paso 3: Búsqueda ordenada cronológicamente (params: CAISAhAB).
 */
export async function resolveChannelPlayable(
  channelId: string,
  channelName?: string
): Promise<ChannelPlayableInfo> {
  const uploadsPlaylistId = channelId.startsWith('UC') ? `UU${channelId.slice(2)}` : '';

  // 1. PASO 1 (MÁXIMA PRIORIDAD): Detección de Transmisión en Vivo Activa AHORA
  if (channelName) {
    try {
      const rawLive = await postInnerTube('search', createInnerTubeLivePayload(channelName), 4000);
      const liveVids: { videoId: string; title: string; author: string; channelId: string }[] = [];

      function scanLiveDirect(obj: any) {
        if (!obj || typeof obj !== 'object') return;
        if (obj.videoId && (obj.title?.runs || obj.title?.simpleText)) {
          const vid = obj.videoId;
          const title = obj.title?.runs?.[0]?.text || obj.title?.simpleText || '';
          const author = obj.ownerText?.runs?.[0]?.text || obj.shortBylineText?.runs?.[0]?.text || '';
          const cid = obj.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId ||
            obj.shortBylineText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || '';
          if (!liveVids.some(v => v.videoId === vid)) {
            liveVids.push({ videoId: vid, title, author, channelId: cid });
          }
        }
        for (const k of Object.keys(obj)) {
          const val = obj[k];
          if (Array.isArray(val)) val.forEach(scanLiveDirect);
          else if (val && typeof val === 'object') scanLiveDirect(val);
        }
      }
      scanLiveDirect(rawLive);

      const liveMatch = liveVids.find(v =>
        v.channelId === channelId ||
        (channelName && v.author.toLowerCase().includes(channelName.toLowerCase())) ||
        (channelName && channelName.toLowerCase().includes(v.author.toLowerCase()))
      );

      if (liveMatch) {
        return {
          videoId: liveMatch.videoId,
          videoUrl: `https://www.youtube.com/embed/${liveMatch.videoId}`,
          title: liveMatch.title,
          isLive: true
        };
      }
    } catch (err) {
      console.warn('[resolveChannelPlayable] Live stream check fallback:', err);
    }
  }

  // 2. PASO 2: Browse directo del canal (Garantiza obtener los videos más recientes del canal)
  try {
    const rawBrowse = await postInnerTube('browse', createInnerTubeBrowsePayload(channelId));
    const videoMap = new Map<string, { videoId: string; title: string; isLive: boolean }>();

    function scanBrowse(obj: any) {
      if (!obj || typeof obj !== 'object') return;
      if (obj.videoId) {
        const vid = obj.videoId;
        const title = obj.title?.runs?.[0]?.text || obj.title?.simpleText || obj.headline?.simpleText || '';
        const isLive = Boolean(
          obj.thumbnailOverlays?.some(
            (o: any) => o.thumbnailOverlayTimeStatusRenderer?.style === 'LIVE'
          )
        );
        if (!videoMap.has(vid)) {
          videoMap.set(vid, { videoId: vid, title, isLive });
        } else if (!videoMap.get(vid)?.title && title) {
          const item = videoMap.get(vid);
          if (item) item.title = title;
        }
      }
      for (const k of Object.keys(obj)) {
        const val = obj[k];
        if (Array.isArray(val)) val.forEach(scanBrowse);
        else if (val && typeof val === 'object') scanBrowse(val);
      }
    }
    scanBrowse(rawBrowse);

    const videos = Array.from(videoMap.values());
    // Priorizar en vivo si existe transmisión activa
    videos.sort((a, b) => (b.isLive ? 1 : 0) - (a.isLive ? 1 : 0));

    if (videos.length > 0) {
      const topVideos = videos.slice(0, 15);
      const firstVideo = topVideos[0];
      const otherIds = topVideos.slice(1).map(v => v.videoId);
      const playlistParam = otherIds.length > 0 ? otherIds.join(',') : firstVideo.videoId;

      return {
        videoId: firstVideo.videoId,
        videoUrl: `https://www.youtube.com/embed/${firstVideo.videoId}?playlist=${playlistParam}`,
        title: firstVideo.title,
        isLive: firstVideo.isLive
      };
    }
  } catch (err) {
    console.warn('[resolveChannelPlayable] Browse fallback:', err);
  }

  // 3. PASO 3: Búsqueda por nombre ordenada por fecha más reciente
  if (channelName) {
    try {
      const rawSearch = await postInnerTube('search', {
        context: {
          client: {
            clientName: 'WEB',
            clientVersion: '2.20231201.00.00',
            hl: 'es',
            gl: 'AR'
          }
        },
        query: channelName,
        params: 'CAISAhAB' // Orden cronológico estricto: Más reciente primero
      });

      const searchVideos: { videoId: string; title: string; isLive: boolean }[] = [];

      function scanSearch(obj: any) {
        if (!obj || typeof obj !== 'object') return;
        if (obj.videoId && (obj.title?.runs || obj.title?.simpleText)) {
          const vid = obj.videoId;
          const title = obj.title?.runs?.[0]?.text || obj.title?.simpleText || '';
          const isLive = Boolean(
            obj.thumbnailOverlays?.some(
              (o: any) => o.thumbnailOverlayTimeStatusRenderer?.style === 'LIVE'
            )
          );
          if (!searchVideos.some(v => v.videoId === vid)) {
            searchVideos.push({ videoId: vid, title, isLive });
          }
        }
        for (const k of Object.keys(obj)) {
          const val = obj[k];
          if (Array.isArray(val)) val.forEach(scanSearch);
          else if (val && typeof val === 'object') scanSearch(val);
        }
      }
      scanSearch(rawSearch);

      searchVideos.sort((a, b) => (b.isLive ? 1 : 0) - (a.isLive ? 1 : 0));

      if (searchVideos.length > 0) {
        const topVideos = searchVideos.slice(0, 15);
        const firstVideo = topVideos[0];
        const otherIds = topVideos.slice(1).map(v => v.videoId);
        const playlistParam = otherIds.length > 0 ? otherIds.join(',') : firstVideo.videoId;

        return {
          videoId: firstVideo.videoId,
          videoUrl: `https://www.youtube.com/embed/${firstVideo.videoId}?playlist=${playlistParam}`,
          title: firstVideo.title,
          isLive: firstVideo.isLive
        };
      }
    } catch {
      // Siguiente fallback
    }
  }

  // 4. Fallback con la playlist oficial de subidas continuas del canal
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
