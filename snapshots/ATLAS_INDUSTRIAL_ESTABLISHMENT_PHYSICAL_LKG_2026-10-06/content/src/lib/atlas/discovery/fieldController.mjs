/**
 * src/lib/atlas/discovery/fieldController.mjs
 * 
 * Atlas Induction Discovery Engine — Tesla Adaptive Field Controller (Shadow Core)
 * 
 * Guiding Principles:
 * - EFFICIENCY + CORRECTNESS + REUSABILITY > EXECUTION SPEED
 * - 100% Generic Rule-Based & Score-Based Policy (NO ML/RL/LLM, NO hardcoded motor rules)
 * - Strict Invariant Enforcement:
 *     SUM(allocations) <= FIELD_STRENGTH
 *     SUM(provider demand) <= PROVIDER_SAFE_BUDGET
 * - Deterministic Shadow Clock (simulation_time)
 * - Complete Decision Explainability (Normalized Reason Codes)
 */

import crypto from 'crypto';

export const FIELD_CONTROL_POLICY_VERSION = '1.0.0';

export const ACTIONS = Object.freeze({
  START: 'START',
  ACCELERATE: 'ACCELERATE',
  MAINTAIN: 'MAINTAIN',
  THROTTLE: 'THROTTLE',
  SLEEP: 'SLEEP',
  ROTATE: 'ROTATE'
});

export const REASON_CODES = Object.freeze({
  HIGH_FIELD_VALUE: 'HIGH_FIELD_VALUE',
  LOW_DEPTH: 'LOW_DEPTH',
  DEPTH_EXHAUSTED: 'DEPTH_EXHAUSTED',
  HIGH_OVERLAP: 'HIGH_OVERLAP',
  PROVIDER_429: 'PROVIDER_429',
  PROVIDER_5XX: 'PROVIDER_5XX',
  COOLDOWN_ACTIVE: 'COOLDOWN_ACTIVE',
  DWELL_TIME_LOCKED: 'DWELL_TIME_LOCKED',
  LOW_EVIDENCE: 'LOW_EVIDENCE',
  CHECKPOINT_UNHEALTHY: 'CHECKPOINT_UNHEALTHY',
  ROTATION_OPPORTUNITY: 'ROTATION_OPPORTUNITY',
  BETTER_RESERVE_MOTOR: 'BETTER_RESERVE_MOTOR',
  FIELD_CAPACITY_AVAILABLE: 'FIELD_CAPACITY_AVAILABLE',
  PROVIDER_CAPACITY_AVAILABLE: 'PROVIDER_CAPACITY_AVAILABLE',
  PROVIDER_BUDGET_SATURATED: 'PROVIDER_BUDGET_SATURATED',
  NOT_CERTIFIED: 'NOT_CERTIFIED',
  EXHAUSTED_PARTITION: 'EXHAUSTED_PARTITION'
});

export const DEPTH_CONFIDENCE = Object.freeze({
  VERIFIED: 'VERIFIED',
  CANARY_SUPPORTED: 'CANARY_SUPPORTED',
  ESTIMATED: 'ESTIMATED',
  UNKNOWN: 'UNKNOWN'
});

export const DEPTH_CONFIDENCE_FACTORS = Object.freeze({
  [DEPTH_CONFIDENCE.VERIFIED]: 1.0,
  [DEPTH_CONFIDENCE.CANARY_SUPPORTED]: 0.75,
  [DEPTH_CONFIDENCE.ESTIMATED]: 0.35,
  [DEPTH_CONFIDENCE.UNKNOWN]: 0.05
});

// ============================================================
// CANONICAL FROZEN CONTROL POLICY SPECIFICATION v1.0.0
// ============================================================
export const FIELD_CONTROL_POLICY_SPEC = Object.freeze({
  version: FIELD_CONTROL_POLICY_VERSION,
  weights: {
    motor_quality: 0.25,
    effective_depth: 0.20,
    depth_confidence: 0.15,
    low_overlap: 0.15,
    identity_strength: 0.15,
    supply_efficiency: 0.10
  },
  thresholds: {
    min_allocation_score: 45.0,
    hysteresis_delta_score: 8.0,
    high_overlap_threshold: 0.35,
    exhaustion_remaining_depth: 10,
    low_depth_warning: 500
  },
  timing: {
    minimum_dwell_time_seconds: 30,
    cooldown_period_seconds: 15,
    backoff_window_seconds: 20
  },
  penalties: {
    recent_429_penalty: 35.0,
    recent_5xx_penalty: 25.0,
    high_overlap_penalty: 20.0,
    unhealthy_checkpoint_penalty: 30.0,
    unapproved_policy_penalty: 60.0
  },
  tie_breaking_order: [
    'depth_confidence_desc',
    'expected_unique_gain_desc',
    'overlap_rate_asc',
    'motor_id_lexical_asc'
  ]
});

