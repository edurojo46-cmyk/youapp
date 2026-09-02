/**
 * searchClusterMemory.ts — Memoria Persistente de Clústeres de Búsqueda para Discovery AI V2
 */

import type { DiscoveryRequest } from '../types';
import type { SearchCluster } from './typesV2';

class SearchClusterMemoryStore {
  private clusters: Map<string, SearchCluster> = new Map();

  extractClusterKey(request: DiscoveryRequest): { clusterId: string; topic: string; entity: string } {
    const norm = request.query.toLowerCase().trim();
    const entity = (request.entities?.[0] || norm.split(' ')[0] || 'general').toLowerCase();
    
    // Identificar era / subtema
    let subtheme = 'general';
    if (/197\d|198\d|199\d|200\d|201\d|historico|archivo|badia|atc/i.test(norm)) {
      subtheme = 'archivo_historico';
    } else if (/vivo|recital|concierto|acustico|festival/i.test(norm)) {
      subtheme = 'conciertos_vivo';
    } else if (/entrevista|charla|debate|declaracion|documental/i.test(norm)) {
      subtheme = 'entrevistas_documentales';
    }

    const clusterId = `cluster_${entity}_${subtheme}`;
    const topic = `${entity.toUpperCase()} — ${subtheme.replace('_', ' ').toUpperCase()}`;

    return { clusterId, topic, entity };
  }

  registerQueryInCluster(request: DiscoveryRequest): SearchCluster {
    const { clusterId, topic, entity } = this.extractClusterKey(request);
    const now = Date.now();

    const existing = this.clusters.get(clusterId);
    if (existing) {
      if (!existing.relatedQueries.includes(request.query)) {
        existing.relatedQueries.push(request.query);
      }
      existing.accumulatedGaps++;
      existing.lastSeenAt = now;
      return existing;
    }

    const newCluster: SearchCluster = {
      clusterId,
      clusterTopic: topic,
      primaryEntity: entity,
      relatedQueries: [request.query],
      accumulatedGaps: 1,
      firstSeenAt: now,
      lastSeenAt: now
    };

    this.clusters.set(clusterId, newCluster);
    return newCluster;
  }

  getCluster(clusterId: string): SearchCluster | undefined {
    return this.clusters.get(clusterId);
  }

  getAllClusters(): SearchCluster[] {
    return Array.from(this.clusters.values()).sort((a, b) => b.accumulatedGaps - a.accumulatedGaps);
  }

  assignMissionToCluster(clusterId: string, missionId: string) {
    const cluster = this.clusters.get(clusterId);
    if (cluster) {
      cluster.missionAssigned = missionId;
    }
  }

  getClusterFanoutAverage(): number {
    const all = Array.from(this.clusters.values());
    if (all.length === 0) return 5.0;
    const totalQueries = all.reduce((acc, c) => acc + c.relatedQueries.length, 0);
    return +(totalQueries / all.length).toFixed(2);
  }
}

export const searchClusterMemory = new SearchClusterMemoryStore();
