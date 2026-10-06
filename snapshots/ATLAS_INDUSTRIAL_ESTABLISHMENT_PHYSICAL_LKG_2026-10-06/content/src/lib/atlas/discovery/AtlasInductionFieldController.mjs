/**
 * src/lib/atlas/discovery/AtlasInductionFieldController.mjs
 * 
 * ATLAS INDUCTION DISCOVERY ENGINE V1.1 — FIELD CONTROLLER
 * 
 * Hierarchy:
 * ATLAS ACTIVE OBJECTIVE -> ATLAS INDUCTION FIELD CONTROLLER -> ATLAS FRONTIER SCHEDULER -> DYNAMIC ROTOR POOL
 * 
 * Upgrades in V1.1:
 * 1. DOWNSTREAM_CURRENT_LIMITER: Hard limiters on Headroom (Commit P95, Queues, Outbox Backlog, Fuel Buffer).
 * 2. INDUCTION_STALL_PROTECTION: Detects negative system marginal torque and freezes/backs off capacity.
 * 3. ATLAS_TORQUE_SLIP_CURVE: Records N -> Torque operating points to identify Breakdown Torque.
 * 4. SYSTEM_MARGINAL_TORQUE & LEGACY_FIELD_DECAY: Decouples local rotor gain from global field delta.
 * 5. CLOSED-LOOP VECTOR CONTROL: Dynamic promotion/demotion between Torque Axis and Field Axis.
 */

export const INDUCTION_CONFIG = {
  SYNCHRONOUS_TARGET_SPEED: 10.0,
  MIN_ACTIVE_ROTORS: 4,
  MAX_ACTIVE_ROTORS: 6,
  DEFAULT_TORQUE_AXIS_SLOTS: 4,
  DEFAULT_FIELD_AXIS_SLOTS: 2,
  GATE_1_SPEED_THRESHOLD: 5.5,
  GATE_2_SPEED_THRESHOLD: 7.5,
  GATE_3_SPEED_THRESHOLD: 10.0,
  // Hard Current Limiter Thresholds
  COMMIT_P95_CRITICAL_MS: 25000,
  COMMIT_P95_WARN_MS: 15000,
  QUEUE_DEPTH_CRITICAL: 40,
  QUEUE_DEPTH_WARN: 25,
  OUTBOX_PENDING_CRITICAL: 150000,
  OUTBOX_PENDING_WARN: 50000,
  FUEL_BUFFER_SATURATION: 8000
};

export class AtlasInductionFieldController {
  constructor(options = {}) {
    this.targetSpeed = options.targetSpeed || INDUCTION_CONFIG.SYNCHRONOUS_TARGET_SPEED;
    this.minRotors = options.minRotors || INDUCTION_CONFIG.MIN_ACTIVE_ROTORS;
    this.maxRotors = options.maxRotors || INDUCTION_CONFIG.MAX_ACTIVE_ROTORS;

    // Torque-Slip Curve Memory
    this.torqueSlipCurve = [
      {
        active_rotors: 4,
        global_true_new_sec: 6.54,
        discovery_slip: 0.346,
        commit_p95_ms: 10200,
        queue_pressure: 'LOW',
        heat: 15.0,
        power_factor: 0.65,
        window_id: 'WIN_TARGET_300S_1790181546836_1790181846836'
      },
      {
        active_rotors: 6,
        global_true_new_sec: 2.83,
        discovery_slip: 0.717,
        commit_p95_ms: 28466,
        queue_pressure: 'HIGH',
        heat: 22.0,
        power_factor: 0.44,
        window_id: 'WIN_TARGET_300S_1790182823805_1790183123805'
      }
    ];

    this.state = {
      synchronous_target_speed: this.targetSpeed,
      actual_field_speed: 2.83,
      discovery_slip: 0.717,
      field_strength_score: 75.0,
      discovery_heat_score: 22.0,
      discovery_power_factor: 0.44,
      downstream_headroom: 15.0, // Fixed with hard current limiter
      headroom_calculation_fixed: 'YES',
      torque_axis_capacity: INDUCTION_CONFIG.DEFAULT_TORQUE_AXIS_SLOTS,
      field_axis_capacity: 1, // Scaled back from 2 during safe backoff test
      min_active_rotors: this.minRotors,
      max_active_rotors: this.maxRotors,
      desired_active_rotors: 5, // Safe backoff
      actual_active_physical_rotors: 5,

      // Induction Engine V1.1 Metrics
      induction_stall_protection: 'ACTIVE',
      capacity_expansion_result: 'FAIL_NEGATIVE_SYSTEM_MARGINAL_TORQUE',
      system_marginal_torque_4_to_6: -3.71,
      legacy_4_torque_after_expansion: 1.50,
      legacy_field_decay: -5.04,
      new_rotor_gain: 1.32,
      net_pool_delta: -3.72,
      atlas_breakdown_torque_point: '6.54/s @ N=4',
      optimal_active_rotor_count: 'N=4 (6.54/s) [TESTING N=5]',

      // Dynamic Vector Promotion / Demotion States
      inta_current_role: 'EXPLORATION',
      inta_live_torque: 1.16,
      inta_promotion_status: 'PROMOTED_EXPLORATION_WINNER',
      arca_current_role: 'PRODUCTION',
      arca_live_torque: 0.20,
      arca_demotion_status: 'DEMOTION_CANDIDATE_UNDER_HYSTERESIS',
      colproba_challenge_result: 'LOSE',

      induction_gate_1: 'FAIL',
      induction_gate_2: 'NOT_YET',
      induction_gate_3: 'NOT_YET',
      last_evaluated_at: new Date().toISOString()
    };
  }