// Deterministic canonical serialization for SHA256
export function computePolicySha256(policy) {
  const canonicalString = JSON.stringify(policy, Object.keys(policy).sort());
  return crypto.createHash('sha256').update(canonicalString).digest('hex');
}

export const FIELD_CONTROL_POLICY_SHA256 = computePolicySha256(FIELD_CONTROL_POLICY_SPEC);

/**
 * Computes generic FIELD_VALUE_SCORE (0 - 100)
 * Completely agnostic to motor identity.
 */
export function calculateFieldValueScore(motor, policy = FIELD_CONTROL_POLICY_SPEC) {
  const w = policy.weights;
  const pen = policy.penalties;

  // 1. Motor Quality Base Score (0-100)
  const quality = Number(motor.motor_quality_score || 50);

  // 2. Confidence-Weighted Effective Depth Value
  const rawRemaining = Number(motor.remaining_verified_depth || motor.canary_supported_remaining_depth_estimate || motor.remaining_estimated_depth || 0);
  const confFactor = DEPTH_CONFIDENCE_FACTORS[motor.depth_confidence] || DEPTH_CONFIDENCE_FACTORS.ESTIMATED;
  const effectiveRemaining = rawRemaining * confFactor;
  // Normalized to 50k effective depth = 100 pts
  const depthScore = Math.min(100, (effectiveRemaining / 50000) * 100);

  // 3. Depth Confidence Score
  const confidenceScore = confFactor * 100;

  // 4. Low Overlap Score: (1 - overlap) * 100
  const overlap = Math.max(0, Math.min(1, Number(motor.overlap_rate || motor.overlap_observed || motor.overlap_assumed || 0.10)));
  const lowOverlapScore = (1 - overlap) * 100;

  // 5. Identity Strength Score (0-100)
  const identityScore = Number(motor.identity_strength || motor.persistent_id_percent || 70);

  // 6. Supply Efficiency Score (normalized to 40 cand/s = 100 pts)
  const supplyRate = Number(motor.fresh_supply_rate || motor.raw_supply_rate || 20);
  const supplyScore = Math.min(100, (supplyRate / 40) * 100);

  // Composite Weighted Score
  let score = (
    w.motor_quality * quality +
    w.effective_depth * depthScore +
    w.depth_confidence * confidenceScore +
    w.low_overlap * lowOverlapScore +
    w.identity_strength * identityScore +
    w.supply_efficiency * supplyScore
  );

  // Penalties
  if (motor.recent_429_count > 0 || motor.backoff_active) {
    score -= pen.recent_429_penalty;
  }
  if (motor.recent_5xx_count > 0) {
    score -= pen.recent_5xx_penalty;
  }
  if (overlap > policy.thresholds.high_overlap_threshold) {
    score -= pen.high_overlap_penalty;
  }
  if (motor.checkpoint_health === false) {
    score -= pen.unhealthy_checkpoint_penalty;
  }
  if (motor.policy_status !== 'APPROVED') {
    score -= pen.unapproved_policy_penalty;
  }

  return Math.round(Math.max(0, Math.min(100, score)) * 100) / 100;
}

/**
 * Deterministic tie-breaking sort comparator
 */
export function deterministicMotorSort(a, b, policy = FIELD_CONTROL_POLICY_SPEC) {
  // 1. FIELD_VALUE_SCORE descending
  if (b.field_value_score !== a.field_value_score) {
    return b.field_value_score - a.field_value_score;
  }
  // 2. Depth confidence factor descending
  const aConf = DEPTH_CONFIDENCE_FACTORS[a.depth_confidence] || 0;
  const bConf = DEPTH_CONFIDENCE_FACTORS[b.depth_confidence] || 0;
  if (bConf !== aConf) return bConf - aConf;

  // 3. Expected unique gain descending
  const aGain = Number(a.canary_supported_unique_depth || a.remaining_verified_depth || 0);
  const bGain = Number(b.canary_supported_unique_depth || b.remaining_verified_depth || 0);
  if (bGain !== aGain) return bGain - aGain;

  // 4. Overlap rate ascending (lower is better)
  const aOverlap = Number(a.overlap_rate || a.overlap_observed || 0.1);
  const bOverlap = Number(b.overlap_rate || b.overlap_observed || 0.1);
  if (aOverlap !== bOverlap) return aOverlap - bOverlap;

  // 5. Lexicographical motor_id ascending (strictly stable)
  return String(a.motor_id).localeCompare(String(b.motor_id));
}

