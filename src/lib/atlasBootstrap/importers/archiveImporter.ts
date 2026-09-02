/**
 * archiveImporter.ts — Importador Internet Archive para Atlas Bootstrap
 */

import type { RawDiscoveredItem } from '../bootstrapTypes';

function parseRuntime(runtime: string): number {
  if (!runtime) return 0;
  const match = runtime.match(/(\d+):(\d+):(\d+)/) || runtime.match(/(\d+):(\d+)/);
  if (!match) return 0;
  if (match.length === 4) return +match[1] * 3600 + +match[2] * 60 + +match[3];
  return +match[1] * 60 + +match[2];
}

export async function importFromArchive(
  query: string,
  topicCluster: string,
  runId: string,
  limit = 25,
  page = 1
): Promise<RawDiscoveredItem[]> {
  try {
    const params = new URLSearchParams({
      q: `(${query}) AND mediatype:movies`,
      fl: 'identifier,title,description,creator,date,runtime,downloads,language',
      sort: 'downloads desc',
      rows: String(Math.min(limit, 50)),
      page: String(page),
      output: 'json'
    });

    const res = await fetch(`https://archive.org/advancedsearch.php?${params.toString()}`, {
      signal: AbortSignal.timeout(10000)
    });

    if (!res.ok) return [];
    const data = await res.json();
    const docs = data.response?.docs || [];

    return docs.map((doc: any): RawDiscoveredItem => {
      const id = doc.identifier;
      const publishedAt = doc.date ? new Date(doc.date).toISOString() : null;

      return {
        provider: 'archive',
        providerContentId: id,
        title: doc.title || id,
        description: doc.description || '',
        creatorName: doc.creator || 'Internet Archive',
        canonicalUrl: `https://archive.org/details/${id}`,
        embedUrl: `https://archive.org/embed/${id}`,
        thumbnailUrl: `https://archive.org/services/img/${id}`,
        durationSeconds: parseRuntime(doc.runtime || '0'),
        publishedAt,
        language: doc.language?.[0] || 'es',
        topicCluster,
        embeddable: true,
        provenance: {
          bootstrapRun: runId,
          discoveryOrigin: 'archive_org',
          sourceSeed: query,
          discoveredAt: new Date().toISOString(),
          canonicalId: id
        }
      };
    });
  } catch (err: any) {
    console.warn(`[ArchiveImporter] Error importando "${query}":`, err.message);
    return [];
  }
}
