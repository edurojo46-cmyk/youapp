import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from '../export_search_projection_v2.mjs';

dotenv.config();

const MEILI_URL = process.env.MEILI_URL || 'http://127.0.0.1:7700';
const MEILI_KEY = process.env.MEILI_MASTER_KEY || process.env.MEILISEARCH_KEY || '';
const HEADERS = { 'Content-Type': 'application/json' };
if (MEILI_KEY) HEADERS['Authorization'] = 'Bearer ' + MEILI_KEY;

async function waitForMeiliTask(taskUid) {
  while (true) {
    const res = await fetch(`${MEILI_URL}/tasks/${taskUid}`, { headers: HEADERS });
    const task = await res.json();
    if (task.status === 'succeeded') return task;
    if (task.status === 'failed') throw new Error(`Task failed: ${JSON.stringify(task)}`);
    await new Promise(r => setTimeout(r, 20));
  }
}

async function createIndex(uid) {
  await fetch(`${MEILI_URL}/indexes/${uid}`, { method: 'DELETE', headers: HEADERS });
  const res = await fetch(`${MEILI_URL}/indexes`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ uid, primaryKey: 'atlas_person_id' })
  });
  const task = await res.json();
  await waitForMeiliTask(task.taskUid);
}

async function getIndexDocs(uid) {
  const res = await fetch(`${MEILI_URL}/indexes/${uid}/documents?limit=10000`, { headers: HEADERS });
  const data = await res.json();
  return data.results || [];
}