/**
 * Field Controller Optimization Engine (Shadow Mode)
 * Allocates FIELD_STRENGTH across eligible motors respecting provider scopes.
 */
export function optimizeFieldAllocation({
  motors,
  providerConfigs,
  fieldStrength = 20,
  simulationTime = 0,
  controllerState = {},
  policy = FIELD_CONTROL_POLICY_SPEC
}) {
  const decisions = [];
  const activeSet = [];
  const reserveSet = [];
  const reserveNotEligible = [];

  // Track provider budget utilization
  const providerUsage = {};
  for (const [scope, cfg] of Object.entries(providerConfigs)) {
    providerUsage[scope] = {
      max_rate_budget: cfg.max_rate_budget,
      max_concurrency: cfg.max_concurrency,
      worker_slots_allocated: 0,
      demand_rate_allocated: 0,
      backoff_until: cfg.backoff_until || 0
    };
  }

  let totalSlotsAllocated = 0;

  // Step 1: Pre-filter and score motors
  const scoredMotors = motors.map(m => {
    const isEligible = (m.certification_status === 'PASSED') && 
                       ['CERTIFIED', 'ACTIVE', 'THROTTLED', 'SLEEPING'].includes(m.state);
    const score = isEligible ? calculateFieldValueScore(m, policy) : 0;
    return {
      ...m,
      is_eligible: isEligible,
      field_value_score: score
    };
  });

  // Step 2: Deterministic sort
  scoredMotors.sort((a, b) => deterministicMotorSort(a, b, policy));

  // Step 3: Allocation under constraints
  for (const motor of scoredMotors) {
    const motorId = motor.motor_id;
    const scope = motor.provider_rate_limit_scope;
    const provider = providerUsage[scope] || {
      max_rate_budget: 1.0,
      max_concurrency: 1,
      worker_slots_allocated: 0,
      demand_rate_allocated: 0,
      backoff_until: 0
    };

    const previousAllocation = Number(motor.worker_allocation || 0);
    const lastAction = controllerState[motorId]?.last_action || ACTIONS.MAINTAIN;
    const lastActionAt = controllerState[motorId]?.last_action_at || 0;
    const dwellElapsed = simulationTime - lastActionAt;
    const isDwellLocked = (dwellElapsed < policy.timing.minimum_dwell_time_seconds) && (previousAllocation > 0);

    const reasons = [];
    let proposedAction = ACTIONS.MAINTAIN;
    let proposedState = motor.state;
    let proposedAllocation = 0;

    // A. Eligibility Check
    if (!motor.is_eligible) {
      reasons.push(REASON_CODES.NOT_CERTIFIED);
      proposedAction = ACTIONS.SLEEP;
      proposedState = motor.state;
      proposedAllocation = 0;
      reserveNotEligible.push(motorId);
    }
    // B. Exhaustion Check
    const effectiveRemainingDepth = (motor.depth_confidence === DEPTH_CONFIDENCE.VERIFIED)
      ? Number(motor.remaining_verified_depth ?? 0)
      : (motor.depth_confidence === DEPTH_CONFIDENCE.CANARY_SUPPORTED)
        ? Number(motor.canary_supported_remaining_depth_estimate ?? 0)
        : Number(motor.remaining_estimated_depth ?? 0);

    if (effectiveRemainingDepth <= policy.thresholds.exhaustion_remaining_depth) {
      reasons.push(REASON_CODES.DEPTH_EXHAUSTED);
      proposedAction = ACTIONS.ROTATE;
      proposedState = 'EXHAUSTED';
      proposedAllocation = 0;
      reserveSet.push(motorId);
    }
    // C. Provider Backoff Check
    else if (provider.backoff_until > simulationTime || motor.recent_429_count > 0 || motor.backoff_active) {
      reasons.push(REASON_CODES.PROVIDER_429);
      proposedAction = ACTIONS.THROTTLE;
      proposedState = 'THROTTLED';
      proposedAllocation = 0;
      reserveSet.push(motorId);
    }
    // D. Dwell Time Lock Check (Anti-Flapping)
    else if (isDwellLocked) {
      reasons.push(REASON_CODES.DWELL_TIME_LOCKED);
      proposedAction = ACTIONS.MAINTAIN;
      proposedState = 'ACTIVE';
      proposedAllocation = previousAllocation;

      // Pack into budgets
      const requestCost = Number(motor.motor_request_cost || 1.0);
      provider.worker_slots_allocated += proposedAllocation;
      provider.demand_rate_allocated += (proposedAllocation * requestCost);
      totalSlotsAllocated += proposedAllocation;
      activeSet.push(motorId);
    }
    // E. Evaluation of Capacity & Allocation
    else {
      const remainingGlobalSlots = fieldStrength - totalSlotsAllocated;
      const remainingProviderConcurrency = provider.max_concurrency - provider.worker_slots_allocated;
      const requestCost = Number(motor.motor_request_cost || 1.0);
      const remainingProviderRate = provider.max_rate_budget - provider.demand_rate_allocated;

      // Calculate max slots this motor could take
      const maxSlotsForProviderRate = Math.floor(remainingProviderRate / requestCost);
      const targetSlots = Math.min(
        remainingGlobalSlots,
        remainingProviderConcurrency,
        maxSlotsForProviderRate,
        Number(motor.max_desired_slots || 4)
      );

      if (targetSlots > 0 && motor.field_value_score >= policy.thresholds.min_allocation_score) {
        proposedAllocation = targetSlots;
        proposedAction = previousAllocation === 0 ? ACTIONS.START : (targetSlots > previousAllocation ? ACTIONS.ACCELERATE : ACTIONS.MAINTAIN);
        proposedState = 'ACTIVE';

        provider.worker_slots_allocated += proposedAllocation;
        provider.demand_rate_allocated += (proposedAllocation * requestCost);
        totalSlotsAllocated += proposedAllocation;
        reasons.push(REASON_CODES.HIGH_FIELD_VALUE, REASON_CODES.FIELD_CAPACITY_AVAILABLE, REASON_CODES.PROVIDER_CAPACITY_AVAILABLE);
        activeSet.push(motorId);
      } else {
        proposedAllocation = 0;
        proposedAction = previousAllocation > 0 ? ACTIONS.ROTATE : ACTIONS.SLEEP;
        proposedState = 'SLEEPING';
        if (targetSlots <= 0) reasons.push(REASON_CODES.PROVIDER_BUDGET_SATURATED);
        if (motor.field_value_score < policy.thresholds.min_allocation_score) reasons.push(REASON_CODES.BETTER_RESERVE_MOTOR);
        reserveSet.push(motorId);
      }
    }

    // Step 4: Record Transparent Decision Log
    decisions.push({
      decision_id: `DEC_${simulationTime}_${motorId}`,
      simulation_time: simulationTime,
      motor_id: motorId,
      provider_scope: scope,
      current_state: motor.state,
      proposed_state: proposedState,
      current_allocation: previousAllocation,
      proposed_allocation: proposedAllocation,
      proposed_action: proposedAction,
      field_value_score: motor.field_value_score,
      reason_codes: reasons,
      constraints_applied: {
        is_dwell_locked: isDwellLocked,
        provider_rate_limit_exceeded: provider.demand_rate_allocated > provider.max_rate_budget,
        global_capacity_reached: totalSlotsAllocated >= fieldStrength
      },
      provider_budget_snapshot: {
        scope,
        max_rate_budget: provider.max_rate_budget,
        demand_rate_allocated: provider.demand_rate_allocated,
        max_concurrency: provider.max_concurrency,
        worker_slots_allocated: provider.worker_slots_allocated
      },
      field_strength_snapshot: {
        field_strength: fieldStrength,
        total_slots_allocated: totalSlotsAllocated
      },
      input_metrics_snapshot: {
        motor_quality_score: motor.motor_quality_score,
        depth_confidence: motor.depth_confidence,
        remaining_depth: effectiveRemainingDepth,
        overlap_rate: motor.overlap_rate || motor.overlap_observed,
        recent_429_count: motor.recent_429_count || 0
      },
      policy_version: policy.version,
      policy_sha256: FIELD_CONTROL_POLICY_SHA256
    });
  }

  // Double Invariant Verification
  const globalBudgetViolation = totalSlotsAllocated > fieldStrength;
  const providerViolations = Object.entries(providerUsage).filter(
    ([_, u]) => (u.demand_rate_allocated > u.max_rate_budget) || (u.worker_slots_allocated > u.max_concurrency)
  );

  return {
    simulation_time: simulationTime,
    field_strength: fieldStrength,
    total_slots_allocated: totalSlotsAllocated,
    unallocated_field_strength: fieldStrength - totalSlotsAllocated,
    unallocated_reason: totalSlotsAllocated < fieldStrength 
      ? 'PROVIDER_RATE_BUDGET_CONSTRAINED_OR_NO_ELIGIBLE_RESERVE' 
      : 'NONE',
    active_set: activeSet,
    reserve_set: reserveSet,
    reserve_not_eligible: reserveNotEligible,
    provider_usage: providerUsage,
    invariants: {
      global_field_budget_pass: !globalBudgetViolation,
      provider_budgets_pass: providerViolations.length === 0,
      provider_budget_violations_count: providerViolations.length
    },
    decisions
  };
}

