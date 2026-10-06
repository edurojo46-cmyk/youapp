import { dbPool } from '../server/db.ts';

async function main() {
  const res = await dbPool.query(`
    SELECT *
    FROM public.atlas_discovery_missions 
    WHERE mission_id LIKE '%330DCD%'
  `);

  console.log(`Found ${res.rows.length} row(s) matching 330DCD:`);
  for (const r of res.rows) {
    console.log(JSON.stringify(r, null, 2));
  }
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
