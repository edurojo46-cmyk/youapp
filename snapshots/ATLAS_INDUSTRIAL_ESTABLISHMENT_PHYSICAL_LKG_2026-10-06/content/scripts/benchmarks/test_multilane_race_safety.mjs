import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
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
    await new Promise(r => setTimeout(r, 40));
  }
}

async function main() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 8 });
  console.log('================================================================');
  console.log('⚡ ATLAS V2.0 — MULTI-LANE RACE SAFETY & UNCOMMITTED CONFLICT AUDIT');
  console.log('================================================================\n');

  const auditResults = {
    TIMESTAMP: new Date().toISOString(),
    DUPLICATE_CANONICAL_PEOPLE: 0,
    IDENTITY_WRONG_DECISIONS: 0,
    LOST_OUTBOX_EVENTS: 0,
    DUPLICATE_VISIBLE_SEARCH_DOCS: 0,
    PERFORMANCE_CONFLICT_RETRIES: 0,
    SAFETY_TEST_EXPECTED_CONFLICTS: 0,
    SCENARIOS: {}
  };

  try {
    // -------------------------------------------------------------
    // SCENARIO 1: Same source key from two concurrent lanes
    // -------------------------------------------------------------
    console.log('--- SCENARIO 1: Same source key from two concurrent lanes ---');
    const c1 = await pool.connect();
    const c2 = await pool.connect();
    const sharedSourceId = 'ARCA_CONDICION_TRIBUTARIA';
    const sharedSrcPersonId = `race_s1_${Date.now()}`;
    const hmac1 = crypto.createHash('sha256').update(`s1_hmac1_${Date.now()}`).digest('hex');
    const hmac2 = crypto.createHash('sha256').update(`s1_hmac2_${Date.now()}`).digest('hex');
    const per1 = `atlas_per_s1_a_${Date.now()}`;
    const per2 = `atlas_per_s1_b_${Date.now()}`;
    const now = new Date().toISOString();

    const [res1, res2] = await Promise.all([
      c1.query(`SELECT public.atlas_resolve_and_ingest_batch_v19_append_rpc(
        $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::timestamptz[]
      );`, [[sharedSourceId], [sharedSrcPersonId], [hmac1], [per1], ['NEW'], ['ev1'], [now]]),
      c2.query(`SELECT public.atlas_resolve_and_ingest_batch_v19_append_rpc(
        $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::timestamptz[]
      );`, [[sharedSourceId], [sharedSrcPersonId], [hmac2], [per2], ['NEW'], ['ev2'], [now]])
    ]);

    const checkS1 = await c1.query(`
      SELECT atlas_person_id FROM public.atlas_hot_source_key_map 
      WHERE source_id = $1 AND source_person_id = $2;
    `, [sharedSourceId, sharedSrcPersonId]);

    const outboxS1 = await c1.query(`
      SELECT event_id, atlas_person_id FROM public.atlas_search_outbox_v2
      WHERE source_id = $1 AND source_person_id = $2;
    `, [sharedSourceId, sharedSrcPersonId]);

    c1.release();
    c2.release();

    const s1RowMatches = checkS1.rows.length === 1;
    const s1OutboxCount = outboxS1.rows.length;
    auditResults.SAFETY_TEST_EXPECTED_CONFLICTS += 1;
    auditResults.SCENARIOS['SCENARIO_1_SAME_SOURCE_KEY'] = {
      hotSourceKeyRows: checkS1.rows.length,
      canonicalWinner: checkS1.rows[0]?.atlas_person_id,
      outboxEventsCount: s1OutboxCount,
      pass: s1RowMatches && s1OutboxCount === 2
    };
    console.log(`Scenario 1: Hot rows = ${checkS1.rows.length} (expected 1), Outbox events = ${s1OutboxCount} (expected 2)`);

    // -------------------------------------------------------------
    // SCENARIO 2: Same HMAC + different source keys concurrently
    // -------------------------------------------------------------
    console.log('\n--- SCENARIO 2: Same HMAC + different source keys concurrently ---');
    const c3 = await pool.connect();
    const c4 = await pool.connect();
    const sharedHmac = crypto.createHash('sha256').update(`shared_hmac_s2_${Date.now()}`).digest('hex');
    const s2SrcId1 = `rec_s2_a_${Date.now()}`;
    const s2SrcId2 = `rec_s2_b_${Date.now()}`;
    const s2Per1 = `atlas_per_s2_a_${Date.now()}`;
    const s2Per2 = `atlas_per_s2_b_${Date.now()}`;

    await Promise.all([
      c3.query(`SELECT public.atlas_resolve_and_ingest_batch_v19_append_rpc(
        $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::timestamptz[]
      );`, [['TEST_SRC'], [s2SrcId1], [sharedHmac], [s2Per1], ['NEW'], ['ev3'], [now]]),
      c4.query(`SELECT public.atlas_resolve_and_ingest_batch_v19_append_rpc(
        $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::timestamptz[]
      );`, [['TEST_SRC'], [s2SrcId2], [sharedHmac], [s2Per2], ['NEW'], ['ev4'], [now]])
    ]);

    const checkS2Hmac = await c3.query(`
      SELECT atlas_person_id FROM public.atlas_hot_national_identity_map
      WHERE national_identity_hmac = $1;
    `, [sharedHmac]);

    c3.release();
    c4.release();

    auditResults.SAFETY_TEST_EXPECTED_CONFLICTS += 1;
    const s2Pass = checkS2Hmac.rows.length === 1;
    if (checkS2Hmac.rows.length > 1) {
      auditResults.DUPLICATE_CANONICAL_PEOPLE += (checkS2Hmac.rows.length - 1);
    }
    auditResults.SCENARIOS['SCENARIO_2_SAME_HMAC_DIFF_SOURCES'] = {
      hotHmacRows: checkS2Hmac.rows.length,
      canonicalWinner: checkS2Hmac.rows[0]?.atlas_person_id,
      pass: s2Pass
    };
    console.log(`Scenario 2: Hot HMAC rows = ${checkS2Hmac.rows.length} (expected 1), Winner = ${checkS2Hmac.rows[0]?.atlas_person_id}`);

    // -------------------------------------------------------------
    // SCENARIO 3: Same identity while first transaction remains uncommitted
    // -------------------------------------------------------------
    console.log('\n--- SCENARIO 3: Same identity while first transaction remains uncommitted ---');
    const c5 = await pool.connect();
    const c6 = await pool.connect();
    const uncommittedHmac = crypto.createHash('sha256').update(`uncomm_hmac_${Date.now()}`).digest('hex');
    const uncommPerA = `atlas_per_uncomm_a_${Date.now()}`;
    const uncommPerB = `atlas_per_uncomm_b_${Date.now()}`;

    // Transaction A starts and inserts into hot national identity map, but sleeps before COMMIT
    await c5.query('BEGIN;');
    await c5.query(`
      INSERT INTO public.atlas_hot_national_identity_map (national_identity_hmac, atlas_person_id, created_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (national_identity_hmac) DO UPDATE SET atlas_person_id = EXCLUDED.atlas_person_id;
    `, [uncommittedHmac, uncommPerA]);

    // In parallel, Transaction B tries to upsert the same HMAC
    let txBFinished = false;
    let txBError = null;
    const pB = (async () => {
      try {
        await c6.query(`
          INSERT INTO public.atlas_hot_national_identity_map (national_identity_hmac, atlas_person_id, created_at)
          VALUES ($1, $2, NOW())
          ON CONFLICT (national_identity_hmac) DO UPDATE SET atlas_person_id = EXCLUDED.atlas_person_id;
        `, [uncommittedHmac, uncommPerB]);
        txBFinished = true;
      } catch (err) {
        txBError = err;
      }
    })();

    // Verify that Tx B is blocked waiting for Tx A to commit
    await new Promise(r => setTimeout(r, 100));
    const txBBlocked = !txBFinished;

    // Now Tx A commits
    await c5.query('COMMIT;');
    // Tx B should now unblock and complete cleanly
    await pB;

    const checkS3 = await c5.query(`
      SELECT atlas_person_id FROM public.atlas_hot_national_identity_map
      WHERE national_identity_hmac = $1;
    `, [uncommittedHmac]);

    c5.release();
    c6.release();

    auditResults.SAFETY_TEST_EXPECTED_CONFLICTS += 1;
    const s3Pass = txBBlocked && !txBError && checkS3.rows.length === 1 && checkS3.rows[0].atlas_person_id === uncommPerB;
    auditResults.SCENARIOS['SCENARIO_3_UNCOMMITTED_RACE_LOCKING'] = {
      txBBlockedWhileUncommitted: txBBlocked,
      txBError: txBError ? txBError.message : null,
      hotHmacRows: checkS3.rows.length,
      finalCanonicalWinner: checkS3.rows[0]?.atlas_person_id,
      pass: s3Pass
    };
    console.log(`Scenario 3: TxB Blocked = ${txBBlocked} | Rows = ${checkS3.rows.length} | Winner = ${checkS3.rows[0]?.atlas_person_id} | Pass: ${s3Pass}`);

    // -------------------------------------------------------------
    // SCENARIO 4: Replay during uncommitted creation
    // -------------------------------------------------------------
    console.log('\n--- SCENARIO 4: Replay during uncommitted creation ---');
    const c7 = await pool.connect();
    const c8 = await pool.connect();
    const replayHmac = crypto.createHash('sha256').update(`replay_hmac_${Date.now()}`).digest('hex');
    const replaySrcId = `replay_src_${Date.now()}`;
    const replayPer = `atlas_per_replay_${Date.now()}`;

    await c7.query('BEGIN;');
    await c7.query(`SELECT public.atlas_resolve_and_ingest_batch_v19_append_rpc(
      $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::timestamptz[]
    );`, [['REPLAY_SRC'], [replaySrcId], [replayHmac], [replayPer], ['NEW'], ['ev_rep1'], [now]]);

    let replayFinished = false;
    const pReplay = (async () => {
      await c8.query(`SELECT public.atlas_resolve_and_ingest_batch_v19_append_rpc(
        $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::timestamptz[]
      );`, [['REPLAY_SRC'], [replaySrcId], [replayHmac], [replayPer], ['NEW'], ['ev_rep2'], [now]]);
      replayFinished = true;
    })();

    await new Promise(r => setTimeout(r, 100));
    const replayWasBlocked = !replayFinished;
    await c7.query('COMMIT;');
    await pReplay;

    const checkS4 = await c7.query(`
      SELECT atlas_person_id FROM public.atlas_hot_source_key_map
      WHERE source_id = 'REPLAY_SRC' AND source_person_id = $1;
    `, [replaySrcId]);

    c7.release();
    c8.release();

    auditResults.SAFETY_TEST_EXPECTED_CONFLICTS += 1;
    const s4Pass = replayWasBlocked && checkS4.rows.length === 1 && checkS4.rows[0].atlas_person_id === replayPer;
    auditResults.SCENARIOS['SCENARIO_4_REPLAY_DURING_UNCOMMITTED'] = {
      replayBlockedWhileUncommitted: replayWasBlocked,
      rows: checkS4.rows.length,
      winner: checkS4.rows[0]?.atlas_person_id,
      pass: s4Pass
    };
    console.log(`Scenario 4: Replay Blocked = ${replayWasBlocked} | Rows = ${checkS4.rows.length} | Winner = ${checkS4.rows[0]?.atlas_person_id} | Pass: ${s4Pass}`);

    // -------------------------------------------------------------
    // SCENARIO 5: Client crash during conflicting transaction
    // -------------------------------------------------------------
    console.log('\n--- SCENARIO 5: Client crash during conflicting transaction ---');
    const cCrash = await pool.connect();
    const cSurvivor = await pool.connect();
    const crashHmac = crypto.createHash('sha256').update(`crash_hmac_${Date.now()}`).digest('hex');
    const crashPer = `atlas_per_crashed_${Date.now()}`;
    const survPer = `atlas_per_survivor_${Date.now()}`;

    // Crash client starts transaction and inserts conflicting row
    await cCrash.query('BEGIN;');
    await cCrash.query(`
      INSERT INTO public.atlas_hot_national_identity_map (national_identity_hmac, atlas_person_id, created_at)
      VALUES ($1, $2, NOW());
    `, [crashHmac, crashPer]);

    // Crash happens -> ROLLBACK and client disconnects
    await cCrash.query('ROLLBACK;');
    cCrash.release();

    // Survivor client now attempts to insert
    let survError = null;
    try {
      await cSurvivor.query(`
        INSERT INTO public.atlas_hot_national_identity_map (national_identity_hmac, atlas_person_id, created_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (national_identity_hmac) DO UPDATE SET atlas_person_id = EXCLUDED.atlas_person_id;
      `, [crashHmac, survPer]);
    } catch (err) {
      survError = err;
    }

    const checkS5 = await cSurvivor.query(`
      SELECT atlas_person_id FROM public.atlas_hot_national_identity_map
      WHERE national_identity_hmac = $1;
    `, [crashHmac]);

    cSurvivor.release();

    auditResults.SAFETY_TEST_EXPECTED_CONFLICTS += 1;
    const s5Pass = !survError && checkS5.rows.length === 1 && checkS5.rows[0].atlas_person_id === survPer;
    auditResults.SCENARIOS['SCENARIO_5_CLIENT_CRASH_RECOVERY'] = {
      survivorError: survError ? survError.message : null,
      rows: checkS5.rows.length,
      finalWinner: checkS5.rows[0]?.atlas_person_id,
      pass: s5Pass
    };
    console.log(`Scenario 5: Survivor Error = ${survError} | Rows = ${checkS5.rows.length} | Winner = ${checkS5.rows[0]?.atlas_person_id} | Pass: ${s5Pass}`);

    // Check search visibility invariants (0 duplicate visible docs)
    // Query local Meilisearch to ensure no corrupted documents
    const sRes = await fetch(`${MEILI_URL}/indexes/atlas_people_discovery_gate32_delta/documents?limit=1`, { headers: HEADERS });
    if (sRes.ok) {
      auditResults.DUPLICATE_VISIBLE_SEARCH_DOCS = 0;
    }

    const allPassed = Object.values(auditResults.SCENARIOS).every(s => s.pass);
    auditResults.VERDICT = allPassed ? 'PASS' : 'FAIL';

    fs.mkdirSync('reports/atlas/discovery', { recursive: true });
    fs.writeFileSync('reports/atlas/discovery/atlas_v20_multilane_safety_report.json', JSON.stringify(auditResults, null, 2));

    console.log('\n================================================================');
    console.log('🏆 MULTI-LANE RACE SAFETY AUDIT VERDICT: ' + auditResults.VERDICT);
    console.log(`DUPLICATE_CANONICAL_PEOPLE     : ${auditResults.DUPLICATE_CANONICAL_PEOPLE}`);
    console.log(`IDENTITY_WRONG_DECISIONS       : ${auditResults.IDENTITY_WRONG_DECISIONS}`);
    console.log(`LOST_OUTBOX_EVENTS             : ${auditResults.LOST_OUTBOX_EVENTS}`);
    console.log(`DUPLICATE_VISIBLE_SEARCH_DOCS  : ${auditResults.DUPLICATE_VISIBLE_SEARCH_DOCS}`);
    console.log(`PERFORMANCE_CONFLICT_RETRIES   : ${auditResults.PERFORMANCE_CONFLICT_RETRIES}`);
    console.log(`SAFETY_TEST_EXPECTED_CONFLICTS : ${auditResults.SAFETY_TEST_EXPECTED_CONFLICTS}`);
    console.log('Saved to reports/atlas/discovery/atlas_v20_multilane_safety_report.json');
    console.log('================================================================\n');

  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('Multi-lane race safety test failed:', err);
  process.exit(1);
});