/**
 * Static Code Audit: Asserts that fieldController.mjs contains ZERO hardcoded motor IDs or specific if conditions
 */
export function auditNoHardcodedMotorRules(fileContent) {
  // Strip comments and audit function itself
  const codeOnly = fileContent.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
  
  const forbiddenSubstrings = [
    'OA_' + 'MOTOR_UBA',
    'OA_' + 'MOTOR_CONICET',
    'OAI_' + 'MOTOR_SEDICI',
    'WD_' + 'MOTOR_SCIENCE',
    'motor_' + 'id ===',
    'source_' + 'id ==='
  ];

  const violations = [];
  // Exclude the audit function definition itself from inspection
  const logicCode = codeOnly.split('auditNoHardcodedMotorRules')[0];
  for (const str of forbiddenSubstrings) {
    if (logicCode.includes(str)) {
      violations.push(`Forbidden hardcoded rule matched: ${str}`);
    }
  }
  return {
    pass: violations.length === 0,
    violations
  };
}

/**
 * FORMAL FIELD SLIP (Section 8)
 * FIELD_SLIP_PERCENT = 1 - (TRUE_NET_NEW / ELIGIBLE_PERSON_INPUT)
 * High input + low net-new = HIGH FIELD SLIP.
 */
export function computeFieldSlip(eligiblePersonInputSec, trueNetNewSec) {
  const input = Number(eligiblePersonInputSec) || 0;
  const netNew = Number(trueNetNewSec) || 0;
  if (input <= 0) return 0;
  const slip = 1 - (netNew / input);
  return Math.max(0, Math.min(1, Math.round(slip * 1000) / 1000));
}

