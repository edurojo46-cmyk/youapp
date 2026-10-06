import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const { Client } = pg;
const dbConfig = parseDbUrl();

const workerId = process.argv[2] || `worker_${process.pid}`;
const snapshotId = process.argv[3] || 'snap_test_arca_gate32b';
const surfaceId = process.argv[4] || 'SURF_ARCA_RG1817_WEEKLY';
const contentSha = process.argv[5] || '6d32fe5eb9cf48c3b4a2bf17f04c6ca93fbf3b3fa5c3bfab283856ba3ba1f654';

async function main() {
  const client = new Client(dbConfig);
  await client.connect();
  try {
    const res = await client.query(`
      SELECT public.register_or_claim_snapshot(
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
      ) as result;
    `, [
      snapshotId,
      surfaceId,
      contentSha,
      '"etag_gate32b_race"',
      'Sat, 19 Sep 2026 12:00:00 GMT',
      320806200,
      'RG1817_V1',
      6169350,
      new Date().toISOString(),
      workerId,
      60,
      JSON.stringify({ race_test: true })
    ]);

    console.log(JSON.stringify({
      worker_id: workerId,
      pid: process.pid,
      result: res.rows[0].result
    }));
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error(JSON.stringify({ worker_id: workerId, error: err.message }));
  process.exit(1);
});
