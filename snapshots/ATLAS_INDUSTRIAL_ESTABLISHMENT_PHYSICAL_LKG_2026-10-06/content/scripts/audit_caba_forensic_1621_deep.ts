import { pool } from '../src/lib/db/pool';

async function run() {
  const res = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'atlas_person_identity_map'");
  console.log('Columns of atlas_person_identity_map:', res.rows.map(r => r.column_name));

  const res2 = await pool.query("SELECT source_name, count(distinct atlas_person_id) as unique_persons, count(*) as rows FROM atlas_person_identity_map GROUP BY source_name");
  console.log('Sources in atlas_person_identity_map:', res2.rows);

  // Check how many atlas_person_id have multiple sources (where one is BIEP_APN and another is non-BIEP)
  const res3 = await pool.query(`
    SELECT m1.atlas_person_id, m1.source_name as s1, m1.source_person_id as p1, 
           m2.source_name as s2, m2.source_person_id as p2
    FROM atlas_person_identity_map m1
    JOIN atlas_person_identity_map m2 ON m1.atlas_person_id = m2.atlas_person_id AND m1.source_name != m2.source_name
    WHERE m1.source_name = 'BIEP_APN'
    LIMIT 50
  `);
  console.log('BIEP cross-source merges in identity map (first 50):', res3.rows);
  console.log('Total cross-source merges with BIEP:', res3.rowCount);

  await pool.end();
}

run().catch(console.error);
