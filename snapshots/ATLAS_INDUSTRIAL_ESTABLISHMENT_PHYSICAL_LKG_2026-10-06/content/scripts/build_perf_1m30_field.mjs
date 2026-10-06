import fs from 'node:fs';
import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';
import { IdentityInductionField } from './lib/identity_field.mjs';

dotenv.config();

async function main() {
  console.log('================================================================');
  console.log('⚡ ATLAS PERF 1M30: BUILD BASELINE IDENTITY INDUCTION FIELD');
  console.log('================================================================\n');

  const client = new pg.Client(parseDbUrl());
  await client.connect();

  const field = new IdentityInductionField({
    bitsPerField: 48000000, // 48M bits = 6 MB per field
    kHashes: 8
  });

  try {
    console.log('Fetching SSOT watermark...');
    const wmRes = await client.query('SELECT max(observed_at) as max_obs FROM public.atlas_person_identity_map;');
    const watermark = wmRes.rows[0].max_obs;
    field.baseWatermark = watermark;
    field.effectiveWatermark = watermark;
    console.log(`SSOT Snapshot Watermark: ${watermark}\n`);

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

    const outPath = 'cache_gate31d/identity_field_perf_1m30.bin';
    console.log(`Exporting baseline binary field to ${outPath}...`);
    field.exportToFile(outPath);
    const stat = fs.statSync(outPath);
    console.log(`Exported ${stat.size} bytes successfully.`);

    const memProfile = field.getMemoryProfile();
    memProfile.BUILD_SECONDS = buildSec;
    memProfile.INGESTION_RATE_KEYS_SEC = Number((rowCount / buildSec).toFixed(0));

    console.log('\n--- IDENTITY INDUCTION FIELD PROFILE ---');
    console.log(`  Source Keys:     ${memProfile.SOURCE_FIELD_KEYS.toLocaleString()}`);
    console.log(`  Stable Keys:     ${memProfile.STABLE_FIELD_KEYS.toLocaleString()}`);
    console.log(`  Total Keys:      ${memProfile.TOTAL_FIELD_KEYS.toLocaleString()}`);
    console.log(`  Filter RAM:      ${memProfile.TOTAL_FIELD_MEMORY_MB} MB`);
    console.log(`  Bits Per Key:    ${memProfile.BITS_PER_KEY}`);
    console.log(`  Build Duration:  ${memProfile.BUILD_SECONDS}s\n`);

    fs.writeFileSync(
      'reports/atlas/discovery/atlas_perf_1m30_field_memory_profile_v1.json',
      JSON.stringify(memProfile, null, 2)
    );
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
