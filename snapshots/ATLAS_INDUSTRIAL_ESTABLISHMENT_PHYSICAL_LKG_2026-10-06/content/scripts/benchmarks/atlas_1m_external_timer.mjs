/**
 * ATLAS 1M EXTERNAL CERTIFICATION TIMER
 * 
 * Contract:
 * - Independent authoritative external clock process
 * - Does NOT index, process data, execute search, or control Meilisearch
 * - High-resolution monotonic clock: performance.now() and process.hrtime.bigint()
 * - UTC timestamps recorded for audit
 * - Observes and records checkpoints and T0 / T1
 * - Evaluates gate: FINAL_1M_E2E_SECONDS <= 1200.000 (20:00.000)
 */

import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

const TIMER_PORT = 7799;
const SCRATCH_DIR = path.resolve('scratch');
if (!fs.existsSync(SCRATCH_DIR)) fs.mkdirSync(SCRATCH_DIR, { recursive: true });

const CHECKPOINTS_FILE = path.join(SCRATCH_DIR, 'atlas_final_1m_checkpoints.jsonl');
const TIMER_SUMMARY_FILE = path.join(SCRATCH_DIR, 'atlas_final_1m_external_timer.json');

// Clear previous timer files if any
if (fs.existsSync(CHECKPOINTS_FILE)) {
  try { fs.unlinkSync(CHECKPOINTS_FILE); } catch {}
}

let t0Monotonic = null;
let t0HrTime = null;
let t0Utc = null;
let firstEntityId = null;
let sourceWatermarkStart = null;

let t1Monotonic = null;
let t1HrTime = null;
let t1Utc = null;

let isRunning = false;
let isCompleted = false;

const checkpoints = [];
let lastCheckpointMonotonic = null;
let lastCheckpointVisible = 0;

