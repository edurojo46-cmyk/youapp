import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });

async function main() {
  console.log('Testing live metrics...');
  const t0 = Date.now();
  const resMetrics = await pool.query(`
    SELECT 
      caba_qualified_unique_real_people,
      pba_qualified_unique_real_people,
      caba_pba_qualified_unique_real_people,
      qualified_unique_real_people,
      unique_people,
      updated_at
    FROM atlas_people_live_metrics
    WHERE id = 'current';
  `);
  console.log('Live metrics:', resMetrics.rows[0], `in ${Date.now() - t0}ms`);

  console.log('\nTesting exact canonical count query...');
  const t1 = Date.now();
  try {
    const resExact = await pool.query(`
      SELECT count(DISTINCT atlas_person_id) as canonical_people_count
      FROM atlas_person_identity_map;
    `);
    console.log('Exact identity map count:', resExact.rows[0], `in ${Date.now() - t1}ms`);
  } catch (e) {
    console.error('Exact count error:', e.message);
  }

  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
