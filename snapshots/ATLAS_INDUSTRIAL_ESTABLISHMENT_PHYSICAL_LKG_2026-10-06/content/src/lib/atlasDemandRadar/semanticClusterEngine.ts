/**
 * Atlas Demand Radar V1 — Semantic Cluster Engine
 * Canonical clustering, synonym resolution & lifecycle tracking
 */

import type { DemandCluster, ClusterStatus } from './types';
import { normalizeQueryString } from './commercialIntentLexicon';

export class SemanticClusterRegistry {
  private clustersBySlug: Map<string, DemandCluster> = new Map();
  private synonymToSlugMap: Map<string, string> = new Map();

  constructor() {
    this.seedCanonicalClusters();
  }

  private slugify(text: string): string {
    return normalizeQueryString(text)
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private seedCanonicalClusters(): void {
    const defaultClusters: Array<{
      title: string;
      category: string;
      synonyms: string[];
    }> = [
      {
        title: 'Aspiradora Robot',
        category: 'Electrodomésticos / Hogar',
        synonyms: ['aspiradora robot', 'robot aspirador', 'robot aspiradora', 'aspiradora automatica', 'aspiradora inteligente']
      },
      {
        title: 'Notebook Gamer',
        category: 'Computación / Laptops',
        synonyms: ['notebook gamer', 'laptop gamer', 'notebook para gaming', 'laptop para juegos', 'computadora portatil gamer']
      },
      {
        title: 'Aire Acondicionado Portátil',
        category: 'Climatización',
        synonyms: ['aire acondicionado portatil', 'aire portatil', 'climatizador portatil', 'aire acondicionado frio calor portatil']
      },
      {
        title: 'Bomba de Agua 1HP',
        category: 'Herramientas / Construcción',
        synonyms: ['bomba de agua 1hp', 'bomba centrifuga 1hp', 'motobomba 1hp', 'electrobomba 1hp']
      },
      {
        title: 'Auriculares Inalámbricos Cancelación de Ruido',
        category: 'Audio',
        synonyms: ['auriculares inalambricos anc', 'auriculares cancelacion de ruido', 'audifonos bluetooth anc', 'auriculares bluetooth']
      }
    ];

    for (const item of defaultClusters) {
      this.registerCluster(item.title, item.category, item.synonyms);
    }
  }

  registerCluster(
    canonicalTitle: string,
    categoryHint: string,
    synonyms: string[] = []
  ): DemandCluster {
    const slug = this.slugify(canonicalTitle);
    const nowIso = new Date().toISOString();

    const normalizedSynonyms = Array.from(
      new Set([
        normalizeQueryString(canonicalTitle),
        ...synonyms.map(s => normalizeQueryString(s))
      ])
    );

    const cluster: DemandCluster = {
      cluster_id: `cluster_${slug}`,
      canonical_title: canonicalTitle,
      slug,
      synonyms: normalizedSynonyms,
      category_hint: categoryHint,
      status: 'EMERGING',
      first_detected_at: nowIso,
      last_seen_at: nowIso
    };

    this.clustersBySlug.set(slug, cluster);

    for (const syn of normalizedSynonyms) {
      this.synonymToSlugMap.set(syn, slug);
    }

    return cluster;
  }

  resolveCluster(queryOrTopic: string): DemandCluster {
    const normalized = normalizeQueryString(queryOrTopic);

    // 1. Direct match on synonyms
    const slug = this.synonymToSlugMap.get(normalized);
    if (slug && this.clustersBySlug.has(slug)) {
      const cluster = this.clustersBySlug.get(slug)!;
      cluster.last_seen_at = new Date().toISOString();
      return cluster;
    }

    // 2. Substring or token overlap match
    for (const [existingSlug, cluster] of this.clustersBySlug.entries()) {
      for (const syn of cluster.synonyms) {
        if (normalized.includes(syn) || syn.includes(normalized)) {
          cluster.last_seen_at = new Date().toISOString();
          this.synonymToSlugMap.set(normalized, existingSlug);
          return cluster;
        }
      }
    }

    // 3. Create auto-emerging cluster if novel
    const autoTitle = queryOrTopic.trim();
    return this.registerCluster(autoTitle, 'General / Auto-Discovered', [normalized]);
  }

  updateClusterStatus(slug: string, status: ClusterStatus): void {
    const cluster = this.clustersBySlug.get(slug);
    if (cluster) {
      cluster.status = status;
      cluster.last_seen_at = new Date().toISOString();
    }
  }

  getClusterBySlug(slug: string): DemandCluster | undefined {
    return this.clustersBySlug.get(slug);
  }
}
