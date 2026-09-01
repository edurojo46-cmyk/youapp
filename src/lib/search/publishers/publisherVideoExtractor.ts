/**
 * publisherVideoExtractor.ts
 *
 * Extractor 100% determinista (sin IA) de videos embebidos en páginas de medios,
 * sitemaps de video, feeds RSS y metadatos JSON-LD / OpenGraph.
 */

export interface ExtractedPublisherVideo {
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
  extractionMethod: 'iframe' | 'video_object' | 'video_sitemap' | 'rss' | 'open_graph' | 'twitter_player';
}

// ── 1. Extracción de YouTube ───────────────────────────────────────────────
export function extractYouTubeId(urlOrEmbed: string): string | null {
  if (!urlOrEmbed) return null;
  // Match youtube.com/embed/ID, youtube-nocookie.com/embed/ID, youtu.be/ID, youtube.com/watch?v=ID
  const patterns = [
    /(?:youtube(?:-nocookie)?\.com\/embed\/|youtu\.be\/|youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/
  ];

  for (const pattern of patterns) {
    const match = urlOrEmbed.match(pattern);
    if (match && match[1]) return match[1];
  }
  return null;
}

// ── 2. Extracción de Vimeo ─────────────────────────────────────────────────
export function extractVimeoId(urlOrEmbed: string): string | null {
  if (!urlOrEmbed) return null;
  const match = urlOrEmbed.match(/(?:player\.)?vimeo\.com\/(?:video\/)?([0-9]{6,12})/);
  return match ? match[1] : null;
}

// ── 3. Extracción de Dailymotion ───────────────────────────────────────────
export function extractDailymotionId(urlOrEmbed: string): string | null {
  if (!urlOrEmbed) return null;
  const match = urlOrEmbed.match(/(?:dailymotion\.com\/embed\/video\/|dai\.ly\/)([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

// ── 4. Extracción de IFRAME / Embeds Explícitos ─────────────────────────────
export function extractIframeEmbeds(html: string, articleUrl: string, publisher: { code: string; name: string }): ExtractedPublisherVideo[] {
  const results: ExtractedPublisherVideo[] = [];
  const iframeRegex = /<iframe[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let match;

  while ((match = iframeRegex.exec(html)) !== null) {
    const src = match[1];
    
    // YouTube
    const ytId = extractYouTubeId(src);
    if (ytId) {
      results.push({
        provider: 'youtube',
        providerContentId: ytId,
        title: '', // Se completará con metadatos del artículo o VideoObject
        videoUrl: `https://www.youtube.com/watch?v=${ytId}`,
        thumbnailUrl: `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`,
        articleUrl,
        publisherCode: publisher.code,
        publisherName: publisher.name,
        discoveryMethod: 'publisher_embed',
        extractionMethod: 'iframe',
      });
      continue;
    }

    // Vimeo
    const vimeoId = extractVimeoId(src);
    if (vimeoId) {
      results.push({
        provider: 'vimeo',
        providerContentId: vimeoId,
        title: '',
        videoUrl: `https://vimeo.com/${vimeoId}`,
        articleUrl,
        publisherCode: publisher.code,
        publisherName: publisher.name,
        discoveryMethod: 'publisher_embed',
        extractionMethod: 'iframe',
      });
      continue;
    }

    // Dailymotion
    const dmId = extractDailymotionId(src);
    if (dmId) {
      results.push({
        provider: 'dailymotion',
        providerContentId: dmId,
        title: '',
        videoUrl: `https://www.dailymotion.com/video/${dmId}`,
        articleUrl,
        publisherCode: publisher.code,
        publisherName: publisher.name,
        discoveryMethod: 'publisher_embed',
        extractionMethod: 'iframe',
      });
    }
  }

  return results;
}

// ── 5. Extracción de Schema.org JSON-LD VideoObject ─────────────────────────
export function extractJsonLdVideoObjects(html: string, articleUrl: string, publisher: { code: string; name: string }): ExtractedPublisherVideo[] {
  const results: ExtractedPublisherVideo[] = [];
  const scriptRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;

  while ((match = scriptRegex.exec(html)) !== null) {
    try {
      const json = JSON.parse(match[1]);
      const objects = Array.isArray(json) ? json : json['@graph'] ? json['@graph'] : [json];

      for (const obj of objects) {
        if (obj['@type'] === 'VideoObject' || obj.type === 'VideoObject') {
          const embedUrl = obj.embedUrl || obj.contentUrl || '';
          const ytId = extractYouTubeId(embedUrl);
          const vimeoId = extractVimeoId(embedUrl);
          const dmId = extractDailymotionId(embedUrl);

          const provider = ytId ? 'youtube' : vimeoId ? 'vimeo' : dmId ? 'dailymotion' : 'publisher';
          const contentId = ytId || vimeoId || dmId || obj.url || embedUrl;

          if (contentId) {
            results.push({
              provider,
              providerContentId: contentId,
              title: obj.name || obj.headline || '',
              description: obj.description || '',
              thumbnailUrl: Array.isArray(obj.thumbnailUrl) ? obj.thumbnailUrl[0] : obj.thumbnailUrl,
              videoUrl: embedUrl || obj.url,
              durationSeconds: parseIsoDuration(obj.duration),
              publishedAt: obj.uploadDate || obj.datePublished,
              articleUrl,
              publisherCode: publisher.code,
              publisherName: publisher.name,
              discoveryMethod: 'publisher_embed',
              extractionMethod: 'video_object',
            });
          }
        }
      }
    } catch {
      // Ignorar JSON malformado
    }
  }

  return results;
}

// ── 6. Extracción de OpenGraph Video y Twitter Player ──────────────────────
export function extractOpenGraphVideo(html: string, articleUrl: string, publisher: { code: string; name: string }): ExtractedPublisherVideo[] {
  const results: ExtractedPublisherVideo[] = [];
  const ogVideoMatch = html.match(/<meta[^>]+property=["']og:video(?::url)?["'][^>]+content=["']([^"']+)["']/i);
  const twitterPlayerMatch = html.match(/<meta[^>]+name=["']twitter:player["'][^>]+content=["']([^"']+)["']/i);

  const videoUrl = ogVideoMatch?.[1] || twitterPlayerMatch?.[1];
  if (!videoUrl) return results;

  const ytId = extractYouTubeId(videoUrl);
  const vimeoId = extractVimeoId(videoUrl);
  const dmId = extractDailymotionId(videoUrl);

  if (ytId || vimeoId || dmId) {
    const titleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
    const descMatch = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
    const thumbMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);

    results.push({
      provider: ytId ? 'youtube' : vimeoId ? 'vimeo' : 'dailymotion',
      providerContentId: (ytId || vimeoId || dmId)!,
      title: titleMatch?.[1] || '',
      description: descMatch?.[1] || '',
      thumbnailUrl: thumbMatch?.[1] || (ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : undefined),
      videoUrl: ytId ? `https://www.youtube.com/watch?v=${ytId}` : videoUrl,
      articleUrl,
      publisherCode: publisher.code,
      publisherName: publisher.name,
      discoveryMethod: 'publisher_embed',
      extractionMethod: 'open_graph',
    });
  }

  return results;
}

// ── 7. Extracción de Feeds RSS / Media RSS ──────────────────────────────────
export function extractRSSMediaItems(xmlText: string, publisher: { code: string; name: string }): ExtractedPublisherVideo[] {
  const results: ExtractedPublisherVideo[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xmlText)) !== null) {
    const itemXml = match[1];
    const title = itemXml.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/i)?.[1] || itemXml.match(/<title>(.*?)<\/title>/i)?.[1] || '';
    const link = itemXml.match(/<link>(.*?)<\/link>/i)?.[1] || '';
    const pubDate = itemXml.match(/<pubDate>(.*?)<\/pubDate>/i)?.[1];

    // Buscar embeds en descripción / contenido
    const content = itemXml.match(/<content:encoded><!\[CDATA\[([\s\S]*?)\]\]><\/content:encoded>/i)?.[1] ||
                    itemXml.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/i)?.[1] ||
                    itemXml.match(/<description>([\s\S]*?)<\/description>/i)?.[1] || '';

    const ytId = extractYouTubeId(content) || extractYouTubeId(link);
    const vimeoId = extractVimeoId(content) || extractVimeoId(link);

    if (ytId || vimeoId) {
      results.push({
        provider: ytId ? 'youtube' : 'vimeo',
        providerContentId: (ytId || vimeoId)!,
        title: title.trim(),
        videoUrl: ytId ? `https://www.youtube.com/watch?v=${ytId}` : `https://vimeo.com/${vimeoId}`,
        thumbnailUrl: ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : undefined,
        publishedAt: pubDate ? new Date(pubDate).toISOString() : undefined,
        articleUrl: link.trim(),
        publisherCode: publisher.code,
        publisherName: publisher.name,
        discoveryMethod: 'publisher_feed',
        extractionMethod: 'rss',
      });
    }
  }

  return results;
}

// ── 8. Orquestador de Extracción con Jerarquía y Deduplicación ─────────────
export function extractVideosFromHtmlPage(html: string, articleUrl: string, publisher: { code: string; name: string }): ExtractedPublisherVideo[] {
  // 1. Extraer por JSON-LD (Mayor riqueza de metadatos)
  const jsonLdVideos = extractJsonLdVideoObjects(html, articleUrl, publisher);

  // 2. Extraer por IFRAME explícito
  const iframeVideos = extractIframeEmbeds(html, articleUrl, publisher);

  // 3. Extraer por OpenGraph
  const ogVideos = extractOpenGraphVideo(html, articleUrl, publisher);

  // Combinar y deduplicar por (provider, providerContentId)
  const map = new Map<string, ExtractedPublisherVideo>();

  // Título del artículo como fallback
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  const articleTitle = titleMatch ? titleMatch[1].replace(/ - [^-]+$/, '').trim() : '';

  // Insertar en orden de menor a mayor prioridad para que el más confiable sobreescriba
  for (const v of [...ogVideos, ...iframeVideos, ...jsonLdVideos]) {
    const key = `${v.provider}:${v.providerContentId}`;
    const existing = map.get(key);
    
    if (!existing) {
      if (!v.title && articleTitle) v.title = articleTitle;
      map.set(key, v);
    } else {
      // Enriquecer título o thumbnail si faltaban
      if (!existing.title && v.title) existing.title = v.title;
      if (!existing.thumbnailUrl && v.thumbnailUrl) existing.thumbnailUrl = v.thumbnailUrl;
      if (!existing.description && v.description) existing.description = v.description;
    }
  }

  return Array.from(map.values());
}

// Helper: Parsear ISO 8601 Duration (ej: PT1H2M30S)
function parseIsoDuration(durationStr?: string): number | undefined {
  if (!durationStr || !durationStr.startsWith('P')) return undefined;
  const match = durationStr.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return undefined;
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);
  return hours * 3600 + minutes * 60 + seconds;
}
