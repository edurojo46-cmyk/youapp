/**
 * src/lib/atlasRadar/atlasDepletionPredictor.ts
 * 
 * ATLAS DEPLETION PREDICTOR
 * Continuously models source consumption trajectories, collision trends, and exhaustion slopes.
 * Triggers autonomous replacement pre-warming BEFORE active fuel drops to zero.
 */

import type { DepletionMetrics, RadarSourceCandidate } from './millionRadarTypes.ts';

export class AtlasDepletionPredictor {
  private history: Map<string, { timestamp: number; netNew: number; candidates: number }[]>;

  constructor() {
    this.history = new Map();
  }

  recordObservation(sourceId: string, netNewHarvested: number, candidatesHarvested: number) {
    let list = this.history.get(sourceId);
    if (!list) {
      list = [];
      this.history.set(sourceId, list);
    }
    const now = Date.now();
    list.push({ timestamp: now, netNew: netNewHarvested, candidates: candidatesHarvested });

    // Keep trailing 10 minutes of samples
    const tenMinAgo = now - 600000;
    this.history.set(sourceId, list.filter(item => item.timestamp >= tenMinAgo));
  }

  calculateMetrics(candidate: RadarSourceCandidate): DepletionMetrics {
    const list = this.history.get(candidate.SOURCE_ID) || [];
    const now = Date.now();

    // 60-second window
    const oneMinAgo = now - 60000;
    const items60 = list.filter(i => i.timestamp >= oneMinAgo);
    const netNew60 = items60.reduce((sum, i) => sum + i.netNew, 0);
    const rolling60sNetNewSec = items60.length > 0 ? parseFloat((netNew60 / 60.0).toFixed(2)) : 0;

    // 300-second window
    const fiveMinAgo = now - 300000;
    const items300 = list.filter(i => i.timestamp >= fiveMinAgo);
    const netNew300 = items300.reduce((sum, i) => sum + i.netNew, 0);
    const rolling300sNetNewSec = items300.length > 0 ? parseFloat((netNew300 / 300.0).toFixed(2)) : 0;

    const currentNetNewSec = candidate.TRUE_NET_NEW_PER_REMOTE_SECOND || rolling60sNetNewSec || 0;

    // Remaining calculations
    const remainingNetNew = Math.max(0, candidate.ESTIMATED_TRUE_NET_NEW_REMAINING);
    const remainingRecords = Math.max(0, candidate.RAW_RECORDS_ESTIMATE);

    // Seconds to exhaustion
    const effectiveDrainRate = currentNetNewSec > 0 ? currentNetNewSec : 1.0;
    const secondsToExhaustion = remainingNetNew > 0
      ? Math.floor(remainingNetNew / effectiveDrainRate)
      : 0;

    // Trend slope (difference between 60s rate and 300s rate)
    const collisionRatioTrend = rolling300sNetNewSec > 0
      ? parseFloat(((rolling300sNetNewSec - rolling60sNetNewSec) / rolling300sNetNewSec).toFixed(3))
      : 0;

    return {
      sourceId: candidate.SOURCE_ID,
      currentNetNewSec,
      rolling60sNetNewSec,
      rolling300sNetNewSec,
      netNewPerPage: candidate.TRUE_NET_NEW_PER_REQUEST || 25,
      collisionRatioTrend,
      estimatedRemainingRecords: remainingRecords,
      estimatedRemainingNetNew: remainingNetNew,
      secondsToExhaustion
    };
  }

  shouldPrewarmReplacement(metrics: DepletionMetrics, leadTimeSec: number = 120): boolean {
    return (
      metrics.estimatedRemainingNetNew <= 0 ||
      (metrics.secondsToExhaustion > 0 && metrics.secondsToExhaustion <= leadTimeSec) ||
      (metrics.currentNetNewSec < 10 && metrics.estimatedRemainingNetNew < 5000)
    );
  }
}
