/**
 * peerTubeImporter.ts — Importador PeerTube (SepiaSearch) para Atlas Bootstrap
 */

import type { RawDiscoveredItem } from '../bootstrapTypes';

export async function importFromPeerTube(
  query: string,
  topicCluster: string,
  runId: string,
  limit = 25
): Promise<RawDiscoveredItem[]> {
  try {
    const params = new URLSearchParams({
      search: query,
      count: String(Math.min(limit, 50)),
      sort: '-match',
      nsfw: 'false'
    });

    const res = await fetch(`https://sepiasearch.org/api/v1/search/videos?${params.toString()}`, {
      signal: AbortSignal.timeout(10000)
    });

    if (!res.ok) return [];
    const data = await res.json();
    const list = data.data || [];

    return list.map((item: any): RawDiscoveredItem => {
      const instance = item.account?.host || 'peertube.tv';
      const uuid = item.uuid;

      return {
        provider: 'peertube',
        providerContentId: uuid,
        title: item.name || 'Sin título',
        description: item.description || '',
        creatorName: item.account?.displayName || item.account?.name || 'PeerTube Creator',
        creatorId: item.account?.name,
        canonicalUrl: `https://${instance}/videos/watch/${uuid}`,
        embedUrl: `https://${instance}/videos/embed/${uuid}`,
        thumbnailUrl: item.thumbnailPath ? `https://${instance}${item.thumbnailPath}` : undefined,
        durationSeconds: item.duration || 0,
        publishedAt: item.publishedAt || item.createdAt,
        language: item.language?.id || 'es',
        topicCluster,
        embeddable: true,
        provenance: {
          bootstrapRun: runId,
          discoveryOrigin: 'peertube_sepia',
          sourceSeed: query,
          discoveredAt: new Date().toISOString(),
          canonicalId: uuid
        }
      };
    });
  } catch (err: any) {
    console.warn(`[PeerTubeImporter] Error importando "${query}":`, err.message);
    return [];
  }
}
