/**
 * ATLAS MAIL FABRIC V1 — Volume Governor
 *
 * Enforces strict, metric-backed volume escalation tiers across the mail fabric.
 *
 * Core Principles:
 * 1. Volume NEVER increases merely because calendar days have elapsed.
 * 2. Scaling requires consecutive verified GREEN evaluations with statistically sufficient sample sizes.
 * 3. Low volume / new IPs with INSUFFICIENT_SAMPLE remain in WATCH / PILOT_ONLY (capped at 25-50 msgs/day).
 * 4. Stale telemetry (>48h) or provider outage triggers fail-safe freezing.
 * 5. Any active HOLD immediately clamps dispatch capacity to 0.
 */

import {
  VolumeGovernorTierKey,
  VolumeGovernorTierConfig,
  ReputationEvaluationResult
} from './types';

export class AtlasMailVolumeGovernor {
  public static readonly TIERS: Record<VolumeGovernorTierKey, VolumeGovernorTierConfig> = {
    STRICT_HOLD: {
      tierKey: 'STRICT_HOLD',
      maxDailyVolume: 10,
      requiredConsecutiveGreenDays: 0,
      requiresSufficientSample: false,
      description: 'Strict lockdown baseline. Dispatches held for manual authorization or initial canary ping.'
    },
    PILOT_ONLY: {
      tierKey: 'PILOT_ONLY',
      maxDailyVolume: 50,
      requiredConsecutiveGreenDays: 0,
      requiresSufficientSample: false,
      description: 'Conservative legitimate pilot for new IPs / low volume with healthy local auth telemetry.'
    },
    EARLY_RAMP: {
      tierKey: 'EARLY_RAMP',
      maxDailyVolume: 100,
      requiredConsecutiveGreenDays: 3,
      requiresSufficientSample: true,
      description: 'Early ramp with verified Google Postmaster & SNDS green telemetry.'
    },
    CONTROLLED_SCALE: {
      tierKey: 'CONTROLLED_SCALE',
      maxDailyVolume: 250,
      requiredConsecutiveGreenDays: 5,
      requiresSufficientSample: true,
      description: 'Controlled scaling with zero complaints and low bounce rates.'
    },
    EXPANDED_SCALE: {
      tierKey: 'EXPANDED_SCALE',
      maxDailyVolume: 500,
      requiredConsecutiveGreenDays: 7,
      requiresSufficientSample: true,
      description: 'Expanded scaling across authorized transactional and requested outbound streams.'
    },
    PRODUCTION_1K: {
      tierKey: 'PRODUCTION_1K',
      maxDailyVolume: 1000,
      requiredConsecutiveGreenDays: 10,
      requiresSufficientSample: true,
      description: 'Production 1K volume governed by stable High/Medium reputation.'
    },
    PRODUCTION_2_5K: {
      tierKey: 'PRODUCTION_2_5K',
      maxDailyVolume: 2500,
      requiredConsecutiveGreenDays: 14,
      requiresSufficientSample: true,
      description: 'Production 2.5K high volume stream.'
    },
    PRODUCTION_5K_BULK: {
      tierKey: 'PRODUCTION_5K_BULK',
      maxDailyVolume: 5000,
      requiredConsecutiveGreenDays: 21,
      requiresSufficientSample: true,
      description: 'Production 5K bulk tier meeting all Google bulk sender requirements.'
    }
  };

  /**
   * Evaluates volume eligibility and next tier transition for a given evaluation state.
   */
  public static evaluateGovernorState(evaluation: ReputationEvaluationResult): {
    allowedDailyVolume: number;
    currentTier: VolumeGovernorTierKey;
    canAdvanceTier: boolean;
    nextTier?: VolumeGovernorTierKey;
    requiredConsecutiveDaysForNext: number;
    governorReason: string;
  } {
    // 1. Hard Gate: HOLD -> 0 volume
    if (evaluation.overall_status === 'HOLD') {
      return {
        allowedDailyVolume: 0,
        currentTier: 'STRICT_HOLD',
        canAdvanceTier: false,
        requiredConsecutiveDaysForNext: 3,
        governorReason: `GOVERNOR_LOCKED: Hard gate HOLD active (${evaluation.gate_reason})`
      };
    }

    // 2. Stale Telemetry Gate
    if (evaluation.is_stale) {
      return {
        allowedDailyVolume: Math.min(evaluation.current_allowed_volume_per_day, 25),
        currentTier: 'PILOT_ONLY',
        canAdvanceTier: false,
        requiredConsecutiveDaysForNext: 3,
        governorReason: 'GOVERNOR_FROZEN: Telemetry is stale (>48 hours without fresh signals)'
      };
    }

    // 3. Insufficient Sample Gate: new IP / low volume -> WATCH / PILOT_ONLY
    if (!evaluation.has_sufficient_sample) {
      return {
        allowedDailyVolume: 25,
        currentTier: 'PILOT_ONLY',
        canAdvanceTier: false,
        requiredConsecutiveDaysForNext: 3,
        governorReason: 'GOVERNOR_RESTRICTED: Insufficient sample size from external providers; capped at conservative pilot'
      };
    }

    // 4. WATCH state -> Freeze volume at current tier
    if (evaluation.overall_status === 'WATCH') {
      return {
        allowedDailyVolume: evaluation.current_allowed_volume_per_day,
        currentTier: evaluation.current_tier,
        canAdvanceTier: false,
        requiredConsecutiveDaysForNext: 3,
        governorReason: `GOVERNOR_FROZEN: Monitoring state WATCH active (${evaluation.gate_reason})`
      };
    }

    // 5. GREEN state -> Determine tier by consecutive clean green days
    const consecutive = evaluation.consecutive_green_days;
    let targetTier: VolumeGovernorTierKey = 'PILOT_ONLY';
    let nextTier: VolumeGovernorTierKey | undefined = 'EARLY_RAMP';
    let daysForNext = 3;

    if (consecutive >= 21) {
      targetTier = 'PRODUCTION_5K_BULK';
      nextTier = undefined;
      daysForNext = 0;
    } else if (consecutive >= 14) {
      targetTier = 'PRODUCTION_2_5K';
      nextTier = 'PRODUCTION_5K_BULK';
      daysForNext = 21;
    } else if (consecutive >= 10) {
      targetTier = 'PRODUCTION_1K';
      nextTier = 'PRODUCTION_2_5K';
      daysForNext = 14;
    } else if (consecutive >= 7) {
      targetTier = 'EXPANDED_SCALE';
      nextTier = 'PRODUCTION_1K';
      daysForNext = 10;
    } else if (consecutive >= 5) {
      targetTier = 'CONTROLLED_SCALE';
      nextTier = 'EXPANDED_SCALE';
      daysForNext = 7;
    } else if (consecutive >= 3) {
      targetTier = 'EARLY_RAMP';
      nextTier = 'CONTROLLED_SCALE';
      daysForNext = 5;
    } else {
      targetTier = 'PILOT_ONLY';
      nextTier = 'EARLY_RAMP';
      daysForNext = 3;
    }

    const config = this.TIERS[targetTier];
    const canAdvance = Boolean(nextTier && consecutive >= daysForNext);

    return {
      allowedDailyVolume: config.maxDailyVolume,
      currentTier: targetTier,
      canAdvanceTier: canAdvance,
      nextTier,
      requiredConsecutiveDaysForNext: daysForNext,
      governorReason: `GOVERNOR_HEALTHY: GREEN state verified with ${consecutive} consecutive clean days`
    };
  }
}
