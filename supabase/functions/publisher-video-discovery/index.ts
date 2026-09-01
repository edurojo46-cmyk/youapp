import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

const ALLOWED_PUBLISHER_DOMAINS = [
  'tvpublica.com.ar',
  'www.tvpublica.com.ar',
  'encuentro.gob.ar',
  'www.encuentro.gob.ar',
  'argentina.gob.ar',
  'www.argentina.gob.ar',
  'bn.gov.ar',
  'www.bn.gov.ar',
  'infobae.com',
  'www.infobae.com',
  'lanacion.com.ar',
  'www.lanacion.com.ar',
  'clarin.com',
  'www.clarin.com',
  'inmuebles.clarin.com',
  'pagina12.com.ar',
  'www.pagina12.com.ar',
  'revistaanfibia.com',
  'www.revistaanfibia.com'
];

interface ExtractedVideo {
  provider: 'youtube' | 'vimeo' | 'dailymotion' | 'publisher';
  providerContentId: string;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  videoUrl: string;
  durationSeconds?: number;
  publishedAt?: string;
  articleUrl: string;
  articleTitle?: string;
  publisherCode: string;
  publisherName: string;
  discoveryMethod: 'publisher_embed' | 'publisher_feed' | 'publisher_sitemap';
  extractionMethod: 'iframe' | 'video_object' | 'video_sitemap' | 'rss' | 'open_graph' | 'explicit_link';
}

function isSafeUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    const host = parsed.hostname.toLowerCase();
    
    // SSRF Guard
    if (host === 'localhost' || host === '127.0.0.1' || host.startsWith('10.') || host.startsWith('192.168.') || host.startsWith('172.')) {
      return false;
    }
    return ALLOWED_PUBLISHER_DOMAINS.some(d => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

function extractYouTubeId(str: string): string | null {
  if (!str) return null;
  const match = str.match(/(?:youtube(?:-nocookie)?\.com\/embed\/|youtu\.be\/|youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{8,16})/);
  return match ? match[1] : null;
}

function extractVimeoId(str: string): string | null {
  if (!str) return null;
  const match = str.match(/(?:player\.)?vimeo\.com\/(?:video\/)?([0-9]{6,12})/);
  return match ? match[1] : null;
}

function extractDailymotionId(str: string): string | null {
  if (!str) return null;
  const match = str.match(/(?:dailymotion\.com\/embed\/video\/|dai\.ly\/|dailymotion\.com\/video\/)([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

function parseVideosFromHtml(html: string, articleUrl: string, publisherCode: string, publisherName: string): ExtractedVideo[] {
  const map = new Map<string, ExtractedVideo>();

  // Extraer título del artículo si existe
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const pageTitle = titleMatch ? titleMatch[1].replace(/\s*\|\s*Página12.*$/i, '').trim() : '';

  // 1. JSON-LD VideoObject
  const scriptRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let sMatch;
  while ((sMatch = scriptRegex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(sMatch[1]);
      const list = Array.isArray(parsed) ? parsed : parsed['@graph'] ? parsed['@graph'] : [parsed];
      for (const obj of list) {
        if (obj['@type'] === 'VideoObject' || obj.type === 'VideoObject') {
          const embedUrl = obj.embedUrl || obj.contentUrl || '';
          const ytId = extractYouTubeId(embedUrl);
          const vimeoId = extractVimeoId(embedUrl);
          const dmId = extractDailymotionId(embedUrl);
          const id = ytId || vimeoId || dmId || obj.url;
          if (id) {
            const provider = ytId ? 'youtube' : vimeoId ? 'vimeo' : dmId ? 'dailymotion' : 'publisher';
            const key = `${provider}:${id}`;
            map.set(key, {
              provider,
              providerContentId: id,
              title: obj.name || obj.headline || pageTitle || '',
              description: obj.description || '',
              thumbnailUrl: Array.isArray(obj.thumbnailUrl) ? obj.thumbnailUrl[0] : obj.thumbnailUrl,
              videoUrl: embedUrl || obj.url,
              publishedAt: obj.uploadDate || obj.datePublished,
              articleUrl,
              articleTitle: pageTitle,
              publisherCode,
              publisherName,
              discoveryMethod: 'publisher_embed',
              extractionMethod: 'video_object'
            });
          }
        }
      }
    } catch {}
  }

  // 2. IFRAME Embeds
  const iframeRegex = /<iframe\b[^>]*?\bsrc=["']([^"']+)["'][^>]*>/gi;
  let iMatch;
  while ((iMatch = iframeRegex.exec(html)) !== null) {
    const src = iMatch[1];
    const ytId = extractYouTubeId(src);
    const vimeoId = extractVimeoId(src);
    const dmId = extractDailymotionId(src);
    if (ytId || vimeoId || dmId) {
      const provider = ytId ? 'youtube' : vimeoId ? 'vimeo' : 'dailymotion';
      const id = ytId || vimeoId || dmId!;
      const key = `${provider}:${id}`;
      if (!map.has(key)) {
        map.set(key, {
          provider,
          providerContentId: id,
          title: pageTitle,
          videoUrl: ytId ? `https://www.youtube.com/watch?v=${ytId}` : vimeoId ? `https://vimeo.com/${vimeoId}` : `https://www.dailymotion.com/video/${dmId}`,
          thumbnailUrl: ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : undefined,
          articleUrl,
          articleTitle: pageTitle,
          publisherCode,
          publisherName,
          discoveryMethod: 'publisher_embed',
          extractionMethod: 'iframe'
        });
      }
    }
  }

  // 3. Enlaces explícitos
  const linkPatterns = [
    /(?:https?:\/\/)?(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]{8,16})/gi,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{8,16})/gi,
    /(?:https?:\/\/)?(?:player\.)?vimeo\.com\/(?:video\/)?([0-9]{6,12})/gi,
    /(?:https?:\/\/)?(?:www\.)?dailymotion\.com\/video\/([a-zA-Z0-9]+)/gi,
    /(?:https?:\/\/)?(?:www\.)?dai\.ly\/([a-zA-Z0-9]+)/gi
  ];

  for (const pattern of linkPatterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const id = match[1];
      const isYt = pattern.source.includes('youtu');
      const isVimeo = pattern.source.includes('vimeo');
      const provider = isYt ? 'youtube' : isVimeo ? 'vimeo' : 'dailymotion';
      const key = `${provider}:${id}`;

      if (!map.has(key)) {
        map.set(key, {
          provider,
          providerContentId: id,
          title: pageTitle,
          videoUrl: isYt ? `https://www.youtube.com/watch?v=${id}` : isVimeo ? `https://vimeo.com/${id}` : `https://www.dailymotion.com/video/${id}`,
          thumbnailUrl: isYt ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : undefined,
          articleUrl,
          articleTitle: pageTitle,
          publisherCode,
          publisherName,
          discoveryMethod: 'publisher_embed',
          extractionMethod: 'explicit_link'
        });
      }
    }
  }

  return Array.from(map.values());
}

serve(async (req) => {
  // Preflight CORS 204
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const query = (body?.query || '').trim();
    const publisherFilter = body?.publisherFilter || 'pagina12';
    const targetUrl = body?.url || body?.articleUrl;

    if (!query && !targetUrl) {
      return new Response(JSON.stringify({ ok: false, error: 'Query or url is required', videos: [] }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const videos: ExtractedVideo[] = [];
    let pagesFetched = 0;
    const fetchHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
    };

    // 1. Si se pasó una URL directa
    if (targetUrl && isSafeUrl(targetUrl)) {
      try {
        const resp = await fetch(targetUrl, { headers: fetchHeaders, signal: AbortSignal.timeout(8000) });
        if (resp.ok) {
          pagesFetched++;
          const html = await resp.text();
          const extracted = parseVideosFromHtml(html, targetUrl, publisherFilter, 'Página/12');
          videos.push(...extracted);
        }
      } catch (err) {
        console.warn(`[PublisherDiscovery] Error fetching direct url ${targetUrl}:`, err);
      }
    }

    // 2. Si se pasó una búsqueda de Página/12
    if (videos.length === 0 && (publisherFilter === 'pagina12' || publisherFilter === 'all')) {
      const endpointsToTry = [
        `https://www.pagina12.com.ar/buscar?q=${encodeURIComponent(query)}`,
        `https://www.pagina12.com.ar/el-pais/`
      ];

      for (const endpoint of endpointsToTry) {
        if (videos.length > 0) break;
        try {
          const resp = await fetch(endpoint, { headers: fetchHeaders, signal: AbortSignal.timeout(8000) });
          if (resp.ok) {
            pagesFetched++;
            const html = await resp.text();
            
            // Extraer videos directamente de la página
            const directVideos = parseVideosFromHtml(html, endpoint, 'pagina12', 'Página/12');
            videos.push(...directVideos);

            // Extraer enlaces a artículos (formato /\d{4}\/\d{2}\/\d{2}\/slug/)
            const articleLinks = new Set<string>();
            const linkRegex = /href=["'](\/\d{4}\/\d{2}\/\d{2}\/[^"']+)["']/gi;
            let m;
            while ((m = linkRegex.exec(html)) !== null && articleLinks.size < 3) {
              articleLinks.add(`https://www.pagina12.com.ar${m[1]}`);
            }

            for (const link of articleLinks) {
              if (videos.length >= 3) break;
              try {
                const artResp = await fetch(link, { headers: fetchHeaders, signal: AbortSignal.timeout(6000) });
                if (artResp.ok) {
                  pagesFetched++;
                  const artHtml = await artResp.text();
                  const artVideos = parseVideosFromHtml(artHtml, link, 'pagina12', 'Página/12');
                  videos.push(...artVideos);
                }
              } catch {}
            }
          }
        } catch (err) {
          console.warn(`[PublisherDiscovery] Error searching endpoint ${endpoint}:`, err);
        }
      }
    }

    const uniqueMap = new Map<string, ExtractedVideo>();
    for (const v of videos) {
      const key = `${v.provider}:${v.providerContentId}`;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, v);
      }
    }
    const uniqueVideos = Array.from(uniqueMap.values());

    return new Response(JSON.stringify({
      ok: true,
      publisher: publisherFilter,
      videos: uniqueVideos,
      stats: {
        pagesFetched,
        extractedRaw: videos.length,
        uniqueVideos: uniqueVideos.length,
        qualifiedVideos: uniqueVideos.length
      }
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ ok: false, error: error.message || String(error), videos: [] }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
