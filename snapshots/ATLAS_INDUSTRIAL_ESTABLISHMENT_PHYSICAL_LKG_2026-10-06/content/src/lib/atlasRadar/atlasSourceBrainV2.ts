/**
 * src/lib/atlasRadar/atlasSourceBrainV2.ts
 * 
 * ATLAS SOURCE BRAIN V2
 * Evaluates, scores, and dynamically ranks every candidate and active source
 * based on EXPECTED_TRUE_GLOBAL_NET_NEW_HUMANS_PER_SECOND.
 * 
 * Replaces naive raw throughput ranking with strict net-new yield intelligence.
 */

import type { RadarSourceCandidate, SourceState } from './millionRadarTypes.ts';

export class AtlasSourceBrainV2 {
  /**
   * Calculates the primary ranking score:
   * EXPECTED_TRUE_GLOBAL_NET_NEW_HUMANS_PER_SECOND
   */
  calculateMarginalScore(candidate: RadarSourceCandidate): number {
    if (candidate.SOURCE_STATE === 'EXHAUSTED' || candidate.SOURCE_STATE === 'BLOCKED' || candidate.SOURCE_STATE === 'BROKEN') {
      return 0;
    }

    if (candidate.ESTIMATED_TRUE_NET_NEW_REMAINING <= 0) {
      return 0;
    }

    // 1. Effective yield per request
    const netNewPerReq = candidate.TRUE_NET_NEW_PER_REQUEST || (candidate.PERSON_YIELD_RATIO * candidate.TRUE_NET_NEW_RATIO * 50);

    // 2. Maximum requests per second supported by host without 429
    let safeReqPerSec = 5.0; // default baseline
    if (candidate.PROTOCOL === 'OFFICIAL_REGISTRY' || candidate.PROTOCOL === 'CSV_STREAM') {
      safeReqPerSec = 100.0; // Local memory-mapped stream
    } else if (candidate.PROTOCOL === 'OAI_PMH') {
      safeReqPerSec = 6.0;
    } else if (candidate.PROTOCOL === 'CKAN') {
      safeReqPerSec = 4.0;
    } else if (candidate.PROTOCOL === 'SPARQL') {
      safeReqPerSec = 2.0;
    }

    // Penalize high latency
    const latencyPenalty = Math.max(1.0, candidate.P50_LATENCY / 300.0);

    // Penalize error rates
    const errorFactor = Math.max(0.01, 1.0 - (candidate.RATE_LIMIT_429_RATE * 2.0 + candidate.SERVER_5XX_RATE + candidate.TIMEOUT_RATE));

    // Confidence scaling
    const confidence = candidate.PROBE_CONFIDENCE || 0.5;

    // Remaining fuel dampener (if source has < 5,000 remaining, score smoothly drops to avoid cliff stalling)
    const remainingDampener = candidate.ESTIMATED_TRUE_NET_NEW_REMAINING < 5000
      ? (candidate.ESTIMATED_TRUE_NET_NEW_REMAINING / 5000.0)
      : 1.0;

    const nominalNetNewSec = (netNewPerReq * safeReqPerSec * errorFactor * remainingDampener) / latencyPenalty;
    return parseFloat((nominalNetNewSec * confidence).toFixed(2));
  }

