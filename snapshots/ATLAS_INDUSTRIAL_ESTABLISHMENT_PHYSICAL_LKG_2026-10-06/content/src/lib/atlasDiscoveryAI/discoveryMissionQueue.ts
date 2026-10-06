/**
 * discoveryMissionQueue.ts — Cola Asíncrona de Misiones Discovery (Zero Latency en Fast Path)
 */

import { runDiscoveryMission } from './discoveryBrain';
import { recordTelemetryMission } from './discoveryTelemetry';
import type { DiscoveryRequest, DiscoveryMissionResult } from './types';
import type { HarvestDedupeIndex } from '../atlasHarvester/harvestDedupeIndex';

interface QueuedMission {
  key: string;
  request: DiscoveryRequest;
  priority: number;
  addedAt: number;
}

const missionCache = new Map<string, { timestamp: number; status: 'running' | 'completed' | 'failed'; result?: DiscoveryMissionResult }>();
const queue: QueuedMission[] = [];
let isProcessing = false;
let sharedDedupeIndex: HarvestDedupeIndex | undefined;

let totalEnqueueCalls = 0;
let totalMissionsCreated = 0;
let totalMissionsDeduplicated = 0;

export function getQueueStats() {
  return {
    totalEnqueueCalls,
    totalMissionsCreated,
    totalMissionsDeduplicated,
    activeQueueLength: queue.length,
    cachedKeysCount: missionCache.size
  };
}

export function resetQueueStats() {
  totalEnqueueCalls = 0;
  totalMissionsCreated = 0;
  totalMissionsDeduplicated = 0;
  missionCache.clear();
  queue.length = 0;
}

export function setSharedDedupeIndex(index: HarvestDedupeIndex) {
  sharedDedupeIndex = index;
}

export function createDiscoveryKey(request: DiscoveryRequest): string {
  const normQuery = request.query.toLowerCase().trim();
  const primaryGap = request.gaps[0]?.type || 'UNKNOWN';
  const entity = request.entities?.[0] || '';
  return `${normQuery}::${entity}::${primaryGap}`;
}

export async function enqueueDiscoveryMission(request: DiscoveryRequest): Promise<void> {
  totalEnqueueCalls++;
  const key = createDiscoveryKey(request);
  const now = Date.now();

  // Comprobar si ya existe en caché o en ejecución
  const cached = missionCache.get(key);
  if (cached) {
    if (cached.status === 'running') {
      totalMissionsDeduplicated++;
      return;
    }
    if (cached.status === 'completed' && now - cached.timestamp < 24 * 3600 * 1000) {
      totalMissionsDeduplicated++;
      return; // Cache 24h
    }
    if (cached.status === 'failed' && now - cached.timestamp < 3600 * 1000) {
      totalMissionsDeduplicated++;
      return; // Cooldown 1h
    }
  }

  totalMissionsCreated++;
  missionCache.set(key, { timestamp: now, status: 'running' });

  // Prioridad basada en el score del gap (cuanto peor la cobertura, mayor la prioridad)
  const priority = 1 - request.coverageScore;
  queue.push({
    key,
    request,
    priority,
    addedAt: now
  });

  // Ordenar cola por prioridad descendente
  queue.sort((a, b) => b.priority - a.priority);

  // Disparar procesamiento asíncrono en background
  void processQueue();
}

async function processQueue(): Promise<void> {
  if (isProcessing || queue.length === 0) return;
  isProcessing = true;

  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) break;

    try {
      const result = await runDiscoveryMission(item.request, sharedDedupeIndex);
      if (result) {
        missionCache.set(item.key, { timestamp: Date.now(), status: 'completed', result });
        recordTelemetryMission(result);
      } else {
        missionCache.set(item.key, { timestamp: Date.now(), status: 'failed' });
      }
    } catch {
      missionCache.set(item.key, { timestamp: Date.now(), status: 'failed' });
    }
  }

  isProcessing = false;
}
