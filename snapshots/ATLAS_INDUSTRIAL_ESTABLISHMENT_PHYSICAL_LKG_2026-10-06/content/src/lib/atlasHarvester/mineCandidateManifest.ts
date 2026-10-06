/**
 * mineCandidateManifest.ts — Manifiesto de Candidatos Descubiertos (Explore-and-Bank Architecture)
 *
 * Conserva los YouTube IDs únicos descubiertos durante sampling para permitir su persistencia
 * directa en Atlas durante la fase de Harvest sin necesidad de refetch HTML.
 */

import type { YouTubeHarvestReference } from './types';

export interface CandidateManifestEntry {
  videoId: string;
  canonicalUrl: string;
  title: string;
  publisherId: string;
  publisherName: string;
  articleUrl: string;
  country: string;
  language: string;
  category: string;
  partitionId: string;
  discoveredAt: string;
  atlasSnapshotVersion: number;
}

export class MineCandidateManifest {
  private candidates: Map<string, CandidateManifestEntry> = new Map();

  addCandidate(ref: YouTubeHarvestReference, partitionId: string, atlasSnapshotVersion: number): boolean {
    if (this.candidates.has(ref.videoId)) return false;

    this.candidates.set(ref.videoId, {
      videoId: ref.videoId,
      canonicalUrl: ref.canonicalUrl,
      title: ref.title || `Video [${ref.videoId}]`,
      publisherId: ref.publisherId,
      publisherName: ref.publisherName,
      articleUrl: ref.articleUrl,
      country: ref.country,
      language: ref.language,
      category: ref.category,
      partitionId,
      discoveredAt: ref.discoveredAt || new Date().toISOString(),
      atlasSnapshotVersion
    });

    return true;
  }

  getCandidatesForPartition(partitionId: string): CandidateManifestEntry[] {
    const list: CandidateManifestEntry[] = [];
    for (const c of this.candidates.values()) {
      if (c.partitionId === partitionId) {
        list.push(c);
      }
    }
    return list;
  }

  getAllCandidates(): CandidateManifestEntry[] {
    return Array.from(this.candidates.values());
  }

  getTotalCount(): number {
    return this.candidates.size;
  }

  toHarvestReferences(): YouTubeHarvestReference[] {
    return Array.from(this.candidates.values()).map(c => ({
      videoId: c.videoId,
      canonicalUrl: c.canonicalUrl,
      title: c.title,
      publisherId: c.publisherId,
      publisherName: c.publisherName,
      articleUrl: c.articleUrl,
      country: c.country,
      language: c.language,
      category: c.category,
      harvestTier: 'bronze',
      discoveredAt: c.discoveredAt
    }));
  }

  clear(): void {
    this.candidates.clear();
  }
}

export const globalCandidateManifest = new MineCandidateManifest();
