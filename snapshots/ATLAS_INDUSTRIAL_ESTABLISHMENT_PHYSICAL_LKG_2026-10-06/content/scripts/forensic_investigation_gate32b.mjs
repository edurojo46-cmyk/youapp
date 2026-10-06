import pg from 'pg';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const { Client } = pg;
const dbConfig = parseDbUrl();

async function main() {
  const client = new Client(dbConfig);
  await client.connect();
  try {
    console.log('=== FORENSIC INVESTIGATION GATE 32B ===');

    // 1. All rows created on or after Gate 32 (around 2026-09-18T23:00:00Z to now)
    const recentRes = await client.query(`
      SELECT 
        outbox_id, atlas_person_id, source_id, source_record_id, status,
        attempt_count, created_at, processing_started_at, processing_worker_id,
        published_at, last_error, quarantined_at,
        payload
      FROM public.atlas_search_outbox
      WHERE created_at >= '2026-09-18T20:00:00Z'
      ORDER BY created_at ASC;
    `);

    console.log(`Total rows created since 2026-09-18T20:00:00Z: ${recentRes.rows.length}`);

    // Let's break down by source_id for these recent rows
    const bySource = {};
    for (const r of recentRes.rows) {
      bySource[r.source_id] = (bySource[r.source_id] || 0) + 1;
    }
    console.log('Breakdown by source_id:', bySource);

    // Let's specifically inspect ARCA condition tributaria rows created recently
    const arcaRows = recentRes.rows.filter(r => r.source_id === 'ARCA_CONDICION_TRIBUTARIA');
    console.log(`ARCA rows created: ${arcaRows.length}`);

    // In Gate 32 canary: 10,000 processed -> 5,664 new canonical created.
    // In Gate 32 replay: 10,000 processed -> did any outbox rows get inserted? Or did Gate 32A canary create any?
    // Let's list timestamps of ARCA rows or sort by created_at
    if (arcaRows.length > 0) {
      const timestamps = arcaRows.map(r => r.created_at.toISOString());
      console.log('ARCA rows earliest created_at:', timestamps[0]);
      console.log('ARCA rows latest created_at:', timestamps[timestamps.length - 1]);
      
      // Let's see distinct created_at or batches
      const batchTimes = {};
      for (const t of timestamps) {
        // truncate to minute
        const min = t.slice(0, 16);
        batchTimes[min] = (batchTimes[min] || 0) + 1;
      }
      console.log('ARCA batches by minute:', batchTimes);
    }

    // Let's find any non-ARCA rows created since Gate 32 started (2026-09-18T23:00:00Z)
    const nonArcaRecent = recentRes.rows.filter(r => r.source_id !== 'ARCA_CONDICION_TRIBUTARIA');
    console.log(`Non-ARCA rows created since 2026-09-18T20:00:00Z: ${nonArcaRecent.length}`);
    for (const r of nonArcaRecent) {
      console.log('Non-ARCA row:', {
        outbox_id: r.outbox_id,
        atlas_person_id: r.atlas_person_id,
        source_id: r.source_id,
        created_at: r.created_at,
        status: r.status
      });
    }

    // Now let's find the exact 5,673 ARCA rows:
    // Why was it 5,673 instead of 5,664? 5,673 - 5,664 = exactly 9!
    // Let's group arcaRows by atlas_person_id to check for duplicate atlas_person_id in outbox!
    const personMap = new Map();
    for (const r of arcaRows) {
      if (!personMap.has(r.atlas_person_id)) {
        personMap.set(r.atlas_person_id, []);
      }
      personMap.get(r.atlas_person_id).push(r);
    }

    console.log(`Distinct atlas_person_id in ARCA rows: ${personMap.size}`);
    let duplicatePeople = 0;
    const duplicatedEntries = [];
    for (const [pid, rows] of personMap.entries()) {
      if (rows.length > 1) {
        duplicatePeople++;
        duplicatedEntries.push({ pid, count: rows.length, rows });
      }
    }
    console.log(`atlas_person_id with > 1 outbox row: ${duplicatePeople}`);
    if (duplicatedEntries.length > 0) {
      console.log('=== DUPLICATE OUTBOX ROWS FOUND! ===');
      for (const d of duplicatedEntries) {
        console.log(`Person ${d.pid} has ${d.count} outbox entries:`);
        for (const r of d.rows) {
          const payloadHash = crypto.createHash('sha256').update(JSON.stringify(r.payload)).digest('hex');
          console.log({
            outbox_id: r.outbox_id,
            atlas_person_id: r.atlas_person_id,
            source_id: r.source_id,
            source_record_id: r.source_record_id,
            status: r.status,
            created_at: r.created_at,
            processing_worker_id: r.processing_worker_id,
            payload_hash: payloadHash.slice(0, 16)
          });
        }
      }
    }

    // 2. Quarantine Audit
    console.log('\n=== QUARANTINE AUDIT (748 rows) ===');
    const quarRes = await client.query(`
      SELECT 
        source_id,
        last_error,
        count(*),
        min(created_at) as min_created,
        max(created_at) as max_created
      FROM public.atlas_search_outbox
      WHERE status = 'QUARANTINED'
      GROUP BY source_id, last_error
      ORDER BY count DESC;
    `);
    console.table(quarRes.rows);

    // 3. Processing Lease Audit (3050 rows)
    console.log('\n=== PROCESSING LEASE AUDIT (3050 rows) ===');
    const procRes = await client.query(`
      SELECT 
        source_id,
        processing_worker_id,
        count(*),
        min(processing_started_at) as min_started,
        max(processing_started_at) as max_started,
        EXTRACT(EPOCH FROM (now() - min(processing_started_at))) as max_lease_age_sec,
        EXTRACT(EPOCH FROM (now() - max(processing_started_at))) as min_lease_age_sec
      FROM public.atlas_search_outbox
      WHERE status = 'PROCESSING'
      GROUP BY source_id, processing_worker_id
      ORDER BY count DESC;
    `);
    console.table(procRes.rows);

    // 4. Pending Backlog Audit (2648 rows)
    console.log('\n=== PENDING BACKLOG AUDIT (2648 rows) ===');
    const pendRes = await client.query(`
      SELECT 
        source_id,
        count(*),
        min(created_at) as min_created,
        max(created_at) as max_created
      FROM public.atlas_search_outbox
      WHERE status = 'PENDING'
      GROUP BY source_id
      ORDER BY count DESC;
    `);
    console.table(pendRes.rows);

  } finally {
    await client.end();
  }
}

main().catch(console.error);
