/**
 * src/lib/atlasRadar/atlasTargetController.ts
 * 
 * ATLAS DYNAMIC TARGET CONTROLLER
 * Autonomously steers the discovery network toward 1,000,000 Real Globally Net-New Humans.
 * Continuously evaluates velocity, remaining distance, projected fuel deficits,
 * and activates SOURCE_EXPANSION_MODE when reserve thresholds are breached.
 */

import { RadarSourceCandidate } from './millionRadarTypes';
import { AtlasAutonomousAspirator } from './atlasAutonomousAspirator';
import { AtlasSourceBrainV2 } from './atlasSourceBrainV2';

export interface TargetControllerTelemetry {
  target: number;
  currentNetNew: number;
  remainingToTarget: number;
  currentNetNewSec: number;
  requiredNetNewSec: number;
  verifiedFuelRemaining: number;
  projectedTimeToTargetSec: number;
  projectedFuelDeficit: number;
  isExpansionModeActive: boolean;
  status: 'STABLE' | 'DEFICIT_WARNING' | 'CRITICAL_DEPLETION' | 'TARGET_ACHIEVED';
}

export class AtlasTargetController {
  private target: number = 1000000;
  private maxDurationSec: number = 1800;
  private aspirator: AtlasAutonomousAspirator;
  private brain: AtlasSourceBrainV2;
  private expansionModeActive: boolean = false;

  constructor(aspirator: AtlasAutonomousAspirator, brain: AtlasSourceBrainV2) {
    this.aspirator = aspirator;
    this.brain = brain;
  }

  evaluate(
    currentNetNew: number,
    elapsedSeconds: number,
    candidates: RadarSourceCandidate[]
  ): TargetControllerTelemetry {
    const remainingToTarget = Math.max(0, this.target - currentNetNew);
    const timeRemainingSec = Math.max(1, this.maxDurationSec - elapsedSeconds);

    const currentNetNewSec = elapsedSeconds > 0 ? parseFloat((currentNetNew / elapsedSeconds).toFixed(2)) : 0;
    const requiredNetNewSec = parseFloat((remainingToTarget / timeRemainingSec).toFixed(2));

    // Calculate total verified remaining fuel across active/standby sources
    const eligibleSources = candidates.filter(
      c => c.SOURCE_STATE === 'HOT' || c.SOURCE_STATE === 'WARM' || c.SOURCE_STATE === 'DEPLETING'
    );
    const verifiedFuelRemaining = eligibleSources.reduce(
      (sum, s) => sum + Math.max(0, s.ESTIMATED_TRUE_NET_NEW_REMAINING),
      0
    );

    const projectedTimeToTargetSec = currentNetNewSec > 0
      ? Math.round(remainingToTarget / currentNetNewSec)
      : 9999;

    const projectedFuelDeficit = Math.max(0, remainingToTarget - verifiedFuelRemaining);

    // Expansion mode trigger: when verified fuel remaining is less than remaining required + 20% buffer
    if (projectedFuelDeficit > 0 || verifiedFuelRemaining < remainingToTarget * 1.2) {
      this.expansionModeActive = true;
    } else {
      this.expansionModeActive = false;
    }

    let status: TargetControllerTelemetry['status'] = 'STABLE';
    if (remainingToTarget === 0) {
      status = 'TARGET_ACHIEVED';
    } else if (verifiedFuelRemaining < 50000) {
      status = 'CRITICAL_DEPLETION';
    } else if (projectedFuelDeficit > 0) {
      status = 'DEFICIT_WARNING';
    }

    return {
      target: this.target,
      currentNetNew,
      remainingToTarget,
      currentNetNewSec,
      requiredNetNewSec,
      verifiedFuelRemaining,
      projectedTimeToTargetSec,
      projectedFuelDeficit,
      isExpansionModeActive: this.expansionModeActive,
      status
    };
  }

  isExpansionMode(): boolean {
    return this.expansionModeActive;
  }
}
