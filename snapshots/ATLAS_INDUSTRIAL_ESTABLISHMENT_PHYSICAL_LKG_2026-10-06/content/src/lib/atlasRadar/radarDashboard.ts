/**
 * src/lib/atlasRadar/radarDashboard.ts
 * 
 * RADAR CONTROL DASHBOARD
 * Emits continuous real-time telemetry into reports/atlas/realtime/million_radar_dashboard.json.
 */

import fs from 'fs';
import path from 'path';
import { MillionFuelReserveSummary, RadarSourceCandidate, SourceState } from './millionRadarTypes';
import { TargetControllerTelemetry } from './atlasTargetController';

export interface RadarDashboardMetrics {
  timestamp: string;
  TARGET: number;
  KNOWN_GLOBAL_HUMANS: number;
  CURRENT_TRUE_NET_NEW: number;
  REMAINING_TO_TARGET: number;

  VERIFIED_FUEL_RESERVE: number;
  HIGH_CONFIDENCE_FUEL_RESERVE: number;

  CURRENT_NET_NEW_SEC: number;
  REQUIRED_NET_NEW_SEC: number;

  PROJECTED_TIME_TO_TARGET_SEC: number;

  RADAR_CANDIDATES: number;
  PROBING_SOURCES: number;
  HOT_SOURCES: number;
  WARM_SOURCES: number;
  DEPLETING_SOURCES: number;
  EXHAUSTED_SOURCES: number;

  ACTIVE_WORKERS: number;
  ACTIVE_HOSTS: number;

  SOURCE_PROMOTIONS: number;
  SOURCE_DEMOTIONS: number;

  MILLION_REACHABLE: boolean;
  SYSTEM_STATUS: string;
}

const DASHBOARD_OUTPUT_PATH = path.resolve('reports/atlas/realtime/million_radar_dashboard.json');

export class RadarDashboard {
  private promotions: number = 0;
  private demotions: number = 0;

  recordPromotion() { this.promotions++; }
  recordDemotion() { this.demotions++; }

  publish(
    knownGlobalHumans: number,
    targetTelem: TargetControllerTelemetry,
    reserveSummary: MillionFuelReserveSummary,
    candidates: RadarSourceCandidate[],
    activeWorkersCount: number,
    activeHostsCount: number
  ): RadarDashboardMetrics {
    const countsByState: Record<SourceState, number> = {
      RADAR_CANDIDATE: 0,
      PROBING: 0,
      HOT: 0,
      WARM: 0,
      COLD: 0,
      DEPLETING: 0,
      EXHAUSTED: 0,
      RATE_LIMITED: 0,
      BROKEN: 0,
      BLOCKED: 0
    };

    for (const c of candidates) {
      if (countsByState[c.SOURCE_STATE] !== undefined) {
        countsByState[c.SOURCE_STATE]++;
      }
    }

    const metrics: RadarDashboardMetrics = {
      timestamp: new Date().toISOString(),
      TARGET: targetTelem.target,
      KNOWN_GLOBAL_HUMANS: knownGlobalHumans,
      CURRENT_TRUE_NET_NEW: targetTelem.currentNetNew,
      REMAINING_TO_TARGET: targetTelem.remainingToTarget,

      VERIFIED_FUEL_RESERVE: reserveSummary.TOTAL_VERIFIED_RESERVE,
      HIGH_CONFIDENCE_FUEL_RESERVE: reserveSummary.TOTAL_HIGH_CONFIDENCE_RESERVE,

      CURRENT_NET_NEW_SEC: targetTelem.currentNetNewSec,
      REQUIRED_NET_NEW_SEC: targetTelem.requiredNetNewSec,

      PROJECTED_TIME_TO_TARGET_SEC: targetTelem.projectedTimeToTargetSec,

      RADAR_CANDIDATES: countsByState.RADAR_CANDIDATE,
      PROBING_SOURCES: countsByState.PROBING,
      HOT_SOURCES: countsByState.HOT,
      WARM_SOURCES: countsByState.WARM,
      DEPLETING_SOURCES: countsByState.DEPLETING,
      EXHAUSTED_SOURCES: countsByState.EXHAUSTED,

      ACTIVE_WORKERS: activeWorkersCount,
      ACTIVE_HOSTS: activeHostsCount,

      SOURCE_PROMOTIONS: this.promotions,
      SOURCE_DEMOTIONS: this.demotions,

      MILLION_REACHABLE: reserveSummary.MILLION_REACHABLE,
      SYSTEM_STATUS: targetTelem.status
    };

    try {
      const dir = path.dirname(DASHBOARD_OUTPUT_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(DASHBOARD_OUTPUT_PATH, JSON.stringify(metrics, null, 2), 'utf8');
    } catch (e) {
      console.error('[DASHBOARD ERROR] Failed to write telemetry dashboard:', e);
    }

    return metrics;
  }
}
