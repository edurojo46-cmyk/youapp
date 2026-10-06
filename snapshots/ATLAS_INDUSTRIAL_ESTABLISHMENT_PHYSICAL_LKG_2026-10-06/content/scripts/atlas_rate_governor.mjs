/**
 * scripts/atlas_rate_governor.mjs
 * 
 * ATLAS SUSTAINED RATE GOVERNOR & RUNWAY CONTROLLER (V5)
 * 
 * Implements:
 * 1. Sustained Rate Governor: Target band [850, 1050] net-new/sec (target: 900/sec).
 * 2. Source Runway Controller: Continuous runway budgeting (NET_NEW_REMAINING, SECONDS_TO_DEPLETION, MAX_SAFE_CURRENT_RATE).
 * 3. 429-Aware Host Rate Controller: Per-host backoff and request spacing.
 * 4. Automatic Source Demotion Pipeline: HOT -> DECLINING -> DEPLETING -> THROTTLED -> PARKED / EXHAUSTED.
 * 5. Time-Phased Hot Reserves: HOT_RESERVE_EARLY, HOT_RESERVE_MID, HOT_RESERVE_LATE.
 * 6. Final Million Holdout Enforcer: Strictly locks all 15 holdout sources.
 */

import fs from 'fs';
import path from 'path';