  /**
   * Dynamic Radar Scoring for High-Capacity Entity Universes:
   * 
   * ENTITY_UNIVERSE_SIZE × CONTACT_DENSITY × EXPECTED_NET_NEW_RATE × ACCESSIBILITY × EXTRACTION_SPEED × STRUCTURAL_DEPTH
   * penalized by:
   * GLOBAL_OVERLAP_RATE, SOURCE_SATURATION, LATENCY, ERROR_RATE.
   */
  calculateHighCapacityScore(candidate: RadarSourceCandidate): number {
    if (candidate.SOURCE_STATE === 'EXHAUSTED' || candidate.SOURCE_STATE === 'BLOCKED' || candidate.SOURCE_STATE === 'BROKEN') {
      return 0;
    }

    const isSurface = candidate.ARCHETYPE === 'SURFACE_SOURCE' || 
      (candidate.CANONICAL_URL.endsWith('/contacto') || candidate.CANONICAL_URL.endsWith('/autoridades') || candidate.CANONICAL_URL.endsWith('/'));

    const overlapRate = candidate.GLOBAL_OVERLAP_SAMPLED ?? candidate.KNOWN_COLLISION_RATIO ?? 0.12;

    // SURFACE COLLISION CONTROL:
    // If surface source has high overlap (>80%), aggressively downrank
    if (isSurface && overlapRate > 0.80) {
      candidate.SURFACE_COLLISION_DETECTED = true;
      candidate.ARCHETYPE = 'SURFACE_SOURCE';
      return 0.05; // heavily penalized downranked score
    }

    const entitySize = candidate.ENTITY_UNIVERSE_SIZE ?? candidate.RAW_RECORDS_ESTIMATE ?? 2000;
    const contactDensity = candidate.CONTACT_DENSITY ?? candidate.PERSON_YIELD_RATIO ?? 0.5;
    const netNewRate = candidate.EXPECTED_NET_NEW_RATE ?? Math.max(0.01, 1.0 - overlapRate);
    const accessibility = candidate.ACCESSIBILITY_SCORE ?? (candidate.PUBLIC_ACCESS ? 0.95 : 0.4);
    const extractionSpeed = candidate.EXTRACTION_SPEED_SCORE ?? (
      candidate.PROTOCOL === 'OFFICIAL_REGISTRY' || candidate.PROTOCOL === 'CSV_STREAM' ? 1.0 :
      candidate.PROTOCOL === 'CKAN' || candidate.PROTOCOL === 'OAI_PMH' ? 0.85 : 0.70
    );
    const structuralDepth = candidate.STRUCTURAL_DEPTH ?? (
      candidate.ARCHETYPE === 'HIGH_CAPACITY_ENTITY_UNIVERSE' ? 4 :
      candidate.ARCHETYPE === 'META_SOURCE' ? 5 : 1
    );

    // Penalizers
    const overlapPenalty = 1.0 + (overlapRate * 8.0); // severe suppression for global collision
    const saturationPenalty = 1.0 + (candidate.SOURCE_SATURATION ?? 0.05) * 2.0;
    const latencyPenalty = Math.max(1.0, candidate.P50_LATENCY / 250.0);
    const errorPenalty = 1.0 + ((candidate.RATE_LIMIT_429_RATE * 3.0) + candidate.SERVER_5XX_RATE + candidate.TIMEOUT_RATE);

    // Meta-source multiplier (prioritized because it uncovers downstream source networks)
    const metaMultiplier = candidate.ARCHETYPE === 'META_SOURCE' ? 2.5 : 1.0;

    const numerator = entitySize * contactDensity * netNewRate * accessibility * extractionSpeed * structuralDepth * metaMultiplier;
    const denominator = overlapPenalty * saturationPenalty * latencyPenalty * errorPenalty;

    const rawScore = numerator / (denominator * 50.0);
    const confidence = candidate.PROBE_CONFIDENCE || 0.6;
    return parseFloat((rawScore * confidence).toFixed(2));
  }

  /**
   * Evaluates lifecycle state transitions:
   * RADAR_CANDIDATE -> PROBING -> HOT / WARM / COLD -> DEPLETING -> EXHAUSTED
   */
  evaluateState(candidate: RadarSourceCandidate): SourceState {
    if (candidate.ESTIMATED_TRUE_NET_NEW_REMAINING <= 0) {
      return 'EXHAUSTED';
    }

    if (candidate.RATE_LIMIT_429_RATE > 0.5) {
      return 'RATE_LIMITED';
    }

    if (candidate.SERVER_5XX_RATE > 0.6 || candidate.TIMEOUT_RATE > 0.6) {
      return 'BROKEN';
    }

    if (candidate.SURFACE_COLLISION_DETECTED) {
      return 'COLD';
    }

    if (candidate.SOURCE_STATE === 'RADAR_CANDIDATE' && candidate.SAMPLE_SIZE === 0) {
      return 'RADAR_CANDIDATE';
    }

    if (candidate.SAMPLE_SIZE > 0 && candidate.SAMPLE_SIZE < 100) {
      return 'PROBING';
    }

    const score = candidate.SCORE_NET_NEW_SEC;

    // Depletion condition: remaining fuel < 20,000 OR true net new ratio dropped below 15%
    if (candidate.ESTIMATED_TRUE_NET_NEW_REMAINING < 20000 || candidate.TRUE_NET_NEW_RATIO < 0.15) {
      return 'DEPLETING';
    }

    if (score >= 200) {
      return 'HOT';
    } else if (score >= 30) {
      return 'WARM';
    } else {
      return 'COLD';
    }
  }

  /**
   * Sorts all candidate sources in descending order of expected net-new yield
   */
  rankCandidates(candidates: RadarSourceCandidate[]): RadarSourceCandidate[] {
    for (const c of candidates) {
      if (c.ARCHETYPE === 'HIGH_CAPACITY_ENTITY_UNIVERSE' || c.ARCHETYPE === 'META_SOURCE' || c.ENTITY_UNIVERSE_SIZE) {
        c.SCORE_NET_NEW_SEC = this.calculateHighCapacityScore(c);
      } else {
        c.SCORE_NET_NEW_SEC = this.calculateMarginalScore(c);
      }
      c.SOURCE_STATE = this.evaluateState(c);
    }

    return [...candidates].sort((a, b) => b.SCORE_NET_NEW_SEC - a.SCORE_NET_NEW_SEC);
  }
}