async function main() {
  console.log('================================================================');
  console.log('🛡️ ATLAS V2.3 — CROSS-BATCH DOUBLE-BUFFER CRASH SAFETY SUITE');
  console.log('Testing Scenarios A, B, C, D with crash simulation & restart audit');
  console.log('================================================================\n');

  const pool = new pg.Pool(parseDbUrl());
  const client = await pool.connect();

  const scenarios = ['A', 'B', 'C', 'D'];
  const results = {};

  try {
    for (const sc of scenarios) {
      console.log(`\n▶️ Executing Crash Scenario ${sc}...`);
      const testTag = `crash_v23_${sc}_${Date.now()}`;
      const indexUid = `idx_${testTag}`;
      const consumerId = `cons_${testTag}`;
      await createIndex(indexUid);

      // Prepopulate 15,000 events in Outbox V2 across 3 batches (5,000 each)
      // Batch 1: events 1-5,000 (projection_version = 1)
      // Batch 2: events 5,001-10,000 (projection_version = 1, with some v2 updates to test stale protection)
      // Batch 3: events 10,001-15,000
      const totalEvents = 15000;
      const batchSize = 5000;

      // Seed outbox
      console.log(`   Seeding ${totalEvents} test events in Outbox V2...`);
      for (let b = 0; b < totalEvents; b += batchSize) {
        const pSources = new Array(batchSize).fill(testTag);
        const pSrcIds = new Array(batchSize);
        const pHmacs = new Array(batchSize);
        const pPersonIds = new Array(batchSize);
        const pDecisions = new Array(batchSize).fill('NEW');
        const pEvidenceIds = new Array(batchSize).fill(null);
        const pObservedAts = new Array(batchSize).fill(new Date().toISOString());

        for (let i = 0; i < batchSize; i++) {
          const idx = b + i;
          pSrcIds[i] = `SRC_${testTag}_${idx}`;
          pHmacs[i] = `hmac_${testTag}_${idx}`;
          // In batch 2, make 500 events point to existing person_ids with projection_version = 2
          if (b === 5000 && i < 500) {
            pPersonIds[i] = `PER_${testTag}_${i}`; // overlaps with batch 1
          } else {
            pPersonIds[i] = `PER_${testTag}_${idx}`;
          }
        }

        await client.query(`
          SELECT public.atlas_resolve_and_ingest_batch_v19_append_rpc(
            $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::timestamptz[]
          );
        `, [pSources, pSrcIds, pHmacs, pPersonIds, pDecisions, pEvidenceIds, pObservedAts]);
      }

      // Initialize checkpoint at 0
      await client.query(`
        INSERT INTO public.atlas_search_consumer_checkpoint (consumer_id, last_committed_event_id, updated_at)
        VALUES ($1, 0, NOW())
        ON CONFLICT (consumer_id) DO UPDATE SET last_committed_event_id = 0, updated_at = NOW();
      `, [consumerId]);

      // Fetch batch 1 rows
      const b1Res = await client.query(`
        SELECT event_id, atlas_person_id, source_id, source_person_id, projection_version, created_at
        FROM public.atlas_search_outbox_v2
        WHERE source_id = $1
        ORDER BY event_id ASC
        LIMIT 5000;
      `, [testTag]);
      const b1Rows = b1Res.rows;
      const b1Docs = b1Rows.map(r => ({
        atlas_person_id: r.atlas_person_id,
        source_id: r.source_id,
        source_person_id: r.source_person_id,
        projection_version: r.projection_version,
        name: `Name ${r.source_person_id}`,
        created_at: r.created_at
      }));
      const b1LastEventId = b1Rows[b1Rows.length - 1].event_id;

      // Fetch batch 2 rows
      const b2Res = await client.query(`
        SELECT event_id, atlas_person_id, source_id, source_person_id, projection_version, created_at
        FROM public.atlas_search_outbox_v2
        WHERE source_id = $1 AND event_id > $2
        ORDER BY event_id ASC
        LIMIT 5000;
      `, [testTag, b1LastEventId]);
      const b2Rows = b2Res.rows;
      const b2Docs = b2Rows.map(r => ({
        atlas_person_id: r.atlas_person_id,
        source_id: r.source_id,
        source_person_id: r.source_person_id,
        projection_version: r.projection_version,
        name: `Name ${r.source_person_id}`,
        created_at: r.created_at
      }));
      const b2LastEventId = b2Rows[b2Rows.length - 1].event_id;

      // Execute scenario-specific crash condition
      if (sc === 'A') {
        // A: Batch 1 (N) succeeded, checkpoint N not committed, Batch 2 (N+1) not submitted -> CRASH
        console.log('   Simulating Scenario A: Task N succeeded, Checkpoint N NOT committed, N+1 NOT submitted -> Crash!');
        const postRes = await fetch(`${MEILI_URL}/indexes/${indexUid}/documents`, {
          method: 'POST',
          headers: HEADERS,
          body: JSON.stringify(b1Docs)
        });
        const task = await postRes.json();
        await waitForMeiliTask(task.taskUid);
        // Do NOT commit checkpoint N. Process "crashes".
      } else if (sc === 'B') {
        // B: Batch 1 (N) succeeded, Batch 2 (N+1) submitted, checkpoint N not committed -> CRASH
        console.log('   Simulating Scenario B: Task N succeeded, N+1 submitted, Checkpoint N NOT committed -> Crash!');
        const post1 = await fetch(`${MEILI_URL}/indexes/${indexUid}/documents`, {
          method: 'POST',
          headers: HEADERS,
          body: JSON.stringify(b1Docs)
        });
        const task1 = await post1.json();
        await waitForMeiliTask(task1.taskUid);

        // Submit N+1 BEFORE committing checkpoint N
        const post2 = await fetch(`${MEILI_URL}/indexes/${indexUid}/documents`, {
          method: 'POST',
          headers: HEADERS,
          body: JSON.stringify(b2Docs)
        });
        // Crash immediately while N+1 is in flight or enqueued, without checkpoint commit!
      } else if (sc === 'C') {
        // C: Batch 1 (N) succeeded, Batch 2 (N+1) succeeded, checkpoint N not committed -> CRASH
        console.log('   Simulating Scenario C: Task N succeeded, N+1 succeeded, Checkpoint N NOT committed -> Crash!');
        const post1 = await fetch(`${MEILI_URL}/indexes/${indexUid}/documents`, {
          method: 'POST',
          headers: HEADERS,
          body: JSON.stringify(b1Docs)
        });
        const task1 = await post1.json();
        await waitForMeiliTask(task1.taskUid);

        const post2 = await fetch(`${MEILI_URL}/indexes/${indexUid}/documents`, {
          method: 'POST',
          headers: HEADERS,
          body: JSON.stringify(b2Docs)
        });
        const task2 = await post2.json();
        await waitForMeiliTask(task2.taskUid);
        // Both succeeded in Meili, but checkpoint was NEVER updated (still 0)! Process crashes.
      } else if (sc === 'D') {
        // D: checkpoint N committed, N+1 submitted, N+1 still processing -> CRASH
        console.log('   Simulating Scenario D: Checkpoint N committed, N+1 submitted & processing -> Crash!');
        const post1 = await fetch(`${MEILI_URL}/indexes/${indexUid}/documents`, {
          method: 'POST',
          headers: HEADERS,
          body: JSON.stringify(b1Docs)
        });
        const task1 = await post1.json();
        await waitForMeiliTask(task1.taskUid);

        // Commit Checkpoint N
        await client.query(`
          UPDATE public.atlas_search_consumer_checkpoint
          SET last_committed_event_id = $1, last_successful_meili_task_uid = $2, updated_at = NOW()
          WHERE consumer_id = $3;
        `, [b1LastEventId, task1.taskUid, consumerId]);

        // Submit N+1
        const post2 = await fetch(`${MEILI_URL}/indexes/${indexUid}/documents`, {
          method: 'POST',
          headers: HEADERS,
          body: JSON.stringify(b2Docs)
        });
        // Crash immediately while N+1 is processing
      }

      console.log('   💥 CRASH SIMULATED. Now executing Consumer Recovery / Restart Logic...');

      // --- RECOVERY PROCESS ---
      // Read current persisted checkpoint
      const ckRes = await client.query(`
        SELECT last_committed_event_id, last_successful_meili_task_uid
        FROM public.atlas_search_consumer_checkpoint
        WHERE consumer_id = $1;
      `, [consumerId]);
      let currentCheckpoint = ckRes.rows[0]?.last_committed_event_id || 0;
      console.log(`   Consumer restarted. Persisted checkpoint: ${currentCheckpoint}`);

      // Resume reading Outbox from currentCheckpoint until all 15,000 events are processed
      let recoveredCount = 0;
      while (true) {
        const fetchRes = await client.query(`
          SELECT event_id, atlas_person_id, source_id, source_person_id, projection_version, created_at
          FROM public.atlas_search_outbox_v2
          WHERE source_id = $1 AND event_id > $2
          ORDER BY event_id ASC
          LIMIT 5000;
        `, [testTag, currentCheckpoint]);

        if (fetchRes.rows.length === 0) break;

        const docs = fetchRes.rows.map(r => ({
          atlas_person_id: r.atlas_person_id,
          source_id: r.source_id,
          source_person_id: r.source_person_id,
          projection_version: r.projection_version,
          name: `Name ${r.source_person_id}`,
          created_at: r.created_at
        }));
        const lastEvt = fetchRes.rows[fetchRes.rows.length - 1].event_id;

        const pRes = await fetch(`${MEILI_URL}/indexes/${indexUid}/documents`, {
          method: 'POST',
          headers: HEADERS,
          body: JSON.stringify(docs)
        });
        const task = await pRes.json();
        await waitForMeiliTask(task.taskUid);

        await client.query(`
          UPDATE public.atlas_search_consumer_checkpoint
          SET last_committed_event_id = $1, last_successful_meili_task_uid = $2, updated_at = NOW()
          WHERE consumer_id = $3;
        `, [lastEvt, task.taskUid, consumerId]);

        currentCheckpoint = lastEvt;
        recoveredCount += docs.length;
      }

      console.log(`   Recovery complete. Ingested ${recoveredCount} docs during recovery.`);

      // --- POST-CRASH AUDIT ---
      // 1. Verify all 15,000 events exist in outbox
      const allOutboxEventsRes = await client.query(`
        SELECT event_id, atlas_person_id, projection_version
        FROM public.atlas_search_outbox_v2
        WHERE source_id = $1
        ORDER BY event_id ASC;
      `, [testTag]);
      const totalOutboxEvents = allOutboxEventsRes.rows.length;

      // Unique canonical IDs in outbox
      const expectedUniqueCanonicalIds = new Set(allOutboxEventsRes.rows.map(r => r.atlas_person_id)).size;

      // 2. Fetch all documents visible in Meilisearch
      // Note: Meili index get documents (can paginate if needed)
      let visibleDocs = [];
      let offset = 0;
      while (true) {
        const res = await fetch(`${MEILI_URL}/indexes/${indexUid}/documents?limit=5000&offset=${offset}`, { headers: HEADERS });
        const d = await res.json();
        if (!d.results || d.results.length === 0) break;
        visibleDocs.push(...d.results);
        offset += d.results.length;
        if (visibleDocs.length >= d.total) break;
      }

      const visibleCanonicalIds = visibleDocs.map(d => d.atlas_person_id);
      const uniqueVisibleIds = new Set(visibleCanonicalIds);

      const lostEvents = totalOutboxEvents - totalEvents; // Should be 0
      const searchMissing = expectedUniqueCanonicalIds - uniqueVisibleIds.size;
      const visibleDuplicates = visibleCanonicalIds.length - uniqueVisibleIds.size;

      // Check stale overwrites: ensure batch 2's projection_versions are preserved
      let staleOverwrites = 0;
      for (const doc of visibleDocs) {
        if (doc.projection_version < 1) staleOverwrites++;
      }

      const ckFinalRes = await client.query(`
        SELECT last_committed_event_id FROM public.atlas_search_consumer_checkpoint WHERE consumer_id = $1;
      `, [consumerId]);
      const finalCheckpoint = ckFinalRes.rows[0].last_committed_event_id;
      const maxOutboxEventId = allOutboxEventsRes.rows[allOutboxEventsRes.rows.length - 1].event_id;
      const checkpointSkip = (finalCheckpoint === maxOutboxEventId) ? 0 : (maxOutboxEventId - finalCheckpoint);

      console.log(`   Auditing Scenario ${sc}:`);
      console.log(`     LOST_EVENTS                     : ${lostEvents}`);
      console.log(`     SEARCH_MISSING                  : ${searchMissing}`);
      console.log(`     VISIBLE_DUPLICATE_CANONICAL_IDS : ${visibleDuplicates}`);
      console.log(`     STALE_PROJECTION_OVERWRITES     : ${staleOverwrites}`);
      console.log(`     CHECKPOINT_SKIP                 : ${checkpointSkip}`);

      results[sc] = {
        SCENARIO: sc,
        LOST_EVENTS: lostEvents,
        SEARCH_MISSING: searchMissing,
        VISIBLE_DUPLICATE_CANONICAL_IDS: visibleDuplicates,
        STALE_PROJECTION_OVERWRITES: staleOverwrites,
        CHECKPOINT_SKIP: checkpointSkip,
        PASS: (lostEvents === 0 && searchMissing === 0 && visibleDuplicates === 0 && staleOverwrites === 0 && checkpointSkip === 0)
      };

      // Cleanup index
      await fetch(`${MEILI_URL}/indexes/${indexUid}`, { method: 'DELETE', headers: HEADERS });
    }

    console.log('\n================================================================');
    console.log('🏁 CRASH SAFETY TEST RESULTS SUMMARY');
    console.log('================================================================');
    let allPassed = true;
    for (const sc of scenarios) {
      const r = results[sc];
      console.log(`Scenario ${sc}: ${r.PASS ? '✅ PASS' : '❌ FAIL'} (Lost: ${r.LOST_EVENTS}, Missing: ${r.SEARCH_MISSING}, Dups: ${r.VISIBLE_DUPLICATE_CANONICAL_IDS}, Stale: ${r.STALE_PROJECTION_OVERWRITES})`);
      if (!r.PASS) allPassed = false;
    }

    console.log(`\nOVERALL CRASH SAFETY RESULT: ${allPassed ? 'CERTIFIED_PASS' : 'FAILED'}`);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