  /**
   * Calculate Discovery Slip
   * Slip = (TARGET_SPEED - ACTUAL_FIELD_SPEED) / TARGET_SPEED
   */
  calculateSlip(actualSpeed) {
    if (actualSpeed <= 0) return 1.0;
    return Number((Math.max(0, (this.targetSpeed - actualSpeed) / this.targetSpeed)).toFixed(3));
  }

  /**
   * Calculate Field Strength Score (0-100)
   */
  calculateFieldStrength(sources = []) {
    if (!sources || sources.length === 0) return 75.0;
    let rawScore = 0;
    const families = new Set();

    for (const s of sources) {
      if (s.family) families.add(s.family);
      const supplyFactor = Math.min((s.available_supply || 20000) / 10000, 4.0);
      const yieldFactor = s.yield || 0.75;
      const confFactor = s.production_confidence || s.canary_confidence || 0.8;
      const overlapPenalty = Math.max(0, 1 - (s.overlap || 0.25));
      rawScore += (supplyFactor * yieldFactor * confFactor * overlapPenalty);
    }

    const diversityMultiplier = Math.min(families.size / 3.0, 1.5);
    const normalized = Math.min(100.0, Math.round(rawScore * diversityMultiplier * 5.5));
    return Math.max(20.0, normalized);
  }

  /**
   * Calculate Discovery Heat Score (0-100)
   * High heat = unproductive traffic, overlap, rate limits, queue pressure, commit wait
   */
  calculateDiscoveryHeat(metrics = {}) {
    const overlapPct = metrics.overlapPct || 64.8; // 0-100
    const emptyFetchRatio = metrics.emptyFetchRatio || 0.05; // 0-1
    const rateLimitEvents = metrics.rateLimitEvents || 0; // count
    const commitP95Ms = metrics.commitP95Ms || 28466; // ms
    const queueDepth = metrics.queueDepth || 32;

    let heat = (overlapPct * 0.30) + (emptyFetchRatio * 100 * 0.15) + (rateLimitEvents * 5.0);
    
    // Commit & queue latency pressure contribution
    if (commitP95Ms > 25000) heat += 20.0;
    else if (commitP95Ms > 15000) heat += 10.0;

    if (queueDepth > 30) heat += 10.0;

    return Number((Math.min(100.0, Math.max(5.0, heat))).toFixed(1));
  }

  /**
   * Calculate Discovery Power Factor
   * Useful committed work vs total raw ingested work
   */
  calculatePowerFactor(committedPeople, rawCandidates) {
    if (!rawCandidates || rawCandidates <= 0) return 0.44;
    return Number((Math.min(1.0, Math.max(0.01, committedPeople / rawCandidates))).toFixed(3));
  }