function formatElapsedHms(totalSec) {
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = Math.floor(totalSec % 60);
  const ms = Math.floor((totalSec % 1) * 1000);
  const pad = (n, width = 2) => String(n).padStart(width, '0');
  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(ms, 3)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}.${pad(ms, 3)}`;
}

console.log('================================================================');
console.log('⏱️  ATLAS 1M EXTERNAL CERTIFICATION TIMER — INITIALIZED');
console.log('Contract: Independent Authoritative Monotonic High-Res Observer');
console.log(`Port: ${TIMER_PORT} | Monotonic Source: process.hrtime.bigint()`);
console.log('================================================================\n');

const server = net.createServer(socket => {
  console.log('[External Timer] Pipeline connected.');
  let buffer = '';

  socket.on('data', chunk => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line.trim());
        handleMessage(msg, socket);
      } catch (err) {
        console.error('[External Timer] Failed to parse message:', line, err.message);
      }
    }
  });

  socket.on('error', err => {
    console.error('[External Timer] Socket error:', err.message);
  });
});

function handleMessage(msg, socket) {
  const nowMono = performance.now();
  const nowHr = process.hrtime.bigint();
  const nowUtc = new Date().toISOString();

  if (msg.event === 'T0_START') {
    t0Monotonic = nowMono;
    t0HrTime = nowHr;
    t0Utc = nowUtc;
    firstEntityId = msg.firstEntityId || 1;
    sourceWatermarkStart = msg.sourceWatermarkStart || 0;
    lastCheckpointMonotonic = nowMono;
    lastCheckpointVisible = 0;
    isRunning = true;

    console.log('----------------------------------------------------------------');
    console.log('🟢 [T0 RECORDED BY EXTERNAL TIMER]');
    console.log(`   T0_MONOTONIC          : ${t0Monotonic.toFixed(4)} ms`);
    console.log(`   T0_HRTIME_NS          : ${t0HrTime}`);
    console.log(`   T0_UTC                : ${t0Utc}`);
    console.log(`   FIRST_ENTITY_ID       : ${firstEntityId}`);
    console.log(`   SOURCE_WATERMARK_START: ${sourceWatermarkStart}`);
    console.log('----------------------------------------------------------------\n');

    socket.write(JSON.stringify({ ack: 'T0_ACK', t0Monotonic, t0Utc }) + '\n');
    return;
  }

  if (msg.event === 'CHECKPOINT') {
    if (!isRunning || !t0Monotonic) {
      console.warn('[External Timer] Warning: Checkpoint received before T0!');
      return;
    }

    const elapsedSeconds = Number(((nowMono - t0Monotonic) / 1000).toFixed(4));
    const stepSeconds = lastCheckpointMonotonic ? Number(((nowMono - lastCheckpointMonotonic) / 1000).toFixed(4)) : elapsedSeconds;
    const netNewVisible = msg.visible || 0;
    const stepVisible = netNewVisible - lastCheckpointVisible;

    const instantDocsSec = stepSeconds > 0 ? Number((stepVisible / stepSeconds).toFixed(2)) : 0;
    const cumulativeDocsSec = elapsedSeconds > 0 ? Number((netNewVisible / elapsedSeconds).toFixed(2)) : 0;

    lastCheckpointMonotonic = nowMono;
    lastCheckpointVisible = netNewVisible;

    const checkpointRecord = {
      checkpointName: msg.checkpointName,
      tMonotonic: Number(nowMono.toFixed(4)),
      tUtc: nowUtc,
      elapsedSeconds,
      formattedElapsed: formatElapsedHms(elapsedSeconds),
      discovered: msg.discovered || 0,
      processed: msg.processed || 0,
      identityResolved: msg.identityResolved || 0,
      qualified: msg.qualified || 0,
      outboxAcknowledged: msg.outboxAcknowledged || 0,
      indexed: msg.indexed || 0,
      visible: netNewVisible,
      backlog: msg.backlog || 0,
      docsSecInstant: instantDocsSec,
      docsSecCumulative: cumulativeDocsSec
    };

    checkpoints.push(checkpointRecord);
    fs.appendFileSync(CHECKPOINTS_FILE, JSON.stringify(checkpointRecord) + '\n');

    console.log(`📍 [CHECKPOINT] ${checkpointRecord.checkpointName.padEnd(25)} | Elapsed: ${checkpointRecord.formattedElapsed.padStart(10)} (${elapsedSeconds}s) | Visible: ${String(netNewVisible).padStart(7)} | Inst: ${String(instantDocsSec).padStart(8)} d/s | Cumul: ${String(cumulativeDocsSec).padStart(8)} d/s | Backlog: ${checkpointRecord.backlog}`);

    socket.write(JSON.stringify({ ack: 'CHECKPOINT_ACK', checkpointName: msg.checkpointName }) + '\n');
    return;
  }

  if (msg.event === 'T1_COMPLETE') {
    t1Monotonic = nowMono;
    t1HrTime = nowHr;
    t1Utc = nowUtc;
    isRunning = false;
    isCompleted = true;

    const finalE2ESeconds = Number(((t1Monotonic - t0Monotonic) / 1000).toFixed(4));
    const formattedTime = formatElapsedHms(finalE2ESeconds);
    const passGate = finalE2ESeconds <= 1200.000;

    const conditions = msg.conditions || {};
    const conditionsPassed = (
      conditions.NET_NEW_EXPECTED === 1000000 &&
      conditions.NET_NEW_VISIBLE_ACTIVE_READ === 1000000 &&
      conditions.MISSING === 0 &&
      conditions.DELTA_LOSS === 0 &&
      conditions.STALE_DOCS === 0 &&
      conditions.LOST_OUTBOX_EVENTS === 0 &&
      conditions.VALIDATION_COMPLETE === true &&
      conditions.PROMOTION_COMPLETE === true &&
      conditions.ACTIVE_GENERATION === 'NEW_GENERATION' &&
      conditions.SEARCHABLE === true &&
      conditions.TOP10_RANK_PARITY === 100 &&
      conditions.TOP50_RANK_PARITY === 100
    );

    const finalVerdict = (passGate && conditionsPassed) ? 'PASS' : 'FAIL';

    console.log('\n================================================================');
    console.log('🏁 [T1 REACHED — OFFICIAL EXTERNAL TIMER VERDICT]');
    console.log('================================================================');
    console.log(`   T0_UTC                  : ${t0Utc}`);
    console.log(`   T1_UTC                  : ${t1Utc}`);
    console.log(`   FINAL_1M_E2E_SECONDS    : ${finalE2ESeconds.toFixed(3)}s`);
    console.log(`   FINAL_1M_E2E_FORMATTED  : ${formattedTime}`);
    console.log(`   CONTRACT GATE (<= 20m)  : ${passGate ? 'PASS (<= 1200.000s)' : 'FAIL (> 1200.000s)'}`);
    console.log(`   INTEGRITY CONDITIONS    : ${conditionsPassed ? 'ALL VERIFIED (100% PARITY, ZERO LOSS)' : 'FAILED'}`);
    console.log(`   OFFICIAL VERDICT        : ATLAS_1M_20_CERTIFICATION = ${finalVerdict}`);
    console.log('================================================================\n');

    const externalTimerResult = {
      CERTIFICATE: 'ATLAS 1M EXTERNAL CERTIFICATION TIMER',
      T0_MONOTONIC: Number(t0Monotonic.toFixed(4)),
      T0_HRTIME_NS: t0HrTime.toString(),
      T0_UTC: t0Utc,
      FIRST_ENTITY_ID: firstEntityId,
      SOURCE_WATERMARK_START: sourceWatermarkStart,
      T1_MONOTONIC: Number(t1Monotonic.toFixed(4)),
      T1_HRTIME_NS: t1HrTime.toString(),
      T1_UTC: t1Utc,
      FINAL_1M_E2E_SECONDS: finalE2ESeconds,
      FINAL_1M_E2E_HH_MM_SS_MS: formattedTime,
      CONTRACT_GATE_SECONDS: 1200.000,
      GATE_PASSED: passGate,
      CONDITIONS_CHECK: conditions,
      CONDITIONS_PASSED: conditionsPassed,
      ATLAS_1M_20_CERTIFICATION: finalVerdict,
      TOTAL_CHECKPOINTS_RECORDED: checkpoints.length
    };

    fs.writeFileSync(TIMER_SUMMARY_FILE, JSON.stringify(externalTimerResult, null, 2));
    socket.write(JSON.stringify({ ack: 'T1_ACK', externalTimerResult }) + '\n');

    // Timer completed its duty, shutdown after brief flush
    setTimeout(() => {
      server.close(() => {
        console.log('[External Timer] Finished authoritative recording. Exiting cleanly.');
        process.exit(0);
      });
    }, 1500);
  }
}

server.listen(TIMER_PORT, '127.0.0.1', () => {
  console.log(`[External Timer] Listening on 127.0.0.1:${TIMER_PORT}`);
});
