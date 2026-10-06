import fs from 'fs';
import path from 'path';
import { spawn, execSync } from 'child_process';

const REPORTS_DIR = path.resolve('reports/atlas/realtime');
const HEARTBEAT_FILE = path.join(REPORTS_DIR, 'worker_heartbeat.json');
const EVENTS_FILE = path.join(REPORTS_DIR, 'watchdog_events.json');

const WATCHDOG_LOCK = path.join(REPORTS_DIR, 'watchdog.lock');

function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return false;
  }
}

function acquireWatchdogLock() {
  if (fs.existsSync(WATCHDOG_LOCK)) {
    try {
      const lockData = JSON.parse(fs.readFileSync(WATCHDOG_LOCK, 'utf-8'));
      if (lockData.pid && lockData.pid !== process.pid && isPidAlive(lockData.pid)) {
        // Another watchdog is running
        process.exit(0);
      }
    } catch (e) {}
  }
  fs.writeFileSync(WATCHDOG_LOCK, JSON.stringify({ pid: process.pid, acquired_at: new Date().toISOString() }), 'utf-8');
}

function releaseWatchdogLock() {
  try {
    if (fs.existsSync(WATCHDOG_LOCK)) {
      const lockData = JSON.parse(fs.readFileSync(WATCHDOG_LOCK, 'utf-8'));
      if (lockData.pid === process.pid) fs.unlinkSync(WATCHDOG_LOCK);
    }
  } catch (e) {}
}

process.on('exit', releaseWatchdogLock);
process.on('SIGINT', () => { releaseWatchdogLock(); process.exit(0); });
process.on('SIGTERM', () => { releaseWatchdogLock(); process.exit(0); });

function logWatchdogEvent(event) {
  let events = [];
  if (fs.existsSync(EVENTS_FILE)) {
    try {
      events = JSON.parse(fs.readFileSync(EVENTS_FILE, 'utf-8'));
    } catch (e) {}
  }
  events.push({
    timestamp: new Date().toISOString(),
    ...event
  });
  fs.writeFileSync(EVENTS_FILE, JSON.stringify(events, null, 2), 'utf-8');
}

export function checkAndReviveWorker() {
  acquireWatchdogLock();
  let restartNeeded = false;
  let reason = '';

  if (!fs.existsSync(HEARTBEAT_FILE)) {
    restartNeeded = true;
    reason = 'HEARTBEAT_FILE_MISSING';
  } else {
    try {
      const hb = JSON.parse(fs.readFileSync(HEARTBEAT_FILE, 'utf-8'));
      const ageMs = Date.now() - new Date(hb.timestamp).getTime();
      const ageSec = Math.floor(ageMs / 1000);

      const alive = isPidAlive(hb.pid);
      if (!alive) {
        restartNeeded = true;
        reason = `PROCESS_DEAD (PID: ${hb.pid})`;
      } else if (ageSec > 90) {
        restartNeeded = true;
        reason = `HEARTBEAT_STALE (${ageSec}s > 90s)`;
        try {
          process.kill(hb.pid, 'SIGKILL');
        } catch (e) {}
      }
    } catch (err) {
      restartNeeded = true;
      reason = 'HEARTBEAT_CORRUPTED';
    }
  }

  if (restartNeeded) {
    console.log(`[WATCHDOG] Restarting Atlas Worker! Reason: ${reason}`);
    logWatchdogEvent({ action: 'RESTART_WORKER', reason });

    // Spawn 5-Station Industrial Ingestion Factory directly in detached mode
    const workerScript = path.resolve('scripts/atlas_industrial_factory.mjs');
    const outLog = fs.openSync(path.join(REPORTS_DIR, 'worker_stdout.log'), 'a');
    const errLog = fs.openSync(path.join(REPORTS_DIR, 'worker_stderr.log'), 'a');

    const child = spawn(process.execPath, [workerScript], {
      detached: true,
      stdio: ['ignore', outLog, errLog],
      cwd: path.resolve('.')
    });
    child.unref();

    // Immediately record child PID to prevent race conditions on next watchdog cycle
    fs.writeFileSync(HEARTBEAT_FILE, JSON.stringify({
      pid: child.pid,
      timestamp: new Date().toISOString(),
      runtime_status: 'STARTING',
      uptime_seconds: 0
    }, null, 2), 'utf-8');

    console.log(`[WATCHDOG] Industrial Factory spawned directly (PID: ${child.pid}).`);
    return true;
  } else {
    return false;
  }
}

// Run if called directly
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const revived = checkAndReviveWorker();
  console.log(`[WATCHDOG CHECK] Worker status: ${revived ? 'REVIVED' : 'HEALTHY_RUNNING'}`);
  if (process.argv.includes('--daemon') || process.argv.includes('-d') || process.env.DAEMON === 'true') {
    console.log('[WATCHDOG] Running in continuous 24/7 daemon mode (polling every 15s)...');
    setInterval(checkAndReviveWorker, 15000);
  }
}
