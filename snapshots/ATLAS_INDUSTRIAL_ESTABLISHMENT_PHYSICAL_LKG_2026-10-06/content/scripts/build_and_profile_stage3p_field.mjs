import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';
import { IdentityInductionField } from './lib/identity_field.mjs';

dotenv.config();

async function main() {
  console.log('================================================================');
  console.log('⚡ STAGE 3P: BUILD & PROFILE IDENTITY INDUCTION FIELD');
  console.log('================================================================\n');

  const client = new pg.Client(parseDbUrl());
  await client.connect();

  const field = new IdentityInductionField({
    bitsPerField: 36000000, // 36M bits = 4.5 MB per field
    kHashes: 8
  });

  try {
    // 1. Snapshot watermark
    console.log('Fetching SSOT watermark...');
    const wmRes = await client.query('SELECT max(observed_at) as max_obs FROM public.atlas_person_identity_map;');
    const watermark = wmRes.rows[0].max_obs;
    field.baseWatermark = watermark;
    field.effectiveWatermark = watermark;
    console.log(`SSOT Snapshot Watermark: ${watermark}\n`);

    // 2. Stream identity rows and populate Field
    console.log('Streaming identity map keys into Identity Induction Field...');
    const t0 = performance.now();
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;');
    await client.query(`
      DECLARE cur_id_stream NO SCROLL CURSOR FOR
      SELECT source_id, source_person_id, identifier_type, identifier_value
      FROM public.atlas_person_identity_map;
    `);

    let rowCount = 0;
    const fetchBatch = 100000;
    while (true) {
      const res = await client.query(`FETCH ${fetchBatch} FROM cur_id_stream;`);
      for (const row of res.rows) {
        field.addBaseIdentity(row.source_id, row.source_person_id, row.identifier_type, row.identifier_value);
      }
      rowCount += res.rows.length;
      process.stdout.write(`\rIngested ${rowCount.toLocaleString()} keys in ${((performance.now() - t0)/1000).toFixed(1)}s...`);
      if (res.rows.length < fetchBatch) break;
    }

    await client.query('CLOSE cur_id_stream;');
    await client.query('COMMIT;');

    const buildSec = Number(((performance.now() - t0) / 1000).toFixed(2));
    console.log(`\n✔ Ingestion complete: ${rowCount.toLocaleString()} records in ${buildSec}s.\n`);

    field.isBuilt = true;

    // 3. Measure Memory Profile
    const memProfile = field.getMemoryProfile();
    memProfile.BUILD_SECONDS = buildSec;
    memProfile.INGESTION_RATE_KEYS_SEC = Number((rowCount / buildSec).toFixed(0));

    console.log('--- IDENTITY INDUCTION FIELD MEMORY PROFILE ---');
    console.log(`  Source Keys Ingested:    ${memProfile.SOURCE_FIELD_KEYS.toLocaleString()}`);
    console.log(`  Stable Keys Ingested:    ${memProfile.STABLE_FIELD_KEYS.toLocaleString()}`);
    console.log(`  Total Keys Modeled:      ${memProfile.TOTAL_FIELD_KEYS.toLocaleString()}`);
    console.log(`  Filter RAM Usage:        ${memProfile.TOTAL_FIELD_MEMORY_MB} MB`);
    console.log(`  Bits Per Key:            ${memProfile.BITS_PER_KEY} bits`);
    console.log(`  Build Duration:          ${memProfile.BUILD_SECONDS}s\n`);

    // 4. Measure Pure In-Memory Lookup Speed & Empirical False Positive Rate
    console.log('Testing pure in-memory lookup throughput on 1,000,000 queries...');
    const testKeys = [];
    for (let i = 0; i < 1000000; i++) {
      // Generate synthetic non-existent keys to test negative resolution & false positives
      testKeys.push({
        source_id: 'ARCA_TEST',
        source_person_id: `synthetic_probe_${i}`,
        identifier_value: `synthetic_hmac_probe_${i}`
      });
    }

    const tProbe0 = performance.now();
    let definitelyAbsentCount = 0;
    let falsePositiveCount = 0;

    for (let i = 0; i < testKeys.length; i++) {
      const res = field.classifyCandidate(testKeys[i]);
      if (res.classification === 'DEFINITELY_ABSENT') {
        definitelyAbsentCount++;
      } else {
        falsePositiveCount++;
      }
    }

    const probeTimeMs = performance.now() - tProbe0;
    const lookupsSec = Number(((testKeys.length / (probeTimeMs / 1000))).toFixed(0));
    const fpRate = Number(((falsePositiveCount / testKeys.length) * 100).toFixed(4));

    console.log(`✔ Pure Field Lookup Throughput: ${lookupsSec.toLocaleString()} lookups/sec`);
    console.log(`  Latency per lookup:            ${(probeTimeMs / testKeys.length * 1000).toFixed(2)} microseconds`);
    console.log(`  Empirical False Positive Rate: ${fpRate}% (${falsePositiveCount} / ${testKeys.length})\n`);

    memProfile.FIELD_LOOKUPS_SEC = lookupsSec;
    memProfile.LATENCY_PER_LOOKUP_US = Number((probeTimeMs / testKeys.length * 1000).toFixed(2));
    memProfile.EMPIRICAL_FALSE_POSITIVE_RATE_PERCENT = fpRate;

    // 5. Save Artifacts
    const designArtifact = {
      timestamp: new Date().toISOString(),
      stage: 'STAGE3P',
      title: 'ATLAS STAGE 3P: IDENTITY INDUCTION FIELD ARCHITECTURE DESIGN',
      architecture_paradigm: 'Memory-Side Negative Membership Filter with Exact Delta Overlay',
      components: {
        FIELD_SOURCE_IDENTITY: {
          structure: 'Bloom Filter (Kirsch-Mitzenmacher Double Hashing FNV1a + DJB2)',
          bits: 36000000,
          k_hashes: 8,
          key_prefix: 'src:',
          covers_column: '(source_id, source_person_id)'
        },
        FIELD_STABLE_IDENTITY: {
          structure: 'Bloom Filter (Kirsch-Mitzenmacher Double Hashing FNV1a + DJB2)',
          bits: 36000000,
          k_hashes: 8,
          key_prefix: 'hmac:',
          covers_column: '(identifier_type = NATIONAL_IDENTITY_HMAC, identifier_value)'
        },
        DELTA_OVERLAY: {
          structure: 'In-memory exact Set collections',
          semantics: 'Zero-drop watermark synchronization for identities committed post-snapshot',
          supports_incremental_updates: true
        }
      },
      guarantees: {
        DEFINITELY_ABSENT_SAFETY: 'Zero false negatives relative to snapshot and delta overlay',
        FALLBACK_ON_UNCERTAINTY: 'Any POSSIBLY_PRESENT or INSUFFICIENT_KEYS classification routes to Resolver V2',
        SSOT_PRESERVATION: 'Read-only memory projection. PostgreSQL remains SSOT.'
      }
    };

    fs.writeFileSync('reports/atlas/discovery/atlas_stage3p_identity_field_design_v1.json', JSON.stringify(designArtifact, null, 2));
    fs.writeFileSync('reports/atlas/discovery/atlas_stage3p_field_memory_profile_v1.json', JSON.stringify(memProfile, null, 2));

    field.exportToFile('cache_gate31d/identity_field_base.bin');
    console.log('✔ Binary field exported: cache_gate31d/identity_field_base.bin');

    console.log('✔ Artifacts saved:');
    console.log('  - reports/atlas/discovery/atlas_stage3p_identity_field_design_v1.json');
    console.log('  - reports/atlas/discovery/atlas_stage3p_field_memory_profile_v1.json\n');

  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
