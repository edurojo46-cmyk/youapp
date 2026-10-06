import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const client = new pg.Client(parseDbUrl());
const SAMPLES_FILE = path.resolve('reports/atlas/realtime/pg_wait_samples.json');

async function main() {
  await client.connect();
  console.log('Connected to PostgreSQL for wait event & lock monitoring.');

  const samples = [];
  const start = Date.now();
  const DURATION_MS = 60000; // Sample for 60 seconds

  console.log(`Sampling pg_stat_activity and pg_locks every 500ms for ${DURATION_MS / 1000}s...`);

  while (Date.now() - start < DURATION_MS) {
    try {
      const res = await client.query(`
        SELECT 
          pid,
          usename,
          application_name,
          client_addr,
          backend_start,
          xact_start,
          query_start,
          state_change,
          wait_event_type,
          wait_event,
          state,
          pg_blocking_pids(pid) AS blocking_pids,
          ROUND(EXTRACT(EPOCH FROM (NOW() - query_start)) * 1000) AS duration_ms,
          query
        FROM pg_stat_activity
        WHERE pid <> pg_backend_pid()
          AND state = 'active'
          AND query NOT ILIKE '%pg_stat_activity%'
      `);

      if (res.rows.length > 0) {
        const sample = {
          timestamp: new Date().toISOString(),
          active_backends: res.rows.length,
          backends: res.rows.map(r => ({
            pid: r.pid,
            wait_event_type: r.wait_event_type,
            wait_event: r.wait_event,
            blocking_pids: r.blocking_pids,
            duration_ms: Number(r.duration_ms),
            query_snippet: (r.query || '').slice(0, 150)
          }))
        };
        samples.push(sample);
      }
    } catch (err) {
      console.warn('Sample error:', err.message);
    }
    await new Promise(r => setTimeout(r, 500));
  }

  // Analyze samples
  console.log(`\nCollected ${samples.length} active samples.`);
  let lockWaitCount = 0;
  let ioWaitCount = 0;
  let cpuOrActiveCount = 0;
  let clientWaitCount = 0;
  const blockingPidsSeen = new Set();
  const waitEventsSeen = {};

  for (const s of samples) {
    for (const b of s.backends) {
      const wet = b.wait_event_type || 'CPU/Execution';
      const we = b.wait_event || 'none';
      const key = `${wet}:${we}`;
      waitEventsSeen[key] = (waitEventsSeen[key] || 0) + 1;

      if (wet === 'Lock') lockWaitCount++;
      else if (wet === 'IO') ioWaitCount++;
      else if (wet === 'Client') clientWaitCount++;
      else cpuOrActiveCount++;

      if (b.blocking_pids && b.blocking_pids.length > 0) {
        for (const bp of b.blocking_pids) blockingPidsSeen.add(bp);
      }
    }
  }

  const analysis = {
    total_samples: samples.length,
    lock_wait_count: lockWaitCount,
    io_wait_count: ioWaitCount,
    client_wait_count: clientWaitCount,
    cpu_or_active_count: cpuOrActiveCount,
    blocking_pids: Array.from(blockingPidsSeen),
    wait_events_frequency: waitEventsSeen,
    lock_contention_confirmed: lockWaitCount > 0 ? 'YES' : 'NO',
    samples: samples.slice(-20) // Keep last 20 samples
  };

  fs.writeFileSync(SAMPLES_FILE, JSON.stringify(analysis, null, 2), 'utf8');
  console.log('Analysis summary:', JSON.stringify(analysis, null, 2));

  await client.end();
}

main().catch(err => {
  console.error('Monitor failed:', err);
  process.exit(1);
});
