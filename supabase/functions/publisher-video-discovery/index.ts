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
    if (parsed.protocol !== 'https:') return false;
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
              title: obj.name || obj.headline || '',
              description: obj.description || '',
              thumbnailUrl: Array.isArray(obj.thumbnailUrl) ? obj.thumbnailUrl[0] : obj.thumbnailUrl,
              videoUrl: embedUrl || obj.url,
              publishedAt: obj.uploadDate || obj.datePublished,
              articleUrl,
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
          title: '',
          videoUrl: ytId ? `https://www.youtube.com/watch?v=${ytId}` : vimeoId ? `https://vimeo.com/${vimeoId}` : `https://www.dailymotion.com/video/${dmId}`,
          thumbnailUrl: ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : undefined,
          articleUrl,
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
          title: '',
          videoUrl: isYt ? `https://www.youtube.com/watch?v=${id}` : isVimeo ? `https://vimeo.com/${id}` : `https://www.dailymotion.com/video/${id}`,
          thumbnailUrl: isYt ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : undefined,
          articleUrl,
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
    const publisherFilter = body?.publisherFilter;

    if (!query || typeof query !== 'string') {
      return new Response(JSON.stringify({ ok: false, error: 'Query is required', videos: [] }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const videos: ExtractedVideo[] = [];
    const stats = {
      pagesFetched: 0,
      extractedRaw: 0,
      uniqueVideos: 0,
      qualifiedVideos: 0
    };

    return new Response(JSON.stringify({
      ok: true,
      videos,
      stats: {
        ...stats,
        uniqueVideos: videos.length
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