export const RATE_CONFIG = {
  TARGET_NET_NEW_SEC: 900,
  LOWER_BAND: 850,
  UPPER_BAND: 1050,
  CRITICAL_FLOOR: 800,
  WINDOW_MS: 5000 // 5-second smoothing window
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. 429-AWARE HOST RATE CONTROLLER
// ─────────────────────────────────────────────────────────────────────────────
export class HostRateController {
  constructor() {
    this.hosts = new Map();
  }

  getHostState(host) {
    if (!this.hosts.has(host)) {
      this.hosts.set(host, {
        host,
        lastRequestTime: 0,
        minIntervalMs: 50, // default spacing
        backoffUntil: 0,
        consecutive429s: 0,
        total429s: 0,
        totalRequests: 0,
        successfulRequests: 0
      });
    }
    return this.hosts.get(host);
  }

  isHostAvailable(host) {
    const state = this.getHostState(host);
    const now = Date.now();
    return now >= state.backoffUntil;
  }

  getBackoffRemainingMs(host) {
    const state = this.getHostState(host);
    return Math.max(0, state.backoffUntil - Date.now());
  }

  async acquireSlot(host) {
    const state = this.getHostState(host);
    const now = Date.now();

    if (now < state.backoffUntil) {
      return false; // Host currently backed off
    }

    const elapsed = now - state.lastRequestTime;
    if (elapsed < state.minIntervalMs) {
      await new Promise(r => setTimeout(r, state.minIntervalMs - elapsed));
    }

    state.lastRequestTime = Date.now();
    state.totalRequests++;
    return true;
  }

  recordResponse(host, status) {
    const state = this.getHostState(host);
    const now = Date.now();

    if (status === 429) {
      state.consecutive429s++;
      state.total429s++;
      // Exponential backoff: 5s, 10s, 20s, max 60s
      const backoffDuration = Math.min(60000, 5000 * Math.pow(2, state.consecutive429s - 1));
      state.backoffUntil = now + backoffDuration;
      state.minIntervalMs = Math.min(2000, state.minIntervalMs * 2);
      console.warn(`[HOST BACKOFF 429] Host '${host}' hit HTTP 429. Backing off for ${backoffDuration / 1000}s (consecutive: ${state.consecutive429s}, total: ${state.total429s}).`);
    } else if (status >= 200 && status < 300) {
      state.successfulRequests++;
      if (state.consecutive429s > 0) {
        state.consecutive429s = 0;
        state.backoffUntil = 0;
      }
    }
  }

  getSummary() {
    const summary = {};
    for (const [h, s] of this.hosts.entries()) {
      summary[h] = {
        totalRequests: s.totalRequests,
        total429s: s.total429s,
        isBackedOff: Date.now() < s.backoffUntil,
        backoffRemainingMs: Math.max(0, s.backoffUntil - Date.now())
      };
    }
    return summary;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. SOURCE RUNWAY & LIFECYCLE CONTROLLER
// ─────────────────────────────────────────────────────────────────────────────
export class SourceRunwayController {
  constructor(partitionConfigPath) {
    this.partitionConfig = JSON.parse(fs.readFileSync(partitionConfigPath, 'utf8'));
    this.holdoutSourceIds = new Set(
      this.partitionConfig.PARTITIONS.FINAL_CERTIFICATION_FUEL_BANK.SOURCES.map(s => s.source_id)
    );
    this.engineeringSources = new Map();
    this.promotions = 0;
    this.demotions = 0;
    this.handoffs = 0;

    // Initialize engineering sources
    for (const src of this.partitionConfig.PARTITIONS.ENGINEERING_FUEL_BANK.SOURCES) {
      this.engineeringSources.set(src.source_id, {
        ...src,
        netNewCommitted: 0,
        netNewRemaining: src.lower_bound_net_new,
        currentNetNewSec: 0,
        lastNetNewCommitted: 0,
        secondsToDepletion: 9999,
        maxSafeCurrentRate: 0,
        lifecycleStatus: 'STANDBY', // STANDBY, PREWARMING, HOT_STABLE, HOT_DECLINING, DEPLETING, THROTTLED, PARKED_EXHAUSTED
        active: false,
        phase: src.source_id.includes('IGJ') ? 'EARLY' :
               src.source_id.includes('CONICET') ? 'EARLY' :
               src.source_id.includes('INTA') ? 'EARLY' :
               src.source_id.includes('SEDICI') ? 'MID' :
               src.source_id.includes('UNC') ? 'MID' : 'LATE',
        throttleDelayMs: 0
      });
    }
  }

  isHoldoutProtected(sourceId) {
    return this.holdoutSourceIds.has(sourceId);
  }

  assertNotHoldout(sourceId) {
    if (this.isHoldoutProtected(sourceId)) {
      throw new Error(`CRITICAL VIOLATION: Source '${sourceId}' is in the FINAL_CERTIFICATION_FUEL_BANK and MUST NOT be consumed in an engineering test!`);
    }
  }

  updateMetrics(sourceId, newlyCommittedNetNew, elapsedSec, totalRunDurationSec = 300) {
    const src = this.engineeringSources.get(sourceId);
    if (!src) return;

    src.netNewCommitted += newlyCommittedNetNew;
    src.netNewRemaining = Math.max(0, src.lower_bound_net_new - src.netNewCommitted);

    const deltaWindow = src.netNewCommitted - src.lastNetNewCommitted;
    src.lastNetNewCommitted = src.netNewCommitted;
    src.currentNetNewSec = parseFloat((deltaWindow / 5.0).toFixed(2)); // evaluated every 5s

    const runRemainingSec = Math.max(1, totalRunDurationSec - elapsedSec);
    src.secondsToDepletion = src.currentNetNewSec > 0 ? Math.round(src.netNewRemaining / src.currentNetNewSec) : 9999;
    src.maxSafeCurrentRate = parseFloat((src.netNewRemaining / runRemainingSec).toFixed(2));

    // Dynamic Safe Rate Clamping
    // If source is burning faster than max safe rate AND has high volume, throttle it
    if (src.active && src.currentNetNewSec > (src.maxSafeCurrentRate * 1.25) && src.currentNetNewSec > 150) {
      const overshoot = src.currentNetNewSec - src.maxSafeCurrentRate;
      src.throttleDelayMs = Math.min(100, Math.max(10, Math.round(overshoot / 10)));
    } else {
      src.throttleDelayMs = 0;
    }
  }

  evaluateLifecycle(elapsedSec, totalRunDurationSec = 300) {
    const timeRemainingSec = Math.max(1, totalRunDurationSec - elapsedSec);

    for (const [id, src] of this.engineeringSources.entries()) {
      if (!src.active) continue;

      const prevStatus = src.lifecycleStatus;

      // Demotion Pipeline: HOT_STABLE -> HOT_DECLINING -> DEPLETING -> THROTTLED -> PARKED_EXHAUSTED
      if (src.netNewRemaining <= 500) {
        src.lifecycleStatus = 'PARKED_EXHAUSTED';
        src.active = false;
        this.demotions++;
        console.log(`[SOURCE DEMOTION] Source '${id}' has reached exhaustion (${src.netNewRemaining} net-new remaining). Transitioned to PARKED_EXHAUSTED.`);
      } else if (src.netNewRemaining < 5000 || src.secondsToDepletion < 30) {
        if (prevStatus !== 'THROTTLED' && prevStatus !== 'DEPLETING') {
          src.lifecycleStatus = 'DEPLETING';
          this.demotions++;
          console.log(`[SOURCE DEMOTION] Source '${id}' is depleting (${src.netNewRemaining} remaining, ${src.secondsToDepletion}s to depletion). Transitioned to DEPLETING.`);
        }
      } else if (src.secondsToDepletion < 60 || (src.currentNetNewSec > 0 && src.currentNetNewSec < 50)) {
        if (prevStatus === 'HOT_STABLE') {
          src.lifecycleStatus = 'HOT_DECLINING';
          this.demotions++;
          console.log(`[SOURCE DEMOTION] Source '${id}' rate declining (rate: ${src.currentNetNewSec}/s). Transitioned to HOT_DECLINING.`);
        }
      }
    }
  }

  promotePhase(phaseName) {
    const toPromote = [];
    for (const [id, src] of this.engineeringSources.entries()) {
      if (src.phase === phaseName && src.lifecycleStatus === 'STANDBY' && !src.active) {
        src.lifecycleStatus = 'HOT_STABLE';
        src.active = true;
        this.promotions++;
        this.handoffs++;
        toPromote.push(src);
        console.log(`[SOURCE PROMOTION] Phase ${phaseName}: Activated '${id}' (${src.source_name}).`);
      }
    }
    return toPromote;
  }

  getActiveSources() {
    return Array.from(this.engineeringSources.values()).filter(s => s.active);
  }

  getAllSources() {
    return Array.from(this.engineeringSources.values());
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. SUSTAINED RATE GOVERNOR
// ─────────────────────────────────────────────────────────────────────────────
export class SustainedRateGovernor {
  constructor(targetNetNewSec = 900, lowerBand = 850, upperBand = 1050) {
    this.target = targetNetNewSec;
    this.lower = lowerBand;
    this.upper = upperBand;
    this.history = [];
    this.timeAbove800Sec = 0;
    this.globalThrottleDelayMs = 0;
    this.lastWindowTime = Date.now();
    this.lastWindowCommitted = 0;
  }

  recordTick(totalCommitted, elapsedSec) {
    const now = Date.now();
    const windowSec = (now - this.lastWindowTime) / 1000;
    if (windowSec < 0.5) return;

    const delta = totalCommitted - this.lastWindowCommitted;
    this.lastWindowCommitted = totalCommitted;
    this.lastWindowTime = now;

    const currentRate = parseFloat((delta / windowSec).toFixed(2));
    this.history.push({ elapsedSec, currentRate, timestamp: now });
    if (this.history.length > 60) this.history.shift();

    if (currentRate >= RATE_CONFIG.CRITICAL_FLOOR) {
      this.timeAbove800Sec += windowSec;
    }

    // PACING CONTROL
    if (currentRate > this.upper) {
      // OVER-SPEED: Apply backpressure delay to producers
      const overshoot = currentRate - this.upper;
      // Linear throttle factor
      this.globalThrottleDelayMs = Math.min(150, Math.max(10, Math.round(overshoot / 15)));
    } else if (currentRate < this.lower) {
      // UNDER-SPEED: Zero throttle delay, allow maximum unconstrained pull
      this.globalThrottleDelayMs = 0;
    } else {
      // WITHIN TARGET BAND [850, 1050]: Maintain gentle pacing
      this.globalThrottleDelayMs = 5;
    }

    return {
      currentRate,
      globalThrottleDelayMs: this.globalThrottleDelayMs,
      timeAbove800Sec: Math.round(this.timeAbove800Sec),
      inBand: currentRate >= this.lower && currentRate <= this.upper
    };
  }

  getGlobalThrottleDelay() {
    return this.globalThrottleDelayMs;
  }
}
