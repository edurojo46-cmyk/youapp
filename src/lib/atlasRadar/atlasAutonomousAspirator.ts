/**
 * src/lib/atlasRadar/atlasAutonomousAspirator.ts
 * 
 * ATLAS AUTONOMOUS ASPIRATOR V1
 * Implements a dynamic shared worker resource pool.
 * Allocates and rebalances workers across sources according to Source Brain marginal scores.
 * Autonomously shifts workers from depleting/exhausted sources to promoted replacements.
 */

import type { AspiratorWorker, RadarSourceCandidate } from './millionRadarTypes.ts';
import { AtlasSourceBrainV2 } from './atlasSourceBrainV2.ts';
import { AtlasDepletionPredictor } from './atlasDepletionPredictor.ts';
import { AtlasDiscoveryFrontier } from './atlasDiscoveryFrontier.ts';

export class AtlasAutonomousAspirator {
  private workers: AspiratorWorker[];
  private brain: AtlasSourceBrainV2;
  private predictor: AtlasDepletionPredictor;
  private frontier: AtlasDiscoveryFrontier;
  private sourceHandoffCount: number = 0;

  constructor(
    poolSize: number = 16,
    brain: AtlasSourceBrainV2,
    predictor: AtlasDepletionPredictor,
    frontier: AtlasDiscoveryFrontier
  ) {
    this.brain = brain;
    this.predictor = predictor;
    this.frontier = frontier;
    this.workers = [];
    for (let i = 0; i < poolSize; i++) {
      this.workers.push({
        id: i + 1,
        assignedSourceId: null,
        state: 'IDLE',
        lastHarvestAt: Date.now(),
        recordsHarvested: 0,
        netNewHarvested: 0,
        errors: 0
      });
    }
  }

  /**
   * Rebalances worker allocations across candidate sources.
   * Higher scoring sources receive proportionally more workers.
   */
  rebalanceWorkers(candidates: RadarSourceCandidate[]): { allocations: Record<string, number>; promoted: string[]; demoted: string[] } {
    const ranked = this.brain.rankCandidates(candidates);
    const eligibleSources = ranked.filter(
      c => (c.SOURCE_STATE === 'HOT' || c.SOURCE_STATE === 'WARM' || c.SOURCE_STATE === 'DEPLETING') &&
           !this.frontier.isSourceExhausted(c.SOURCE_ID) &&
           c.ESTIMATED_TRUE_NET_NEW_REMAINING > 0
    );

    const allocations: Record<string, number> = {};
    const promoted: string[] = [];
    const demoted: string[] = [];

    if (eligibleSources.length === 0) {
      // Idle all workers if no sources available
      for (const w of this.workers) {
        w.assignedSourceId = null;
        w.state = 'IDLE';
      }
      return { allocations, promoted, demoted };
    }

    // Allocate workers proportionally to score
    const totalScore = eligibleSources.reduce((sum, s) => sum + Math.max(1, s.SCORE_NET_NEW_SEC), 0);
    let assignedCount = 0;

    for (let i = 0; i < eligibleSources.length; i++) {
      const src = eligibleSources[i];
      const weight = Math.max(1, src.SCORE_NET_NEW_SEC) / totalScore;
      let quota = Math.max(1, Math.round(weight * this.workers.length));

      // Cap at remaining unassigned
      if (assignedCount + quota > this.workers.length || i === eligibleSources.length - 1) {
        quota = Math.max(0, this.workers.length - assignedCount);
      }

      allocations[src.SOURCE_ID] = quota;
      assignedCount += quota;
    }

    // Apply allocation to worker pool
    let workerIdx = 0;
    for (const [sourceId, count] of Object.entries(allocations)) {
      for (let k = 0; k < count; k++) {
        if (workerIdx < this.workers.length) {
          const w = this.workers[workerIdx];
          if (w.assignedSourceId !== sourceId) {
            if (w.assignedSourceId) demoted.push(w.assignedSourceId);
            promoted.push(sourceId);
            w.assignedSourceId = sourceId;
            w.state = 'BUSY';
            this.sourceHandoffCount++;
          }
          workerIdx++;
        }
      }
    }

    return { allocations, promoted, demoted };
  }

  /**
   * Handles natural exhaustion of a source:
   * Marks frontier as exhausted, immediately reallocates workers elsewhere.
   */
  handleSourceExhaustion(sourceId: string, candidateMap: Map<string, RadarSourceCandidate>): { handoffSuccess: boolean; reassignedTo: string | null } {
    console.log(`[ASPIRATOR AUTONOMOUS] Source ${sourceId} exhausted! Triggering autonomous handoff...`);
    this.frontier.markExhausted(sourceId);

    const cand = candidateMap.get(sourceId);
    if (cand) {
      cand.SOURCE_STATE = 'EXHAUSTED';
      cand.ESTIMATED_TRUE_NET_NEW_REMAINING = 0;
    }

    // Rebalance immediately
    const result = this.rebalanceWorkers(Array.from(candidateMap.values()));
    const firstAssigned = Object.keys(result.allocations)[0] || null;

    return {
      handoffSuccess: firstAssigned !== null && firstAssigned !== sourceId,
      reassignedTo: firstAssigned
    };
  }

  getHandoffCount(): number {
    return this.sourceHandoffCount;
  }

  getWorkers(): AspiratorWorker[] {
    return this.workers;
  }
}
