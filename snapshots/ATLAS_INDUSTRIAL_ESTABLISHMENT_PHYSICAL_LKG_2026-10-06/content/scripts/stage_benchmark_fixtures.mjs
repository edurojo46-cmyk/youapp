import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const { Client } = pg;
const dbConfig = parseDbUrl();

export async function stageBenchmarkFixtures(client, count = 5000) {
  console.log(`Staging ${count} controlled benchmark outbox fixtures...`);
  // Clean up any old benchmark fixtures
  await client.query("DELETE FROM public.atlas_search_outbox WHERE source_id = 'GATE32C_BENCHMARK_FIXTURE';");

  // Get sample of existing canonical people IDs to reuse
  const pidsRes = await client.query('SELECT DISTINCT atlas_person_id FROM public.atlas_person_identity_map LIMIT 500;');
  const pids = pidsRes.rows.map(r => r.atlas_person_id);

  // Bulk insert in batches of 1000
  const batchSize = 1000;
  for (let i = 0; i < count; i += batchSize) {
    const currentBatch = Math.min(batchSize, count - i);
    const rows = [];
    for (let j = 0; j < currentBatch; j++) {
      const idx = i + j;
      const pid = pids[idx % pids.length];
      const payload = {
        atlas_person_id: pid,
        display_name: `BENCHMARK CANDIDATE ${idx}`,
        search_text_normalized: `benchmark candidate ${idx} professional national`,
        role: 'BENCHMARK_ROLE',
        profession: 'BENCHMARK_PROFESSION',
        organization: 'BENCHMARK_ORG',
        source_id: 'GATE32C_BENCHMARK_FIXTURE',
        source_record_id: `bench_rec_${idx}`,
        source_surface_id: 'SURF_BENCHMARK',
        source_ids: ['GATE32C_BENCHMARK_FIXTURE'],
        evidence_state: 'BENCHMARK_STAGED',
        geography: 'Argentina',
        province: 'Nacional',
        created_at: new Date().toISOString()
      };

      rows.push({
        atlas_person_id: pid,
        source_id: 'GATE32C_BENCHMARK_FIXTURE',
        source_record_id: `bench_rec_${idx}`,
        payload,
        payload_version: 1,
        status: 'PENDING'
      });
    }

    await client.query(`
      INSERT INTO public.atlas_search_outbox (
        atlas_person_id, source_id, source_record_id, payload, payload_version, status, attempt_count, next_retry_at
      )
      SELECT 
        r.atlas_person_id, r.source_id, r.source_record_id, r.payload, r.payload_version, r.status, 0, now()
      FROM jsonb_to_recordset($1::jsonb) AS r(
        atlas_person_id text, source_id text, source_record_id text, payload jsonb, payload_version integer, status text
      );
    `, [JSON.stringify(rows)]);
  }

  const check = await client.query("SELECT count(*) FROM public.atlas_search_outbox WHERE source_id = 'GATE32C_BENCHMARK_FIXTURE' AND status = 'PENDING';");
  console.log(`Staged ${check.rows[0].count} benchmark outbox rows.`);
  return parseInt(check.rows[0].count, 10);
}

export async function cleanupBenchmarkFixtures(client) {
  const del = await client.query("DELETE FROM public.atlas_search_outbox WHERE source_id = 'GATE32C_BENCHMARK_FIXTURE';");
  console.log(`Cleaned up benchmark outbox fixtures (${del.rowCount} rows removed).`);
}

if (process.argv[1] && process.argv[1].endsWith('stage_benchmark_fixtures.mjs')) {
  const client = new Client(dbConfig);
  client.connect().then(async () => {
    try {
      await stageBenchmarkFixtures(client, 1000);
      await cleanupBenchmarkFixtures(client);
    } finally {
      await client.end();
    }
  }).catch(console.error);
}
