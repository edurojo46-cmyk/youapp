/**
 * youtubeReferenceExtractor.ts — Extractor Exhaustivo de Referencias de YouTube
 *
 * Formatos Reconocidos:
 * - URLs canónicas (watch?v=, youtu.be/, embed/, shorts/, v/)
 * - iframes HTML (src="https://www.youtube.com/embed/...")
 * - mRSS (<media:player url="...">, <media:content url="...">)
 * - Video Sitemaps (<video:player_loc>, <video:content_loc>)
 * - JSON-LD Schema (VideoObject, embedUrl, contentUrl)
 * - oEmbed y microdata
 */

import type { YouTubeHarvestReference, YouTubeReferenceOrigin } from './types';

const YOUTUBE_EXTRACT_PATTERNS = [
  // 1. URLs directas y embeds en texto/HTML
  /(?:youtube\.com\/watch\?[^"'\s<>]*v=|youtu\.be\/|youtube\.com\/embed\/|youtube-nocookie\.com\/embed\/|youtube\.com\/shorts\/|youtube\.com\/v\/)([A-Za-z0-9_-]{11})/gi,
  // 2. iframes y atributos src / href
  /(?:src|href)=["']https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})["']/gi,
  // 3. XML video:player_loc y video:content_loc
  /<video:(?:player_loc|content_loc)[^>]*>https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})[^<]*<\/video:(?:player_loc|content_loc)>/gi,
  // 4. mRSS media:player y media:content
  /<media:(?:player|content)[^>]*url=["']https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})["'][^>]*>/gi,
  // 5. JSON-LD embedUrl / contentUrl
  /"(?:embedUrl|contentUrl)"\s*:\s*"https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})"/gi,
  // 6. Entidades escapadas HTML (&quot; y &amp;)
  /(?:&quot;|&#34;)https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/gi
];

export function extractYouTubeVideoId(content: string): string | null {
  if (!content) return null;
  for (const pattern of YOUTUBE_EXTRACT_PATTERNS) {
    pattern.lastIndex = 0;
    const match = pattern.exec(content);
    if (match && match[1] && match[1].length === 11 && !/^(watch|embed|video|null|index)$/i.test(match[1])) {
      return match[1];
    }
  }
  return null;
}

export function extractYouTubeVideoIds(content: string): Set<string> {
  const ids = new Set<string>();
  if (!content) return ids;

  for (const pattern of YOUTUBE_EXTRACT_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      if (match[1] && match[1].length === 11 && !/^(watch|embed|video|null|index)$/i.test(match[1])) {
        ids.add(match[1]);
      }
    }
  }

  // Extracción de JSON-LD estructurado si existe
  const jsonLdMatches = content.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  if (jsonLdMatches) {
    for (const block of jsonLdMatches) {
      const inner = block.replace(/<\/?script[^>]*>/gi, '').trim();
      try {
        const parsed = JSON.parse(inner);
        const checkObject = (obj: any) => {
          if (!obj || typeof obj !== 'object') return;
          if (obj.embedUrl && typeof obj.embedUrl === 'string') {
            const m = obj.embedUrl.match(/(?:embed\/|v=)([A-Za-z0-9_-]{11})/);
            if (m && m[1]) ids.add(m[1]);
          }
          if (obj.contentUrl && typeof obj.contentUrl === 'string') {
            const m = obj.contentUrl.match(/(?:embed\/|v=)([A-Za-z0-9_-]{11})/);
            if (m && m[1]) ids.add(m[1]);
          }
          if (Array.isArray(obj)) obj.forEach(checkObject);
          else Object.values(obj).forEach(checkObject);
        };
        checkObject(parsed);
      } catch {
        // Ignorar JSON-LD malformado
      }
    }
  }

  return ids;
}

export function parseFeedOrSitemapForYouTubeRefs(
  xmlOrJsonOrHtml: string,
  origin: YouTubeReferenceOrigin
): YouTubeHarvestReference[] {
  const references: YouTubeHarvestReference[] = [];
  const discoveredIds = new Set<string>();
  const now = new Date().toISOString();

  // 1. Parsing por Bloques (<item>, <entry>, <url>, <article>, <div class="video">)
  const itemRegex = /<(?:item|entry|url|article)[\s>]([\s\S]*?)<\/(?:item|entry|url|article)>/gi;
  let itemMatch: RegExpExecArray | null;

  while ((itemMatch = itemRegex.exec(xmlOrJsonOrHtml)) !== null) {
    const block = itemMatch[1];
    const idsInBlock = extractYouTubeVideoIds(block);

    // Extraer metadata si viene disponible
    const titleMatch = block.match(/<(?:title|video:title|h1|h2)[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/(?:title|video:title|h1|h2)>/i);
    const descMatch = block.match(/<(?:description|summary|video:description|p)[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/(?:description|summary|video:description|p)>/i);
    const thumbMatch = block.match(/<(?:media:thumbnail|video:thumbnail_loc)[^>]*url=["']([^"']+)["'][^>]*>/i) ||
                       block.match(/<video:thumbnail_loc>([^<]+)<\/video:thumbnail_loc>/i);
    const durationMatch = block.match(/<(?:video:duration|yt:duration)[^>]*seconds=["']?(\d+)["']?/i);
    const dateMatch = block.match(/<(?:pubDate|published|video:publication_date)>([^<]+)<\//i);

    const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : undefined;
    const description = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : undefined;
    const thumbnailUrl = thumbMatch ? thumbMatch[1].trim() : undefined;
    const durationSeconds = durationMatch ? parseInt(durationMatch[1], 10) : undefined;
    const publishedAt = dateMatch ? new Date(dateMatch[1]).toISOString() : undefined;

    for (const vId of idsInBlock) {
      if (!discoveredIds.has(vId)) {
        discoveredIds.add(vId);
        references.push({
          videoId: vId,
          canonicalUrl: `https://www.youtube.com/watch?v=${vId}`,
          title: title || `YouTube Reference [${vId}]`,
          description,
          thumbnailUrl: thumbnailUrl || `https://i.ytimg.com/vi/${vId}/hqdefault.jpg`,
          durationSeconds,
          publishedAt,
          discoveredAt: now,
          origin,
          harvestTier: 'bronze'
        });
      }
    }
  }

  // 2. Si no hubo bloques estructurados, extraer del documento global
  if (references.length === 0) {
    const globalIds = extractYouTubeVideoIds(xmlOrJsonOrHtml);
    for (const vId of globalIds) {
      references.push({
        videoId: vId,
        canonicalUrl: `https://www.youtube.com/watch?v=${vId}`,
        title: `YouTube Reference [${vId}]`,
        thumbnailUrl: `https://i.ytimg.com/vi/${vId}/hqdefault.jpg`,
        discoveredAt: now,
        origin,
        harvestTier: 'bronze'
      });
    }
  }

  return references;
}