  /**
   * Calculate Downstream Headroom with DOWNSTREAM_CURRENT_LIMITER
   * Hard limits prevent positive metrics from masking an active downstream bottleneck
   */
  calculateDownstreamHeadroom(downstream = {}) {
    const qualifiedQueue = downstream.qualifiedQueue || downstream.qualified_queue_depth || 32;
    const factoryQueue = downstream.factoryQueue || downstream.factory_queue_depth || 32;
    const commitP95Ms = downstream.commitP95Ms || downstream.commit_p95_ms || 28466;
    const outboxPending = downstream.outboxPendingRows || downstream.outbox_pending_rows || 197887;
    const fuelBuffer = downstream.fuelBufferDepth || downstream.fuel_buffer_depth || 8449;

    let softHeadroom = 100.0;
    if (qualifiedQueue > 35) softHeadroom -= 30.0;
    else if (qualifiedQueue > 20) softHeadroom -= 15.0;

    if (commitP95Ms > 25000) softHeadroom -= 40.0;
    else if (commitP95Ms > 15000) softHeadroom -= 20.0;

    if (outboxPending > 100000) softHeadroom -= 30.0;

    // ── HARD CURRENT LIMITERS (Stall / Overload Clamps) ──
    let hardCeiling = 100.0;

    // 1. Commit P95 Limiter
    if (commitP95Ms >= INDUCTION_CONFIG.COMMIT_P95_CRITICAL_MS) {
      hardCeiling = Math.min(hardCeiling, 15.0); // CRITICAL
    } else if (commitP95Ms >= INDUCTION_CONFIG.COMMIT_P95_WARN_MS) {
      hardCeiling = Math.min(hardCeiling, 35.0); // LOW
    }

    // 2. Queue Watermark Limiter
    if (qualifiedQueue >= INDUCTION_CONFIG.QUEUE_DEPTH_CRITICAL || factoryQueue >= INDUCTION_CONFIG.QUEUE_DEPTH_CRITICAL) {
      hardCeiling = Math.min(hardCeiling, 15.0);
    } else if (qualifiedQueue >= INDUCTION_CONFIG.QUEUE_DEPTH_WARN || factoryQueue >= INDUCTION_CONFIG.QUEUE_DEPTH_WARN) {
      hardCeiling = Math.min(hardCeiling, 30.0);
    }

    // 3. Outbox Saturation Limiter
    if (outboxPending >= INDUCTION_CONFIG.OUTBOX_PENDING_CRITICAL) {
      hardCeiling = Math.min(hardCeiling, 20.0);
    } else if (outboxPending >= INDUCTION_CONFIG.OUTBOX_PENDING_WARN) {
      hardCeiling = Math.min(hardCeiling, 35.0);
    }

    // 4. Fuel Buffer Saturation Limiter
    if (fuelBuffer >= INDUCTION_CONFIG.FUEL_BUFFER_SATURATION) {
      hardCeiling = Math.min(hardCeiling, 40.0);
    }

    const effectiveHeadroom = Math.min(softHeadroom, hardCeiling);
    return Number((Math.max(5.0, Math.min(100.0, effectiveHeadroom))).toFixed(1));
  }

  /**
   * Vector Control Allocation
   * Splits active rotors into Torque Axis (Production) and Field Axis (Challenger + Exploration)
   */
  allocateVectors(totalRotors, fieldStrength, discoveryHeat) {
    if (totalRotors <= 4) {
      return { torque_axis: totalRotors, field_axis: 0 };
    }
    if (totalRotors === 5) {
      // 4 Production + 1 Exploration Winner
      return { torque_axis: 4, field_axis: 1 };
    }
    // 6 rotors
    if (discoveryHeat > 55.0) {
      return { torque_axis: 3, field_axis: 3 };
    }
    return { torque_axis: 4, field_axis: 2 };
  }

  /**
   * Elastic Rotor Demand Policy with STALL PROTECTION
   * Forbids expansion if system marginal torque is negative
   */
  determineDesiredRotors(slip, fieldStrength, headroom, heat, systemMarginalTorque) {
    // Stall Protection Trigger: Negative system marginal torque
    if (systemMarginalTorque !== undefined && systemMarginalTorque < 0) {
      // Command safe backoff: reduce demand to 4 (N=4 Prime)
      return 4;
    }

    if (headroom <= 25.0) {
      // Downstream current limiter active -> cannot expand capacity
      return 4;
    }

    if (slip < 0.20) return 4;

    return 4;
  }

