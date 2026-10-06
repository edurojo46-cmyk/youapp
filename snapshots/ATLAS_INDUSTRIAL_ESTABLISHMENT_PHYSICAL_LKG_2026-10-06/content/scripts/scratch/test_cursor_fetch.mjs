import pg from 'pg';
import { parseDbUrl } from '../export_search_projection_v2.mjs';

async function main() {
  const client = new pg.Client(parseDbUrl());
  await client.connect();
  try {
    const t0 = performance.now();
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;');
    await client.query(`
      DECLARE cur_id_keys NO SCROLL CURSOR FOR
      SELECT source_id, source_person_id, identifier_type, identifier_value
      FROM public.atlas_person_identity_map;
    `);

    let totalFetched = 0;
    const fetchBatch = 100000;
    while (true) {
      const res = await client.query(`FETCH ${fetchBatch} FROM cur_id_keys;`);
      totalFetched += res.rows.length;
      process.stdout.write(`\rFetched ${totalFetched.toLocaleString()} rows in ${((performance.now() - t0)/1000).toFixed(1)}s...`);
      if (res.rows.length < fetchBatch) break;
    }
    await client.query('CLOSE cur_id_keys;');
    await client.query('COMMIT;');

    console.log(`\n✔ Completed fetch of ${totalFetched.toLocaleString()} rows in ${((performance.now() - t0)/1000).toFixed(2)}s`);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