/**
 * USEFUL TORQUE (Section 9)
 * Primary motor KPI: USEFUL_TORQUE_SEC = TRUE_NET_NEW_QUALIFIED_COMMITTED_SEC.
 */
export function computeUsefulTorque(trueNetNewQualifiedCommittedSec) {
  return Math.max(0, Number(trueNetNewQualifiedCommittedSec) || 0);
}

/**
 * DYNAMIC ROTOR COUNT (Section 12)
 * Scales or throttles rotor count dynamically based on torque and slip.
 */
export function computeDynamicRotorCount({
  usefulTorqueSec = 0,
  fieldSlipPercent = 0,
  currentRotors = 1,
  maxRotors = 4,
  isSaturated = false,
  hasRateLimit = false
}) {
  if (hasRateLimit || isSaturated || fieldSlipPercent >= 0.90) {
    return 1; // Drop to minimum safe rotor
  }
  if (usefulTorqueSec >= 2.0 && fieldSlipPercent < 0.40) {
    return Math.min(maxRotors, currentRotors + 1);
  }
  if (fieldSlipPercent > 0.70) {
    return Math.max(1, currentRotors - 1);
  }
  return currentRotors;
}

/**
 * INTELLIGENT FIELD STRENGTH (Section 10)
 * Calculates composite FIELD_STRENGTH_SCORE for a source universe.
 */
export function computeIntelligentFieldStrength({
  expectedAvailableNetNew = 10000,
  currentTrueNetNewYield = 0.50,
  ssotOverlap = 0.50,
  evidenceQuality = 0.90,
  sourceReliability = 0.95,
  storageAmplification = 1.10,
  shardability = false
}) {
  // 1. Available Net New Scale (normalized to 100k = 1.0)
  const netNewWeight = Math.min(1.0, expectedAvailableNetNew / 100000);
  
  // 2. Yield and Low-Overlap (1 - ssotOverlap)
  const lowOverlap = Math.max(0, 1.0 - ssotOverlap);
  const yieldFactor = Math.max(0, Math.min(1.0, currentTrueNetNewYield));
  
  // 3. Quality & Reliability
  const qualityFactor = (evidenceQuality * 0.5) + (sourceReliability * 0.5);
  
  // 4. Shardability bonus
  const shardBonus = shardability ? 1.15 : 1.0;
  
  // 5. Storage penalty if high amplification (> 1.3)
  const storagePenalty = storageAmplification > 1.3 ? 0.85 : 1.0;

  const score = (
    (netNewWeight * 0.30) +
    (lowOverlap * 0.30) +
    (yieldFactor * 0.20) +
    (qualityFactor * 0.20)
  ) * shardBonus * storagePenalty;

  return Math.round(Math.max(0, Math.min(1.0, score)) * 100) / 100;
}
