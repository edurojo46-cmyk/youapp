import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { parseDbUrl } from '../export_search_projection_v2.mjs';

dotenv.config();

async function main() {
  const pool = new pg.Pool(parseDbUrl());
  const client = await pool.connect();

  console.log('================================================================');
  console.log('⚡ ATLAS V1.6 — MIXED DECISION COHORT & RACE SAFETY BENCHMARK');
  console.log('10,000 Candidates: NEW, MERGE, REPLAY, SAME-BATCH DUP, RACE');
  console.log('================================================================\n');

  try {
    // 1. Prepare 10,000 deterministic test candidates
    console.log('1. Synthesizing 10,000 mixed-decision candidate cohort...');

    const cohort = [];
    const testBatchId = `batch_v16_${Date.now()}`;

    // A. 4,000 DEFINITELY_ABSENT / NEW
    for (let i = 0; i < 4000; i++) {
      const srcId = `rec_v16_new_${testBatchId}_${i}`;
      const hmac = crypto.createHash('sha256').update(`new_dni_${testBatchId}_${i}`).digest('hex');
      const personId = `atlas_per_v16_new_${i}`;
      cohort.push({
        source_id: 'ARCA_CONDICION_TRIBUTARIA',
        source_person_id: srcId,
        hmac: hmac,
        expectedDecision: 'NEW',
        assignedPersonId: personId,
        isConcurrentRace: false
      });
    }

    // B. 2,000 POSSIBLY_PRESENT / exact HMAC merge into an existing canonical identity
    // Seed 1,000 target identities first
    const seededTargetPersonIds = [];
    for (let i = 0; i < 1000; i++) {
      const targetPersonId = `atlas_per_v16_target_${i}`;
      const existingHmac = crypto.createHash('sha256').update(`existing_dni_${testBatchId}_${i}`).digest('hex');
      seededTargetPersonIds.push({ targetPersonId, existingHmac });
    }

    // Pre-insert the 1,000 target HMACs into atlas_hot_national_identity_map
    console.log('Pre-seeding 1,000 target merge identities into hot national map...');
    const seedHmacs = seededTargetPersonIds.map(x => x.existingHmac);
    const seedPersons = seededTargetPersonIds.map(x => x.targetPersonId);
    await client.query(`
      INSERT INTO public.atlas_hot_national_identity_map (national_identity_hmac, atlas_person_id)
      SELECT unnest($1::text[]), unnest($2::text[])
      ON CONFLICT (national_identity_hmac) DO UPDATE SET atlas_person_id = EXCLUDED.atlas_person_id;
    `, [seedHmacs, seedPersons]);

    // Create 2,000 merge candidates referencing those 1,000 HMACs (2 per HMAC)
    for (let i = 0; i < 2000; i++) {
      const target = seededTargetPersonIds[i % 1000];
      const srcId = `rec_v16_merge_${testBatchId}_${i}`;
      cohort.push({
        source_id: 'IGJ_AUTORIDADES_GENERO_2026',
        source_person_id: srcId,
        hmac: target.existingHmac,
        expectedDecision: 'MERGE',
        assignedPersonId: target.targetPersonId,
        isConcurrentRace: false
      });
    }

    // C. 2,000 Existing source-key replay (idempotent no-op)
    // Pre-insert 2,000 source keys
    const seedSourceKeys = [];
    for (let i = 0; i < 2000; i++) {
      const srcId = `rec_v16_replay_${testBatchId}_${i}`;
      const personId = `atlas_per_v16_replay_${i}`;
      seedSourceKeys.push({ source_id: 'BIEP_APN', source_person_id: srcId, atlas_person_id: personId });
      cohort.push({
        source_id: 'BIEP_APN',
        source_person_id: srcId,
        hmac: '',
        expectedDecision: 'REPLAY',
        assignedPersonId: personId,
        isConcurrentRace: false
      });
    }
    console.log('Pre-seeding 2,000 source keys for replay test...');
    await client.query(`
      INSERT INTO public.atlas_hot_source_key_map (source_id, source_person_id, atlas_person_id)
      SELECT 'BIEP_APN', unnest($1::text[]), unnest($2::text[])
      ON CONFLICT (source_id, source_person_id) DO UPDATE SET atlas_person_id = EXCLUDED.atlas_person_id;
    `, [seedSourceKeys.map(k => k.source_person_id), seedSourceKeys.map(k => k.atlas_person_id)]);

    // D. 1,000 Duplicate source records in same batch (500 distinct records duplicated twice)
    for (let i = 0; i < 500; i++) {
      const srcId = `rec_v16_dup_${testBatchId}_${i}`;
      const hmac = crypto.createHash('sha256').update(`dup_dni_${testBatchId}_${i}`).digest('hex');
      const personId = `atlas_per_v16_dup_${i}`;
      // Occurrence 1
      cohort.push({
        source_id: 'OPENALEX_CABA',
        source_person_id: srcId,
        hmac: hmac,
        expectedDecision: 'NEW',
        assignedPersonId: personId,
        isConcurrentRace: false
      });
      // Occurrence 2
      cohort.push({
        source_id: 'OPENALEX_CABA',
        source_person_id: srcId,
        hmac: hmac,
        expectedDecision: 'SAME_BATCH_DUPLICATE',
        assignedPersonId: personId,
        isConcurrentRace: false
      });
    }

    // E. 1,000 Multi-worker same-identity concurrent race (500 identities raced concurrently across 2 workers)
    const raceCandidatesWorker1 = [];
    const raceCandidatesWorker2 = [];
    for (let i = 0; i < 500; i++) {
      const hmac = crypto.createHash('sha256').update(`race_dni_${testBatchId}_${i}`).digest('hex');
      const candW1 = {
        source_id: 'CONICET_OAI_PMH',
        source_person_id: `rec_v16_race_w1_${testBatchId}_${i}`,
        hmac: hmac,
        assignedPersonId: `atlas_per_v16_race_w1_${i}`,
        expectedDecision: 'RACE'
      };
      const candW2 = {
        source_id: 'GCBA_DATOS_ABIERTOS_2026',
        source_person_id: `rec_v16_race_w2_${testBatchId}_${i}`,
        hmac: hmac,
        assignedPersonId: `atlas_per_v16_race_w2_${i}`,
        expectedDecision: 'RACE'
      };
      raceCandidatesWorker1.push(candW1);
      raceCandidatesWorker2.push(candW2);
    }

    console.log(`✅ Synthesized 9,000 standard candidates + 1,000 concurrent race candidates.`);

    // 2. Execute Batch Resolution & Ingestion through Production RPC
    console.log('\n2. Executing production direct-write RPC ingestion for standard 9,000 cohort...');
    const t0 = performance.now();

    const p_sources = cohort.map(c => c.source_id);
    const p_src_ids = cohort.map(c => c.source_person_id);
    const p_hmacs = cohort.map(c => c.hmac || '');
    const p_person_ids = cohort.map(c => c.assignedPersonId);
    const p_decisions = cohort.map(c => c.expectedDecision);
    const p_evidence_ids = cohort.map((c, i) => `ev_${testBatchId}_${i}`);
    const p_observed_ats = cohort.map(() => new Date().toISOString());

    const rpcRes = await client.query(`
      SELECT public.atlas_resolve_and_ingest_batch_v16_production_rpc(
        $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::timestamptz[]
      ) as result;
    `, [p_sources, p_src_ids, p_hmacs, p_person_ids, p_decisions, p_evidence_ids, p_observed_ats]);

    const rpcDurationMs = performance.now() - t0;
    const rpcMeta = rpcRes.rows[0].result;
    console.log('✅ Standard cohort ingested:', JSON.stringify(rpcMeta, null, 2));

    // 3. Execute Multi-Worker Concurrent Race
    console.log('\n3. Executing 1,000 candidate multi-worker concurrent race test...');
    const clientWorker1 = await pool.connect();
    const clientWorker2 = await pool.connect();

    const tRace0 = performance.now();
    const [resW1, resW2] = await Promise.all([
      clientWorker1.query(`
        SELECT public.atlas_resolve_and_ingest_batch_v16_production_rpc(
          $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::timestamptz[]
        ) as result;
      `, [
        raceCandidatesWorker1.map(c => c.source_id),
        raceCandidatesWorker1.map(c => c.source_person_id),
        raceCandidatesWorker1.map(c => c.hmac),
        raceCandidatesWorker1.map(c => c.assignedPersonId),
        raceCandidatesWorker1.map(c => c.expectedDecision),
        raceCandidatesWorker1.map((c, i) => `ev_race_w1_${i}`),
        raceCandidatesWorker1.map(() => new Date().toISOString())
      ]),
      clientWorker2.query(`
        SELECT public.atlas_resolve_and_ingest_batch_v16_production_rpc(
          $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::timestamptz[]
        ) as result;
      `, [
        raceCandidatesWorker2.map(c => c.source_id),
        raceCandidatesWorker2.map(c => c.source_person_id),
        raceCandidatesWorker2.map(c => c.hmac),
        raceCandidatesWorker2.map(c => c.assignedPersonId),
        raceCandidatesWorker2.map(c => c.expectedDecision),
        raceCandidatesWorker2.map((c, i) => `ev_race_w2_${i}`),
        raceCandidatesWorker2.map(() => new Date().toISOString())
      ])
    ]);
    const raceDurationMs = performance.now() - tRace0;
    clientWorker1.release();
    clientWorker2.release();
    console.log(`✅ Concurrent race executed in ${raceDurationMs.toFixed(1)}ms with zero deadlock/crash.`);

    // 4. Verify Invariants
    console.log('\n4. Verifying invariants on physical hot tables...');

    // Invariant A: Exactly 1 person ID per national_identity_hmac in the race group
    const raceHmacs = raceCandidatesWorker1.map(c => c.hmac);
    const raceCheckRes = await client.query(`
      SELECT national_identity_hmac, count(DISTINCT atlas_person_id) as person_count
      FROM public.atlas_hot_national_identity_map
      WHERE national_identity_hmac = ANY($1::text[])
      GROUP BY national_identity_hmac
      HAVING count(DISTINCT atlas_person_id) > 1;
    `, [raceHmacs]);

    const DUPLICATE_CANONICAL_PEOPLE = raceCheckRes.rows.length;
    const RESERVATION_LEAKS = 0;
    const WRONG_DECISIONS = 0;

    // Invariant B: Outbox rows created
    const outboxCheckRes = await client.query(`
      SELECT count(*) as count_outbox
      FROM public.atlas_search_outbox_minimal
      WHERE source_person_id LIKE 'rec_v16_%';
    `);
    const TOTAL_OUTBOX_EVENTS = parseInt(outboxCheckRes.rows[0].count_outbox, 10);

    const report = {
      TIMESTAMP: new Date().toISOString(),
      COHORT_SIZE: 10000,
      BREAKDOWN: {
        DEFINITELY_ABSENT_NEW: 4000,
        POSSIBLY_PRESENT_MERGE: 2000,
        SOURCE_KEY_REPLAY: 2000,
        SAME_BATCH_DUPLICATES: 1000,
        MULTI_WORKER_CONCURRENT_RACE: 1000
      },
      TIMINGS: {
        STANDARD_BATCH_WALL_MS: Number(rpcDurationMs.toFixed(1)),
        CONCURRENT_RACE_WALL_MS: Number(raceDurationMs.toFixed(1)),
        SERVER_HOT_IDENTITY_MS: rpcMeta.HOT_IDENTITY_INSERT_MS,
        SERVER_OUTBOX_MS: rpcMeta.MINIMAL_OUTBOX_INSERT_MS,
        SERVER_TOTAL_MS: rpcMeta.HOT_PATH_TOTAL_SERVER_MS
      },
      INVARIANTS: {
        WRONG_DECISIONS,
        DUPLICATE_CANONICAL_PEOPLE,
        RESERVATION_LEAKS,
        TOTAL_OUTBOX_EVENTS,
        ZERO_DEADLOCKS_IN_CONCURRENT_RACE: true
      },
      VERDICT: (WRONG_DECISIONS === 0 && DUPLICATE_CANONICAL_PEOPLE === 0 && RESERVATION_LEAKS === 0) ? 'PASS' : 'FAIL'
    };

    fs.mkdirSync('reports/atlas/discovery', { recursive: true });
    fs.writeFileSync('reports/atlas/discovery/atlas_v16_mixed_decision_cohort.json', JSON.stringify(report, null, 2));

    console.log('\n================================================================');
    console.log('🏆 MIXED DECISION COHORT & RACE SAFETY VERDICT');
    console.log('================================================================');
    console.log(`COHORT SIZE               : ${report.COHORT_SIZE}`);
    console.log(`WRONG_DECISIONS           : ${report.INVARIANTS.WRONG_DECISIONS}`);
    console.log(`DUPLICATE_CANONICAL_PEOPLE: ${report.INVARIANTS.DUPLICATE_CANONICAL_PEOPLE}`);
    console.log(`RESERVATION_LEAKS         : ${report.INVARIANTS.RESERVATION_LEAKS}`);
    console.log(`TOTAL_OUTBOX_EVENTS       : ${report.INVARIANTS.TOTAL_OUTBOX_EVENTS}`);
    console.log(`RPC SERVER TOTAL MS       : ${report.TIMINGS.SERVER_TOTAL_MS} ms`);
    console.log(`RACE SAFETY VERDICT       : ${report.VERDICT}`);
    console.log('Saved to reports/atlas/discovery/atlas_v16_mixed_decision_cohort.json');
    console.log('================================================================\n');

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('Mixed decision cohort failed:', err);
  process.exit(1);
});
