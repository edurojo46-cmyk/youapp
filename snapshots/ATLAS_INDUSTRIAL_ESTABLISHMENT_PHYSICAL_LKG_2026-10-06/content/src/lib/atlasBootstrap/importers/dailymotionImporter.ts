/**
 * dailymotionImporter.ts — Importador Dailymotion para Atlas Bootstrap
 */

import type { RawDiscoveredItem } from '../bootstrapTypes';

const DM_FIELDS = 'id,title,description,duration,created_time,thumbnail_480_url,thumbnail_url,owner,channel,allow_embed,onair,views_total,language';

export async function importFromDailymotion(
  query: string,
  topicCluster: string,
  runId: string,
  limit = 25,
  page = 1
): Promise<RawDiscoveredItem[]> {
  try {
    const params = new URLSearchParams({
      search: query,
      fields: DM_FIELDS,
      limit: String(Math.min(limit, 50)),
      page: String(page),
      sort: 'relevance'
    });

    const res = await fetch(`https://api.dailymotion.com/videos?${params.toString()}`, {
      signal: AbortSignal.timeout(8000)
    });

    if (!res.ok) return [];
    const data = await res.json();
    const list = data.list || [];

    return list.map((item: any): RawDiscoveredItem => {
      const videoId = item.id;
      const publishedAt = item.created_time
        ? new Date(item.created_time * 1000).toISOString()
        : null;

      return {
        provider: 'dailymotion',
        providerContentId: videoId,
        title: item.title || 'Sin título',
        description: item.description || '',
        creatorName: item.owner?.screenname || item.channel || 'Dailymotion Creator',
        creatorId: item.owner?.id,
        canonicalUrl: `https://www.dailymotion.com/video/${videoId}`,
        embedUrl: `https://www.dailymotion.com/embed/video/${videoId}`,
        thumbnailUrl: item.thumbnail_480_url || item.thumbnail_url,
        durationSeconds: item.duration || 0,
        publishedAt,
        language: item.language || 'es',
        topicCluster,
        embeddable: item.allow_embed !== false,
        provenance: {
          bootstrapRun: runId,
          discoveryOrigin: 'dailymotion_api',
          sourceSeed: query,
          discoveredAt: new Date().toISOString(),
          canonicalId: videoId
        }
      };
    });
  } catch (err: any) {
    console.warn(`[DailymotionImporter] Error importando "${query}":`, err.message);
    return [];
  }
}