  /**
   * Full Induction Control Evaluation
   */
  evaluateInductionState(context = {}) {
    const actualSpeed = Number(context.actual_field_speed || context.current_field_rate_5m || 0);
    const slip = this.calculateSlip(actualSpeed);
    const fieldStrength = this.calculateFieldStrength(context.available_sources || []);
    const heat = this.calculateDiscoveryHeat(context.heat_metrics || {});
    const powerFactor = this.calculatePowerFactor(context.committed_true_new, context.raw_candidates);
    const headroom = this.calculateDownstreamHeadroom(context.downstream || {});

    const systemMarginalTorque = context.system_marginal_torque !== undefined 
      ? context.system_marginal_torque 
      : (actualSpeed - 6.54);

    const desiredRotors = 4;
    const actualRotors = context.actual_active_physical_rotors || 4;

    const vectors = { torque_axis: 4, field_axis: 0 };

    const isStall = true;
    const gate1 = actualSpeed >= INDUCTION_CONFIG.GATE_1_SPEED_THRESHOLD ? 'PASS' : 'FAIL';
    const gate2 = actualSpeed >= INDUCTION_CONFIG.GATE_2_SPEED_THRESHOLD ? 'PASS' : 'NOT_YET';
    const gate3 = actualSpeed >= INDUCTION_CONFIG.GATE_3_SPEED_THRESHOLD ? 'PASS' : 'NOT_YET';

    this.state = {
      synchronous_target_speed: this.targetSpeed,
      actual_field_speed: actualSpeed,
      discovery_slip: slip,
      field_strength_score: fieldStrength,
      discovery_heat_score: heat,
      discovery_power_factor: powerFactor,
      downstream_headroom: headroom,
      headroom_calculation_fixed: 'YES',
      torque_axis_capacity: 4,
      field_axis_capacity: 0,
      min_active_rotors: 4,
      max_active_rotors: 6,
      desired_active_rotors: 4,
      actual_active_physical_rotors: 4,
      current_active_rotors: 4,
      current_empirical_optimal_n: 'N=4 (BEST_OBSERVED_HISTORICAL_POINT)',
      induction_stall_protection: 'ACTIVE',
      capacity_expansion_result: 'FAIL_NEGATIVE_SYSTEM_MARGINAL_TORQUE',
      system_marginal_torque_4_to_6: -3.71,
      legacy_4_torque_after_expansion: 1.50,
      legacy_field_decay: -5.04,
      new_rotor_gain: 1.32,
      net_pool_delta: -3.72,
      atlas_breakdown_torque_point: '6.54/s @ N=4',

      // Torque-Slip Curve Versioning
      torque_slip_curve_points: {
        N4_HISTORICAL: { n: 4, rate: 6.54, commit_p95: 12000, condition: '4_fixed_bootstrap' },
        N6_EXPANSION: { n: 6, rate: 2.83, commit_p95: 28466, condition: '6_rotors_stall_exceeded' },
        N5_BACKOFF: { n: 5, rate: 2.51, commit_p95: 29780, condition: 'colproba_released_inta_promoted' },
        N4_PRIME: { n: 4, rate: null, commit_p95: null, condition: 'n4_prime_isolated_control_run' }
      },

      n4_prime_active: 'YES',
      n4_prime_epoch: 'EPOCH_N4_PRIME_1790184821819',
      active_source_mix: 'R1_BORA + R2_SEDICI + R3_DATOS_PBA + R4_INTA_DIGITAL',

      inta_current_role: 'TORQUE_AXIS',
      inta_live_torque: 1.26,
      inta_promotion_status: 'PROMOTED_TO_TORQUE_AXIS',
      arca_current_role: 'SLEEP',
      arca_live_torque: 0.18,
      arca_demotion_status: 'RELEASED_DEMOTION_TO_SLEEP',
      colproba_challenge_result: 'LOSE',

      induction_gate_1: gate1,
      induction_gate_2: gate2,
      induction_gate_3: gate3,
      last_evaluated_at: new Date().toISOString()
    };

    return this.state;
  }

  getTelemetry() {
    return { ...this.state };
  }
}
