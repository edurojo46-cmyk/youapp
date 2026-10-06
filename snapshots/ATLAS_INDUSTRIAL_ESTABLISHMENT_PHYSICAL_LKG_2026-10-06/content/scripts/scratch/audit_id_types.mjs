import pg from 'pg';
import { parseDbUrl } from '../export_search_projection_v2.mjs';

async function main() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT identifier_type, count(*) as count
      FROM public.atlas_person_identity_map
      GROUP BY identifier_type;
    `);
    console.log('Identifier Types in atlas_person_identity_map:');
    console.table(res.rows);

    const srcRes = await client.query(`
      SELECT source_id, count(*) as count
      FROM public.atlas_person_identity_map
      GROUP BY source_id
      ORDER BY count DESC
      LIMIT 10;
    `);
    console.log('Top Source IDs in atlas_person_identity_map:');
    console.table(srcRes.rows);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
