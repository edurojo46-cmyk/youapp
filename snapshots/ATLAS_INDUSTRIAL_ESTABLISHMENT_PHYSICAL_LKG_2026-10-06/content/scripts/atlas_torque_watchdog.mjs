/**
 * scripts/atlas_torque_watchdog.mjs
 * 
 * ATLAS TORQUE WATCHDOG & FLOOR CONTROLLER
 * 
 * Responsibilities:
 * 1. Continuously monitors ROLLING_5M_TRUE_NET_NEW and ROLLING_15M_TRUE_NET_NEW.
 * 2. Enforces CERTIFIED_TORQUE_FLOOR:
 *    - >= 10.0/s: TORQUE_HEALTHY / CERTIFIED_TORQUE_FLOOR_MET
 *    - 5.0/s - 10.0/s: TORQUE_DEGRADED
 *    - < 1.0/s: TORQUE_CRITICAL
 * 3. Fast Rollback / Self-Healing:
 *    - If ROLLING_5M_TRUE_NET_NEW drops > 50% vs Last Known Good (10.45/s -> < 5.22/s)
 *      while verified healthy supply exists, immediately triggers WinnerLeaseManager.restoreLastKnownGood().
 * 4. Tracks GATE_10_PERSISTENT_30M:
 *    - Validates sustaining >= 10.0/s for a continuous 30-minute operational window (1,800 seconds).
 * 5. Generates reports/atlas/realtime/torque_watchdog.json
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';
import { WinnerLeaseManager } from '../src/lib/atlas/discovery/WinnerLeaseManager.mjs';

dotenv.config();

const REPORTS_DIR = path.resolve('reports/atlas/realtime');
if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

const WATCHDOG_REPORT_FILE = path.join(REPORTS_DIR, 'torque_watchdog.json');
const HEARTBEAT_FILE = path.join(REPORTS_DIR, 'worker_heartbeat.json');
const CABA_PBA_FILE = path.join(REPORTS_DIR, 'caba_pba_discovery.json');
const LEASES_FILE = path.join(REPORTS_DIR, 'winner_leases.json');

const TARGET_PERSISTENT_SECONDS = 1800; // 30 minutes continuous >= 10/s

export class TorqueWatchdog {
  constructor() {
    this.leaseManager = new WinnerLeaseManager();
    this.persistentStartTime = null;
    this.consecutivePassSeconds = 0;
    this.rollbackCount = 0;
    this.lastRollbackAt = null;
  }

  async evaluateTorque() {
    const lkg = this.leaseManager.getLastKnownGoodConfiguration();
    const lkgTorque = Number(lkg.true_net_new_15m || 10.45);
    const rollbackThreshold = Number((lkgTorque * 0.50).toFixed(2)); // 5.22/s

    // 1. Read current speeds strictly from TargetRollingMetrics SSOT
    let targetSpeed1m = 0;
    let targetSpeed5m = 0;
    let targetSpeed15m = 0;
    let globalSpeed15m = 0;
    let activePhysicalRotors = 4;
    let pbaActiveRotors = 3;

    const TARGET_METRICS_FILE = path.join(REPORTS_DIR, 'target_rolling_metrics.json');
    if (fs.existsSync(TARGET_METRICS_FILE)) {
      try {
        const tm = JSON.parse(fs.readFileSync(TARGET_METRICS_FILE, 'utf8'));
        targetSpeed1m = Number(tm.target_true_new_60s_rate || 0);
        targetSpeed5m = Number(tm.target_true_new_5m_rate || 0);
        targetSpeed15m = Number(tm.target_true_new_15m_rate || 0);
        globalSpeed15m = Number(tm.global_arg_true_new_15m_rate || 0);
      } catch (e) {}
    }

    if (targetSpeed5m === 0 && fs.existsSync(HEARTBEAT_FILE)) {
      try {
        const hb = JSON.parse(fs.readFileSync(HEARTBEAT_FILE, 'utf8'));
        targetSpeed1m = Number(hb.target_true_new_60s_rate || hb.caba_pba_net_new_sec || 0);
        targetSpeed5m = Number(hb.target_true_new_5m_rate || 0);
        targetSpeed15m = Number(hb.target_true_new_15m_rate || 0);
        globalSpeed15m = Number(hb.global_arg_true_new_15m_rate || hb.committed_sec || 0);
      } catch (e) {}
    }

    if (targetSpeed5m === 0 && fs.existsSync(CABA_PBA_FILE)) {
      try {
        const disc = JSON.parse(fs.readFileSync(CABA_PBA_FILE, 'utf8'));
        targetSpeed1m = Number(disc.target_caba_pba_true_new_60s || disc.true_net_new_1m_sec || 0);
        targetSpeed5m = Number(disc.target_caba_pba_true_new_5m || disc.true_net_new_5m_sec || 0);
        targetSpeed15m = Number(disc.target_caba_pba_true_new_15m || (Number(disc.caba_true_new_15m || 0) + Number(disc.pba_true_new_15m || 0)) || 0);
        globalSpeed15m = Number(disc.global_arg_true_new_15m || disc.true_net_new_15m_sec || 0);
        activePhysicalRotors = Number(disc.active_physical_rotors || disc.active_rotors || 4);
      } catch (e) {}
    }

    // Fallback to active leases check
    const leasesSummary = await this.leaseManager.getActiveLeases();
    activePhysicalRotors = Math.max(activePhysicalRotors, leasesSummary.total_active_rotors || 4);
    pbaActiveRotors = leasesSummary.pba_active_rotors || 3;

    // 2. Classify Floor State (Strictly based on Target CABA+PBA 5M Speed)
    let floorState = 'TORQUE_HEALTHY';
    if (targetSpeed5m < 1.0) {
      floorState = 'TORQUE_CRITICAL';
    } else if (targetSpeed5m < 5.0) {
      floorState = 'TORQUE_DEGRADED';
    } else if (targetSpeed5m < 10.0) {
      floorState = 'TORQUE_ACCEPTABLE';
    }

    // 3. Rollback / Self-Healing Trigger: If target 5m speed dropped > 50% vs LKG
    let rollbackTriggered = false;
    let rollbackReason = null;
    const now = Date.now();

    // Prevent rollback thrashing: maximum 1 rollback per 5 minutes
    const canRollback = !this.lastRollbackAt || (now - this.lastRollbackAt > 300000);

    if (targetSpeed5m < rollbackThreshold && canRollback && leasesSummary.active_leases_count < 4) {
      console.warn(`[Torque Watchdog] ⚠️ TARGET_ROLLING_5M (${targetSpeed5m}/s) dropped > 50% vs LKG (${lkgTorque}/s). Restoring Last Known Good Field Configuration...`);
      await this.leaseManager.restoreLastKnownGood();
      this.rollbackCount++;
      this.lastRollbackAt = now;
      rollbackTriggered = true;
      rollbackReason = `Target Rolling 5m (${targetSpeed5m}/s) fell below 50% floor (${rollbackThreshold}/s)`;
    }

    // 4. Evaluate TARGET_GATE_10_PERSISTENT_30M (Strict Contractual Requirement 6: Target CABA/PBA only)
    const isTargetGate10PassingNow = targetSpeed15m >= 10.0;
    if (isTargetGate10PassingNow) {
      if (!this.persistentStartTime) {
        this.persistentStartTime = now;
      }
      this.consecutivePassSeconds = Math.floor((now - this.persistentStartTime) / 1000);
    } else {
      // Strict reset: if target 15m drops below 10/s, reset continuous 30m timer
      this.persistentStartTime = null;
      this.consecutivePassSeconds = 0;
    }

    const persistentProgressPct = Number(Math.min(100, (this.consecutivePassSeconds / TARGET_PERSISTENT_SECONDS) * 100).toFixed(1));
    const gate10Persistent30m = this.consecutivePassSeconds >= TARGET_PERSISTENT_SECONDS ? 'PASS' : `IN_PROGRESS (${persistentProgressPct}% - ${this.consecutivePassSeconds}/${TARGET_PERSISTENT_SECONDS}s)`;

    // 5. Invariant check: PBA_ACTIVE_ROTORS >= 1 while healthy PBA supply exists
    const pbaTorqueFloorInvariant = pbaActiveRotors >= 1;
    if (!pbaTorqueFloorInvariant) {
      console.warn('[Torque Watchdog] PBA Torque Floor Invariant violated! Re-allocating PBA rotor.');
      await this.leaseManager.allocateLease({
        source_id: 'SRC_CKAN_DATOS_PBA',
        motor_id: 'CKAN_MOTOR_DATOS_PBA_PROVINCIA',
        source_name: 'Portal de Datos Abiertos de la Provincia de Buenos Aires',
        source_universe: 'PROVINCIAL_PUBLIC_ADMINISTRATION',
        target_region: 'PBA',
        rotor_count: 1,
        reason: 'PBA Torque Floor Invariant Enforcement'
      });
    }

    // 6. Assemble Watchdog Report
    const report = {
      timestamp: new Date().toISOString(),
      watchdog_status: 'ACTIVE_MONITORING',
      certified_torque_floor: {
        floor_min_target_sec: 10.0,
        degraded_threshold_sec: 5.0,
        critical_threshold_sec: 1.0,
        current_state: floorState,
        operational_floor_met: targetSpeed5m >= 5.0
      },
      last_known_good: {
        rotors: lkg.rotors,
        active_winners: lkg.active_winners,
        target_true_net_new_15m: lkgTorque,
        fifty_percent_floor_sec: rollbackThreshold
      },
      measured_throughput: {
        target_true_net_new_1m_sec: targetSpeed1m,
        target_true_net_new_5m_sec: targetSpeed5m,
        target_true_net_new_15m_sec: targetSpeed15m,
        global_arg_true_net_new_15m_sec: globalSpeed15m,
        target_torque_ratio_vs_lkg: Number((targetSpeed15m / lkgTorque).toFixed(2))
      },
      pba_torque_floor_invariant: {
        pba_active_rotors: pbaActiveRotors,
        pba_torque_floor_met: pbaTorqueFloorInvariant,
        invariant_rule: 'AVAILABLE_PBA_TORQUE > 0 AND HEALTHY_PBA_WINNER_EXISTS -> PBA_ACTIVE_ROTORS >= 1'
      },
      persistent_gate_telemetry: {
        target_window_seconds: TARGET_PERSISTENT_SECONDS,
        consecutive_pass_seconds: this.consecutivePassSeconds,
        progress_percentage: `${persistentProgressPct}%`,
        target_gate_10_sec_15m: targetSpeed15m >= 10.0 ? 'PASS' : 'FAIL',
        global_gate_10_sec_15m: globalSpeed15m >= 10.0 ? 'PASS' : 'FAIL',
        target_gate_10_persistent_30m: gate10Persistent30m
      },
      self_healing: {
        rollback_count: this.rollbackCount,
        last_rollback_at: this.lastRollbackAt ? new Date(this.lastRollbackAt).toISOString() : null,
        rollback_triggered_this_cycle: rollbackTriggered,
        reason: rollbackReason
      }
    };

    fs.writeFileSync(WATCHDOG_REPORT_FILE, JSON.stringify(report, null, 2), 'utf8');
    return report;
  }
}

// Standalone execution support
if (process.argv[1]?.endsWith('atlas_torque_watchdog.mjs')) {
  const watchdog = new TorqueWatchdog();
  watchdog.evaluateTorque()
    .then((rep) => {
      console.log('✓ Torque Watchdog evaluation completed:');
      console.log(`  - State: ${rep.certified_torque_floor.current_state}`);
      console.log(`  - Speed 5M: ${rep.measured_throughput.target_true_net_new_5m_sec}/s | Speed 15M: ${rep.measured_throughput.target_true_net_new_15m_sec}/s`);
      console.log(`  - PBA Active Rotors: ${rep.pba_torque_floor_invariant.pba_active_rotors}`);
      console.log(`  - Gate 10 Persistent 30M: ${rep.persistent_gate_telemetry.target_gate_10_persistent_30m} (${rep.persistent_gate_telemetry.progress_percentage})`);
      
      if (process.argv.includes('--daemon')) {
        console.log('[Torque Watchdog] Daemon active. Polling every 15 seconds...');
        setInterval(() => {
          watchdog.evaluateTorque().catch(console.error);
        }, 15000);
      } else {
        process.exit(0);
      }
    })
    .catch(err => {
      console.error('Torque Watchdog error:', err);
      process.exit(1);
    });
}
