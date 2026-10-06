import pg from 'pg';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const { Pool } = pg;
const pool = new Pool(parseDbUrl());

function hmacSha256(key, value) {
  return crypto.createHmac('sha256', key).update(value).digest('hex');
}

function normalizeText(str) {
  if (!str) return '';
  return str
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function runParityTest() {
  console.log('================================================================');
  console.log('🔬 ATLAS INDUCTION ENGINE V1.3: SEMANTIC PARITY VERIFICATION');
  console.log('================================================================\n');

  const clientA = await pool.connect();
  const clientB = await pool.connect();

  try {
    // 0. Clean up any leftover test rows first
    await clientA.query(`DELETE FROM public.atlas_person_identity_map WHERE source_id LIKE 'TEST%';`);
    await clientA.query(`DELETE FROM public.atlas_search_outbox WHERE source_id LIKE 'TEST%';`);

    // 1. Fetch 10 real existing identity mappings from DB to test MERGE decisions
    const existingRes = await clientA.query(`
      SELECT source_person_id, identifier_value, atlas_person_id
      FROM public.atlas_person_identity_map
      WHERE identifier_type = 'NATIONAL_IDENTITY_HMAC'
        AND source_id = 'ARCA_CONDICION_TRIBUTARIA'
      LIMIT 10;
    `);

    console.log(`Fetched ${existingRes.rows.length} existing database identities to verify MERGE resolution.`);

    // 2. Build test candidate cohort of 500 candidates:
    // - 10 candidates match existing DB identities (POSSIBLY_PRESENT -> MERGE)
    // - 40 candidates are fresh but marked POSSIBLY_PRESENT (POSSIBLY_PRESENT -> NEW)
    // - 450 candidates are fresh marked DEFINITELY_ABSENT (DEFINITELY_ABSENT -> NEW)
    const testCandidates = [];

    // Group 1: 10 MERGE candidates
    for (let i = 0; i < existingRes.rows.length; i++) {
      const row = existingRes.rows[i];
      testCandidates.push({
        source_person_id: `cand_merge_${i}_${Date.now()}`,
        raw_name: `EXISTING PERSON ${i}`,
        name_norm: `EXISTING PERSON ${i}`,
        identifier_type: 'NATIONAL_IDENTITY_HMAC',
        identifier_value: row.identifier_value,
        field_classification: 'POSSIBLY_PRESENT',
        expected_existing_id: row.atlas_person_id,
        proposed_atlas_id: crypto.randomUUID()
      });
    }

    // Group 2: 40 POSSIBLY_PRESENT non-matches (Bloom false positives)
    for (let i = 0; i < 40; i++) {
      const fakeHmac = crypto.randomBytes(32).toString('hex');
      testCandidates.push({
        source_person_id: `cand_fp_${i}_${Date.now()}`,
        raw_name: `BLOOM FP CANDIDATE ${i}`,
        name_norm: `BLOOM FP CANDIDATE ${i}`,
        identifier_type: 'NATIONAL_IDENTITY_HMAC',
        identifier_value: fakeHmac,
        field_classification: 'POSSIBLY_PRESENT',
        expected_existing_id: null,
        proposed_atlas_id: crypto.randomUUID()
      });
    }

    // Group 3: 450 DEFINITELY_ABSENT fast-path candidates
    for (let i = 0; i < 450; i++) {
      const fakeHmac = crypto.randomBytes(32).toString('hex');
      testCandidates.push({
        source_person_id: `cand_absent_${i}_${Date.now()}`,
        raw_name: `DEFINITELY ABSENT CANDIDATE ${i}`,
        name_norm: `DEFINITELY ABSENT CANDIDATE ${i}`,
        identifier_type: 'NATIONAL_IDENTITY_HMAC',
        identifier_value: fakeHmac,
        field_classification: 'DEFINITELY_ABSENT',
        expected_existing_id: null,
        proposed_atlas_id: crypto.randomUUID()
      });
    }

    console.log(`Generated deterministic test cohort of ${testCandidates.length} candidates:`);
    console.log(`  - 10 POSSIBLY_PRESENT existing matches (must MERGE)`);
    console.log(`  - 40 POSSIBLY_PRESENT non-matches (must be NEW)`);
    console.log(`  - 450 DEFINITELY_ABSENT candidates (must be NEW)\n`);

    // -------------------------------------------------------------
    // PATH A: CURRENT_CLIENT_FALLBACK_PLUS_RPC
    // -------------------------------------------------------------
    console.log('>>> Executing PATH A: Client Fallback Lookup + atlas_ingest_batch_rpc...');
    const tA0 = performance.now();

    // Step A.1: Client Fallback lookup for POSSIBLY_PRESENT
    const possibleA = testCandidates.filter(c => c.field_classification === 'POSSIBLY_PRESENT');
    const possibleValuesA = possibleA.map(c => c.identifier_value);

    const lookupResA = await clientA.query(`
      SELECT DISTINCT ON (identifier_value) identifier_value, atlas_person_id
      FROM public.atlas_person_identity_map
      WHERE identifier_type = 'NATIONAL_IDENTITY_HMAC'
        AND identifier_value = ANY($1::text[])
      ORDER BY identifier_value, observed_at ASC;
    `, [possibleValuesA]);

    const matchMapA = new Map(lookupResA.rows.map(r => [r.identifier_value, r.atlas_person_id]));

    // Step A.2: Client-side resolution
    const resolvedA = testCandidates.map(c => {
      let decision = 'NEW';
      let targetId = c.proposed_atlas_id;
      if (c.field_classification === 'POSSIBLY_PRESENT') {
        const existingId = matchMapA.get(c.identifier_value);
        if (existingId) {
          decision = 'MERGE';
          targetId = existingId;
        }
      }
      return {
        ...c,
        decision,
        targetAtlasId: targetId
      };
    });

    // Step A.3: Prepare RPC write arrays
    const p_ids_A = resolvedA.map(c => c.targetAtlasId);
    const p_sources_A = resolvedA.map(() => 'TEST_PATH_A');
    const p_person_ids_A = resolvedA.map(c => c.source_person_id);
    const p_types_A = resolvedA.map(c => c.identifier_type);
    const p_values_A = resolvedA.map(c => c.identifier_value);
    const p_evidences_A = resolvedA.map(c => 'ev_' + c.source_person_id);
    const p_confidences_A = resolvedA.map(() => 1.0);
    const p_resolutions_A = resolvedA.map(() => 'DETERMINISTIC');
    const p_decisions_A = resolvedA.map(c => c.decision);

    const p_outbox_ids_A = p_ids_A;
    const p_outbox_sources_A = p_sources_A;
    const p_outbox_records_A = p_person_ids_A;
    const p_outbox_payloads_A = resolvedA.map(c => JSON.stringify({
      atlas_person_id: c.targetAtlasId,
      display_name: c.raw_name,
      display_name_normalized: c.name_norm,
      search_text_normalized: c.name_norm,
      source_id: 'TEST_PATH_A',
      source_record_id: c.source_person_id
    }));
    const p_outbox_versions_A = resolvedA.map(() => 1);
    const p_outbox_statuses_A = resolvedA.map(() => 'PENDING');
    const p_outbox_attempts_A = resolvedA.map(() => 0);

    const rpcResA = await clientA.query(`
      SELECT * FROM public.atlas_ingest_batch_rpc(
        $1::text[], $2::text[], $3::text[], $4::text[], $5::text[],
        $6::text[], $7::numeric[], $8::text[],
        $9::text[], $10::text[], $11::text[], $12::jsonb[],
        $13::int[], $14::text[], $15::int[],
        $16::text[]
      );
    `, [
      p_ids_A, p_sources_A, p_person_ids_A, p_types_A, p_values_A,
      p_evidences_A, p_confidences_A, p_resolutions_A,
      p_outbox_ids_A, p_outbox_sources_A, p_outbox_records_A, p_outbox_payloads_A,
      p_outbox_versions_A, p_outbox_statuses_A, p_outbox_attempts_A,
      p_decisions_A
    ]);

    const wallA = performance.now() - tA0;
    console.log(`Path A completed in ${wallA.toFixed(2)} ms. RPC Result:`, rpcResA.rows[0]);

    // Clean up Path A rows immediately so they don't appear as existing identities for Path B
    await clientA.query(`DELETE FROM public.atlas_person_identity_map WHERE source_id = 'TEST_PATH_A';`);
    await clientA.query(`DELETE FROM public.atlas_search_outbox WHERE source_id = 'TEST_PATH_A';`);

    // -------------------------------------------------------------
    // PATH B: NEW_SINGLE_RESOLVE_RPC
    // -------------------------------------------------------------
    console.log('\n>>> Executing PATH B: Single atlas_resolve_and_ingest_batch_rpc...');
    const tB0 = performance.now();

    const p_source_person_ids_B = testCandidates.map(c => c.source_person_id);
    const p_identifier_types_B = testCandidates.map(c => c.identifier_type);
    const p_identifier_values_B = testCandidates.map(c => c.identifier_value);
    const p_display_names_B = testCandidates.map(c => c.raw_name);
    const p_name_norms_B = testCandidates.map(c => c.name_norm);
    const p_field_classifications_B = testCandidates.map(c => c.field_classification);
    const p_proposed_atlas_ids_B = testCandidates.map(c => c.proposed_atlas_id);
    const p_evidence_ids_B = testCandidates.map(c => 'ev_' + c.source_person_id);
    const p_confidences_B = testCandidates.map(() => 1.0);
    const p_resolution_methods_B = testCandidates.map(() => 'DETERMINISTIC');

    const rpcResB = await clientB.query(`
      SELECT * FROM public.atlas_resolve_and_ingest_batch_rpc(
        $1::text,
        $2::text[],
        $3::text[],
        $4::text[],
        $5::text[],
        $6::text[],
        $7::text[],
        $8::text[],
        $9::text[],
        $10::numeric[],
        $11::text[]
      );
    `, [
      'TEST_PATH_B',
      p_source_person_ids_B,
      p_identifier_types_B,
      p_identifier_values_B,
      p_display_names_B,
      p_name_norms_B,
      p_field_classifications_B,
      p_proposed_atlas_ids_B,
      p_evidence_ids_B,
      p_confidences_B,
      p_resolution_methods_B
    ]);

    const wallB = performance.now() - tB0;
    console.log(`Path B completed in ${wallB.toFixed(2)} ms. RPC Result:`, {
      identity_rows_inserted: rpcResB.rows[0].identity_rows_inserted,
      outbox_rows_inserted: rpcResB.rows[0].outbox_rows_inserted,
      new_count: rpcResB.rows[0].new_count,
      merge_count: rpcResB.rows[0].merge_count,
      definitely_absent_count: rpcResB.rows[0].definitely_absent_count,
      possibly_present_count: rpcResB.rows[0].possibly_present_count
    });

    // -------------------------------------------------------------
    // EXACT CANDIDATE-BY-CANDIDATE COMPARISON
    // -------------------------------------------------------------
    console.log('\n>>> Comparing Path A vs Path B candidate-by-candidate...');
    const itemsB = rpcResB.rows[0].resolved_items;
    const mapB = new Map(itemsB.map(i => [i.source_person_id, i]));

    let diffCount = 0;
    let unsafeMerges = 0;
    let falseNegatives = 0;
    let unaccounted = 0;

    for (let i = 0; i < testCandidates.length; i++) {
      const cand = testCandidates[i];
      const resA = resolvedA[i];
      const resB = mapB.get(cand.source_person_id);

      if (!resB) {
        unaccounted++;
        diffCount++;
        continue;
      }

      // Check decision
      if (resA.decision !== resB.decision) {
        console.error(`Diff in decision for cand ${cand.source_person_id}: Path A=${resA.decision}, Path B=${resB.decision}`);
        diffCount++;
      }

      // Check MERGE accuracy
      if (cand.expected_existing_id) {
        if (resB.decision !== 'MERGE' || resB.final_atlas_id !== cand.expected_existing_id) {
          console.error(`Unsafe merge / mismatch for cand ${cand.source_person_id}: expected ${cand.expected_existing_id}, got ${resB.final_atlas_id}`);
          unsafeMerges++;
          diffCount++;
        }
      }

      // Check NEW accuracy
      if (!cand.expected_existing_id && cand.field_classification === 'POSSIBLY_PRESENT') {
        if (resB.decision !== 'NEW' || resB.final_atlas_id !== cand.proposed_atlas_id) {
          console.error(`Mismatch for Bloom FP cand ${cand.source_person_id}: expected NEW with ${cand.proposed_atlas_id}, got ${resB.final_atlas_id} (${resB.decision})`);
          diffCount++;
        }
      }

      // Check fast path
      if (cand.field_classification === 'DEFINITELY_ABSENT') {
        if (resB.decision !== 'NEW' || resB.final_atlas_id !== cand.proposed_atlas_id) {
          console.error(`Fast path mismatch for ${cand.source_person_id}`);
          falseNegatives++;
          diffCount++;
        }
      }
    }

    // Verify written rows in database
    const dbRowsA = await clientA.query(`SELECT count(*) FROM public.atlas_person_identity_map WHERE source_id = 'TEST_PATH_A'`);
    const dbRowsB = await clientB.query(`SELECT count(*) FROM public.atlas_person_identity_map WHERE source_id = 'TEST_PATH_B'`);
    const outRowsA = await clientA.query(`SELECT count(*) FROM public.atlas_search_outbox WHERE source_id = 'TEST_PATH_A'`);
    const outRowsB = await clientB.query(`SELECT count(*) FROM public.atlas_search_outbox WHERE source_id = 'TEST_PATH_B'`);

    console.log(`\nWritten Rows Verification:`);
    console.log(`  Path A Identity Rows : ${dbRowsA.rows[0].count} | Outbox Rows: ${outRowsA.rows[0].count}`);
    console.log(`  Path B Identity Rows : ${dbRowsB.rows[0].count} | Outbox Rows: ${outRowsB.rows[0].count}`);

    // Clean up test rows
    await clientA.query(`DELETE FROM public.atlas_person_identity_map WHERE source_id IN ('TEST_PATH_A', 'TEST_PATH_B');`);
    await clientA.query(`DELETE FROM public.atlas_search_outbox WHERE source_id IN ('TEST_PATH_A', 'TEST_PATH_B');`);
    console.log('Cleaned up test data.');

    const totalCands = testCandidates.length;
    const parityPercent = Number((((totalCands - diffCount) / totalCands) * 100).toFixed(2));

    console.log('\n================================================================');
    console.log('PARITY VERIFICATION VERDICT');
    console.log('================================================================');
    console.log(`TOTAL_CANDIDATES       : ${totalCands}`);
    console.log(`DIFF_COUNT             : ${diffCount}`);
    console.log(`SEMANTIC_PARITY        : ${parityPercent}%`);
    console.log(`UNSAFE_MERGES          : ${unsafeMerges}`);
    console.log(`FALSE_NEGATIVES        : ${falseNegatives}`);
    console.log(`UNACCOUNTED            : ${unaccounted}`);
    console.log(`PATH_A_WALL_MS         : ${wallA.toFixed(2)} ms (2 DB calls)`);
    console.log(`PATH_B_WALL_MS         : ${wallB.toFixed(2)} ms (1 DB call)`);
    console.log(`SINGLE_RPC_SPEEDUP     : ${(wallA / wallB).toFixed(2)}x`);
    console.log('================================================================\n');

  } finally {
    clientA.release();
    clientB.release();
    await pool.end();
  }
}

runParityTest().catch(err => {
  console.error('Parity test failed:', err);
  process.exit(1);
});
