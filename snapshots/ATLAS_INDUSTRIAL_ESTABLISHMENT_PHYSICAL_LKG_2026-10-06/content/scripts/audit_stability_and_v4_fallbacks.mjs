/**
 * scripts/audit_stability_and_v4_fallbacks.mjs
 * Rigorous audit of stability window and V4 fallback events
 */

import fs from 'fs';
import path from 'path';
import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const dbConfig = parseDbUrl(process.env.DATABASE_URL);
const pool = new pg.Pool({ ...dbConfig, max: 2 });

async function runAudit() {
  const client = await pool.connect();
  try {
    await client.query("SET statement_timeout = '30s'");

    console.log('=== 1. CHECK DEFAULT STATEMENT TIMEOUT & SETTINGS ===');
    const { rows: stRows } = await client.query('SHOW statement_timeout;');
    console.log('Default statement_timeout:', stRows[0].statement_timeout);

    const { rows: lockTimeoutRows } = await client.query('SHOW lock_timeout;');
    console.log('Default lock_timeout:', lockTimeoutRows[0].lock_timeout);

    console.log('\n=== 2. INSPECT commit_staged_batch_v2 FUNCTION DEFINITION ===');
    const { rows: procRows } = await client.query(`
      SELECT prosrc 
      FROM pg_proc p 
      JOIN pg_namespace n ON p.pronamespace = n.oid 
      WHERE n.nspname = 'atlas_ingest_v2_shadow' AND proname = 'commit_staged_batch_v2';
    `);
    if (procRows.length > 0) {
      console.log('Function prosrc length:', procRows[0].prosrc.length);
      console.log('Function snippet:', procRows[0].prosrc.substring(0, 300) + '...');
    } else {
      console.log('Function atlas_ingest_v2_shadow.commit_staged_batch_v2 not found in pg_proc');
    }

    console.log('\n=== 3. CHECK DATABASE HEALTH & ACTIVITY ===');
    const { rows: actRows } = await client.query(`
      SELECT pid, state, wait_event_type, wait_event, query_start, backend_type, 
             left(query, 80) as query_snippet
      FROM pg_stat_activity
      WHERE state = 'active' OR wait_event_type IS NOT NULL
      ORDER BY query_start ASC
    `);
    console.log('Active / waiting backends:', actRows.length);
    actRows.forEach(a => console.log(`  [PID ${a.pid}] type=${a.backend_type} state=${a.state} wait=${a.wait_event_type}:${a.wait_event} query=${a.query_snippet}`));

    // Autovacuum check
    const { rows: autoVacRows } = await client.query(`
      SELECT count(*) as autovacuum_active 
      FROM pg_stat_activity 
      WHERE query LIKE '%autovacuum%' OR query LIKE '%VACUUM%'
    `);
    console.log('Autovacuum active processes:', autoVacRows[0].autovacuum_active);

    console.log('\n=== 4. CURRENT SSOT REHYDRATION ===');
    const { rows: ssotRows } = await client.query(`
      SELECT qualified_unique_real_people,
             caba_pba_qualified_unique_real_people,
             caba_qualified_unique_real_people,
             pba_qualified_unique_real_people,
             searchable_documents,
             search_outbox_depth,
             updated_at,
             last_verified_change_at
      FROM atlas_people_live_metrics
      WHERE id = 'current'
    `);
    const currentSsot = ssotRows[0];
    console.log('Current SSOT:', JSON.stringify(currentSsot, null, 2));

  } finally {
    client.release();
    await pool.end();
  }

  console.log('\n=== 5. PARSE DAEMON LOG (task-1348.log) ===');
  const logPath = 'C:\\Users\\Eduardo\\.gemini\\antigravity-ide\\brain\\549aedbe-6898-4a4a-8c04-b63a8949ad4e\\.system_generated\\tasks\\task-1348.log';
  if (fs.existsSync(logPath)) {
    const content = fs.readFileSync(logPath, 'utf8');
    const lines = content.split('\n');
    console.log('Total log lines:', lines.length);

    // Look for startup line
    const startLine = lines.find(l => l.includes('Persistent 24/7 Factory Online') || l.includes('Starting Persistent V2 Production Factory') || l.includes('SSOT Baseline:'));
    console.log('Daemon startup line:', startLine);

    // Parse all batch completions
    const batchRegex = /\[W(\d+)\|Batch (\d+)\] Engine: (\w+) \| \+True New: (\d+) \((\d+)ms\) \| SSOT: (\d+) \(\+(\d+)\) \| Avg: ([\d\.]+)\/s/g;
    let match;
    const batches = [];
    while ((match = batchRegex.exec(content)) !== null) {
      batches.push({
        worker: Number(match[1]),
        batchNum: Number(match[2]),
        engine: match[3],
        trueNew: Number(match[4]),
        durationMs: Number(match[5]),
        ssot: Number(match[6]),
        totalNew: Number(match[7]),
        avgRate: Number(match[8])
      });
    }

    // Also look for V2 Primary Anomaly lines
    const anomalyRegex = /\[V2 Primary Anomaly\]: (.*?)\. Executing V4 hot fallback/g;
    const anomalies = [];
    while ((match = anomalyRegex.exec(content)) !== null) {
      anomalies.push(match[1]);
    }

    console.log(`Total parsed batch completions: ${batches.length}`);
    console.log(`Total V2 Primary Anomalies: ${anomalies.length}`);

    // Group anomalies by reason
    const reasonCounts = {};
    for (const a of anomalies) {
      let cat = 'OTHER';
      if (a.includes('statement timeout')) cat = 'STATEMENT_TIMEOUT';
      else if (a.includes('lock timeout')) cat = 'LOCK_TIMEOUT';
      else if (a.includes('connection') || a.includes('ECONNRESET')) cat = 'CONNECTION_ERROR';
      else if (a.includes('deadlock')) cat = 'LOCK_CONTENTION';
      reasonCounts[cat] = (reasonCounts[cat] || 0) + 1;
    }
    console.log('Anomaly breakdown:', reasonCounts);

    if (batches.length > 0) {
      const firstBatch = batches[0];
      const lastBatch = batches[batches.length - 1];
      console.log('First Batch:', firstBatch);
      console.log('Last Batch:', lastBatch);

      const v4Batches = batches.filter(b => b.engine === 'V4_FALLBACK');
      const v2Batches = batches.filter(b => b.engine === 'V2_PRIMARY');

      const v4TrueNew = v4Batches.reduce((sum, b) => sum + b.trueNew, 0);
      const v2TrueNew = v2Batches.reduce((sum, b) => sum + b.trueNew, 0);
      const totalTrueNew = v4TrueNew + v2TrueNew;

      const v4Durations = v4Batches.map(b => b.durationMs).sort((a, b) => a - b);
      const avgDuration = v4Durations.length > 0 ? (v4Durations.reduce((a, b) => a + b, 0) / v4Durations.length).toFixed(1) : 0;
      const p95Duration = v4Durations.length > 0 ? v4Durations[Math.floor(v4Durations.length * 0.95)] : 0;
      const maxDuration = v4Durations.length > 0 ? v4Durations[v4Durations.length - 1] : 0;

      console.log('\n--- BATCH STATS ---');
      console.log(`Total Batches: ${batches.length} (V2: ${v2Batches.length}, V4: ${v4Batches.length})`);
      console.log(`V4 True New: ${v4TrueNew} (${((v4TrueNew / totalTrueNew) * 100).toFixed(1)}%)`);
      console.log(`V2 True New: ${v2TrueNew} (${((v2TrueNew / totalTrueNew) * 100).toFixed(1)}%)`);
      console.log(`V4 Durations: Avg=${avgDuration}ms, P95=${p95Duration}ms, Max=${maxDuration}ms`);
    }
  }

  console.log('\n=== 6. READ TARGET COMMIT EVENTS FILE ===');
  const targetEventsPath = path.resolve('reports/atlas/realtime/target_commit_events.json');
  if (fs.existsSync(targetEventsPath)) {
    const events = JSON.parse(fs.readFileSync(targetEventsPath, 'utf8'));
    console.log('Target Commit Events count:', events.length);
    if (events.length > 0) {
      const firstEvent = events[0];
      const lastEvent = events[events.length - 1];
      console.log('First event ts:', new Date(firstEvent.ts).toISOString(), firstEvent.ts);
      console.log('Last event ts:', new Date(lastEvent.ts).toISOString(), lastEvent.ts);
      const durationSec = ((lastEvent.ts - firstEvent.ts) / 1000).toFixed(1);
      console.log(`Span between first & last recorded target event: ${durationSec}s (${(durationSec / 60).toFixed(1)} min)`);
    }
  }
}

runAudit().catch(e => {
  console.error('Audit failed:', e);
  process.exit(1);
});
