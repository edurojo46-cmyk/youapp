import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';
import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';
import { IdentityInductionField } from './lib/identity_field.mjs';

dotenv.config();

const SOURCE_FILE = 'cache_gate31d/utlfile/padr/SELE-SAL-CONSTA.p20out1.20260912.tmp';
const HMAC_SECRET = process.env.ATLAS_IGJ_IDENTITY_HMAC_KEY;
if (!HMAC_SECRET) {
  console.error('FATAL: ATLAS_IGJ_IDENTITY_HMAC_KEY missing');
  process.exit(1);
}

const BINARY_FIELD_PATH = 'cache_gate31d/identity_field_base.bin';
const POPULATION_SIZE = 96000;
const SHADOW_OFFSET_START = 600000;
const BATCH_SIZE = 2000;

function normalizeName(rawName) {
  return rawName.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseCandidate(line) {
  const cuit = line.substring(0, 11).trim();
  const rawName = line.substring(11, 41).trim();
  const dni = String(parseInt(cuit.slice(2, 10), 10));
  const identifierValue = crypto.createHmac('sha256', HMAC_SECRET).update(`ARG:DNI:${dni}`).digest('hex');
  const atlasPersonId = `atlas_arg_per_${identifierValue.slice(0, 16)}`;
  return {
    cuit,
    raw_name: rawName,
    normalized_name: normalizeName(rawName),
    cuit_masked: `${cuit.slice(0, 2)}***${cuit.slice(-2)}`,
    identifier_value: identifierValue,
    candidate_atlas_person_id: atlasPersonId,
    source_id: 'ARCA_CONDICION_TRIBUTARIA',
    source_person_id: cuit
  };
}

async function loadDeterministicSlice(startOffset, count) {
  console.log(`Loading ${count} deterministic candidates from physical offset ${startOffset}...`);
  const candidates = [];
  const rl = readline.createInterface({ input: fs.createReadStream(SOURCE_FILE), crlfDelay: Infinity });
  let idx = 0;
  for await (const line of rl) {
    if (idx >= startOffset && line.length >= 50 && ['20', '27', '23', '24'].includes(line.substring(0, 2))) {
      candidates.push(parseCandidate(line));
      if (candidates.length >= count) break;
    }
    idx++;
  }
  return candidates;
}

async function main() {
  console.log('================================================================');
  console.log('⚡ STAGE 3P: SEMANTIC PARITY AUDIT & DB AVOIDANCE MEASUREMENT');
  console.log('================================================================\n');

  if (!fs.existsSync(BINARY_FIELD_PATH)) {
    throw new Error(`Missing binary field snapshot: ${BINARY_FIELD_PATH}`);
  }

  console.log(`Loading Identity Induction Field from ${BINARY_FIELD_PATH}...`);
  const tField0 = performance.now();
  const field = IdentityInductionField.loadFromFile(BINARY_FIELD_PATH);
  console.log(`✔ Loaded Identity Field in ${((performance.now() - tField0)).toFixed(1)}ms. Keys: ${field.fieldSource.count + field.fieldStable.count}\n`);

  const pool = new pg.Pool({ ...parseDbUrl(), max: 4 });
  const client = await pool.connect();

  try {
    // ------------------------------------------------------------------------
    // PART A: NATURAL 96,000 POPULATION PARITY AUDIT
    // ------------------------------------------------------------------------
    console.log(`--- PART A: NATURAL POPULATION AUDIT (${POPULATION_SIZE.toLocaleString()} CANDIDATES) ---`);
    const candidates = await loadDeterministicSlice(SHADOW_OFFSET_START, POPULATION_SIZE);

    let totalCandidates = candidates.length;
    let definitelyAbsentCount = 0;
    let possiblyPresentCount = 0;
    let insufficientKeysCount = 0;

    let definitelyAbsentFalseNegatives = 0; // CRITICAL: Field predicted absent, but V2 was MERGE or CONFLICT
    let newDecisionParityMatches = 0;
    let mergeDecisionParityMatches = 0;
    let canonicalTargetParityMatches = 0;
    let conflictParityMatches = 0;

    let fieldFalsePositives = 0; // Field flagged possibly present (bit collision), but V2 decided NEW
    let fieldTruePositives = 0;  // Field flagged possibly present, and V2 decided MERGE

    const batches = [];
    for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
      batches.push(candidates.slice(i, i + BATCH_SIZE));
    }

    console.log(`Auditing ${batches.length} batches against authoritative PostgreSQL Resolver V2 ground truth...`);
    const tAudit0 = performance.now();

    for (let bIdx = 0; bIdx < batches.length; bIdx++) {
      const b = batches[bIdx];

      // 1. Classify batch using in-memory field
      const fieldClassifications = b.map(c => ({
        candidate: c,
        fieldResult: field.classifyCandidate(c)
      }));

      // 2. Obtain ground truth from PostgreSQL Resolver V2 under transaction rollback
      await client.query('BEGIN');
      await client.query('SELECT public.resolve_and_commit_candidate_batch_v2($1::jsonb)', [JSON.stringify(b)]);
      const truthRes = await client.query('SELECT cuit, is_conflict, resolution_type, resolved_atlas_person_id FROM temp_resolved_candidates');
      await client.query('ROLLBACK');

      const truthMap = new Map(truthRes.rows.map(r => [r.cuit, r]));

      // 3. Row-by-row parity verification
      for (const item of fieldClassifications) {
        const c = item.candidate;
        const f = item.fieldResult;
        const t = truthMap.get(c.cuit);

        if (!t) {
          throw new Error(`Missing truth row for cuit: ${c.cuit}`);
        }

        if (f.classification === 'INSUFFICIENT_STABLE_KEYS') {
          insufficientKeysCount++;
          continue;
        }

        if (f.classification === 'DEFINITELY_ABSENT') {
          definitelyAbsentCount++;

          // Verification against V2
          if (t.resolution_type === 'NEW' && !t.is_conflict) {
            newDecisionParityMatches++;
            if (t.resolved_atlas_person_id === c.candidate_atlas_person_id) {
              canonicalTargetParityMatches++;
            }
          } else {
            // FATAL: Predicted absent, but DB found match or conflict!
            definitelyAbsentFalseNegatives++;
            console.error(`FATAL FALSE NEGATIVE on cuit ${c.cuit}: Field said DEFINITELY_ABSENT, but V2 decided ${t.resolution_type} (conflict=${t.is_conflict})`);
          }
        } else if (f.classification === 'POSSIBLY_PRESENT') {
          possiblyPresentCount++;

          if (t.resolution_type === 'MERGE') {
            fieldTruePositives++;
            mergeDecisionParityMatches++;
            if (t.is_conflict) conflictParityMatches++;
          } else {
            // Net-new candidate that collided with Bloom filter bits (safe fallback to V2)
            fieldFalsePositives++;
          }
        }
      }

      if ((bIdx + 1) % 10 === 0 || (bIdx + 1) === batches.length) {
        process.stdout.write(`  Audited ${((bIdx + 1) * BATCH_SIZE).toLocaleString()} candidates... (False Negatives: ${definitelyAbsentFalseNegatives})\n`);
      }
    }

    const auditDurationSec = Number(((performance.now() - tAudit0) / 1000).toFixed(2));
    console.log(`✔ Natural 96K Parity Audit finished in ${auditDurationSec}s.\n`);

    // ------------------------------------------------------------------------
    // PART B: EDGE-CASE SEMANTIC FIXTURE SUITE (MERGE, CONFLICT, INSUFFICIENT)
    // ------------------------------------------------------------------------
    console.log('--- PART B: EDGE-CASE SEMANTIC FIXTURE SUITE ---');
    // Fetch 5 known existing identities from database
    const sampleExisting = await client.query(`
      SELECT source_id, source_person_id, identifier_value, atlas_person_id
      FROM public.atlas_person_identity_map
      WHERE identifier_type = 'NATIONAL_IDENTITY_HMAC'
      LIMIT 5;
    `);

    const edgeFixtures = [];

    // 1. Exact MERGE fixtures
    for (let i = 0; i < sampleExisting.rows.length; i++) {
      const row = sampleExisting.rows[i];
      edgeFixtures.push({
        name: `EXACT_MERGE_FIXTURE_${i + 1}`,
        expected_type: 'MERGE',
        candidate: {
          cuit: '20' + String(10000000 + i) + '0',
          raw_name: `FIXTURE EXISTING PERSON ${i + 1}`,
          normalized_name: `FIXTURE EXISTING PERSON ${i + 1}`,
          cuit_masked: '20***0',
          identifier_value: row.identifier_value,
          candidate_atlas_person_id: `atlas_arg_per_fixture_${i}`,
          source_id: row.source_id,
          source_person_id: row.source_person_id
        }
      });
    }

    // 2. CONFLICT fixture: Source key of Row 0, but HMAC of Row 1
    if (sampleExisting.rows.length >= 2) {
      edgeFixtures.push({
        name: 'CROSS_KEY_CONFLICT_FIXTURE',
        expected_type: 'MERGE_OR_CONFLICT',
        candidate: {
          cuit: '20999999990',
          raw_name: 'FIXTURE CONFLICT PERSON',
          normalized_name: 'FIXTURE CONFLICT PERSON',
          cuit_masked: '20***90',
          identifier_value: sampleExisting.rows[1].identifier_value,
          candidate_atlas_person_id: 'atlas_arg_per_conflict_99',
          source_id: sampleExisting.rows[0].source_id,
          source_person_id: sampleExisting.rows[0].source_person_id
        }
      });
    }

    // 3. INSUFFICIENT keys fixture
    edgeFixtures.push({
      name: 'INSUFFICIENT_KEY_FIXTURE',
      expected_type: 'INSUFFICIENT',
      candidate: {
        cuit: '',
        raw_name: 'INSUFFICIENT DATA',
        normalized_name: 'INSUFFICIENT DATA',
        cuit_masked: '',
        identifier_value: '',
        candidate_atlas_person_id: 'atlas_arg_per_none',
        source_id: 'ARCA',
        source_person_id: ''
      }
    });

    let edgeSuitePassed = true;
    for (const fix of edgeFixtures) {
      const fRes = field.classifyCandidate(fix.candidate);
      if (fix.expected_type === 'MERGE' || fix.expected_type === 'MERGE_OR_CONFLICT') {
        // Must NOT be classified DEFINITELY_ABSENT!
        if (fRes.classification === 'DEFINITELY_ABSENT') {
          console.error(`❌ Edge Fixture ${fix.name} FAILED: Classified as DEFINITELY_ABSENT!`);
          edgeSuitePassed = false;
        } else {
          console.log(`✔ Edge Fixture ${fix.name}: Correctly routed to V2 (${fRes.classification})`);
        }
      } else if (fix.expected_type === 'INSUFFICIENT') {
        if (fRes.classification === 'INSUFFICIENT_STABLE_KEYS') {
          console.log(`✔ Edge Fixture ${fix.name}: Correctly flagged INSUFFICIENT_STABLE_KEYS`);
        } else {
          console.error(`❌ Edge Fixture ${fix.name} FAILED: Expected INSUFFICIENT_STABLE_KEYS`);
          edgeSuitePassed = false;
        }
      }
    }

    // ------------------------------------------------------------------------
    // METRIC CALCULATIONS & ARTIFACT GENERATION
    // ------------------------------------------------------------------------
    const fieldFastPathPercent = Number(((definitelyAbsentCount / totalCandidates) * 100).toFixed(2));
    const dbResolverRequiredPercent = Number(((possiblyPresentCount + insufficientKeysCount) / totalCandidates * 100).toFixed(2));
    const fieldFalsePositiveRate = Number(((fieldFalsePositives / totalCandidates) * 100).toFixed(2));

    // Each DEFINITELY_ABSENT candidate avoids 2 PostgreSQL index read probes:
    // (1) src_map lookup on atlas_person_identity_map
    // (2) ident_match lookup on atlas_person_identity_map
    const dbLookupsAvoided = definitelyAbsentCount * 2;
    const totalPossibleLookups = totalCandidates * 2;
    const dbLookupsAvoidedPercent = Number(((dbLookupsAvoided / totalPossibleLookups) * 100).toFixed(2));

    console.log('\n================================================================');
    console.log('STAGE 3P DB AVOIDANCE & PARITY RESULTS');
    console.log('================================================================');
    console.log(`Total Candidates Evaluated:           ${totalCandidates.toLocaleString()}`);
    console.log(`DEFINITELY_ABSENT (Fast-Path):        ${definitelyAbsentCount.toLocaleString()} (${fieldFastPathPercent}%)`);
    console.log(`POSSIBLY_PRESENT (V2 Fallback):       ${possiblyPresentCount.toLocaleString()} (${dbResolverRequiredPercent}%)`);
    console.log(`DEFINITELY_ABSENT False Negatives:    ${definitelyAbsentFalseNegatives} (Zero Required: ${definitelyAbsentFalseNegatives === 0})`);
    console.log(`Field False Positives (Safe Fallback): ${fieldFalsePositives} (${fieldFalsePositiveRate}%)`);
    console.log(`DB Identity Lookups Avoided:          ${dbLookupsAvoided.toLocaleString()} / ${totalPossibleLookups.toLocaleString()} (${dbLookupsAvoidedPercent}%)`);
    console.log(`Edge-Case Fixture Suite:              ${edgeSuitePassed ? 'PASS (100%)' : 'FAIL'}\n`);

    const parityArtifact = {
      timestamp: new Date().toISOString(),
      stage: 'STAGE3P',
      TOTAL_CANDIDATES: totalCandidates,
      DEFINITELY_ABSENT_FALSE_NEGATIVES: definitelyAbsentFalseNegatives,
      NEW_DECISION_PARITY_PERCENT: Number(((newDecisionParityMatches / definitelyAbsentCount) * 100).toFixed(2)),
      CANONICAL_TARGET_PARITY_PERCENT: Number(((canonicalTargetParityMatches / definitelyAbsentCount) * 100).toFixed(2)),
      NATURAL_96K_PARITY: definitelyAbsentFalseNegatives === 0,
      EDGE_CASE_SEMANTIC_PARITY: edgeSuitePassed,
      GATE_0_SEMANTIC_PARITY_100: definitelyAbsentFalseNegatives === 0 && edgeSuitePassed,
      GATE_1_ZERO_FALSE_NEGATIVES: definitelyAbsentFalseNegatives === 0,
      FIXTURES_TESTED: edgeFixtures.length
    };

    const avoidanceArtifact = {
      timestamp: new Date().toISOString(),
      stage: 'STAGE3P',
      TOTAL_CANDIDATES: totalCandidates,
      DEFINITELY_ABSENT_COUNT: definitelyAbsentCount,
      POSSIBLY_PRESENT_COUNT: possiblyPresentCount,
      INSUFFICIENT_KEYS_COUNT: insufficientKeysCount,
      FIELD_FAST_PATH_PERCENT: fieldFastPathPercent,
      DB_RESOLVER_REQUIRED_PERCENT: dbResolverRequiredPercent,
      DB_IDENTITY_LOOKUPS_AVOIDED: dbLookupsAvoided,
      DB_IDENTITY_LOOKUPS_AVOIDED_PERCENT: dbLookupsAvoidedPercent,
      FIELD_FALSE_POSITIVE_COUNT: fieldFalsePositives,
      FIELD_FALSE_POSITIVE_RATE_PERCENT: fieldFalsePositiveRate,
      FIELD_TRUE_POSITIVE_COUNT: fieldTruePositives,
      THEORETICAL_READ_INDEX_PROBES_REDUCED: dbLookupsAvoided
    };

    fs.writeFileSync('reports/atlas/discovery/atlas_stage3p_field_parity_v1.json', JSON.stringify(parityArtifact, null, 2));
    fs.writeFileSync('reports/atlas/discovery/atlas_stage3p_db_avoidance_v1.json', JSON.stringify(avoidanceArtifact, null, 2));

    console.log('✔ Artifacts saved:');
    console.log('  - reports/atlas/discovery/atlas_stage3p_field_parity_v1.json');
    console.log('  - reports/atlas/discovery/atlas_stage3p_db_avoidance_v1.json\n');

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('Fatal parity audit error:', err);
  process.exit(1);
});
