/**
 * vimeoImporter.ts — Importador Vimeo para Atlas Bootstrap
 */

import type { RawDiscoveredItem } from '../bootstrapTypes';
import { supabase } from '../../supabase';

export async function importFromVimeo(
  query: string,
  topicCluster: string,
  runId: string,
  limit = 25
): Promise<RawDiscoveredItem[]> {
  try {
    const { data, error } = await (supabase.functions as any).invoke('vimeo-provider', {
      body: {
        query,
        limit,
        sort: 'relevant',
        ingest: false
      }
    });

    if (error || !data?.items?.length) return [];

    return data.items.map((item: any): RawDiscoveredItem => ({
      provider: 'vimeo',
      providerContentId: item.providerContentId || String(item.id),
      title: item.title || 'Sin título',
      description: item.description || '',
      creatorName: item.channelTitle || item.creatorName || 'Vimeo Creator',
      creatorId: item.channelId || item.creatorId,
      canonicalUrl: item.canonicalUrl || `https://vimeo.com/${item.providerContentId || item.id}`,
      embedUrl: item.embedUrl || `https://player.vimeo.com/video/${item.providerContentId || item.id}`,
      thumbnailUrl: item.thumbnail || item.thumbnailUrl,
      durationSeconds: item.durationSeconds || 0,
      publishedAt: item.publishedAt,
      language: item.language || 'es',
      topicCluster,
      embeddable: item.embeddable !== false,
      provenance: {
        bootstrapRun: runId,
        discoveryOrigin: 'vimeo_api',
        sourceSeed: query,
        discoveredAt: new Date().toISOString(),
        canonicalId: item.providerContentId || String(item.id)
      }
    }));
  } catch (err: any) {
    console.warn(`[VimeoImporter] Error importando "${query}":`, err.message);
    return [];
  }
}
