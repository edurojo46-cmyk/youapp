import { dbPool } from '../server/db.ts';

async function main() {
  console.log('=== SEARCHING FOR MISSION #9_37055C ===');
  const res = await dbPool.query(`
    SELECT * FROM public.atlas_discovery_missions 
    WHERE mission_id LIKE '%37055C%' OR mission_id LIKE '%37055c%'
    ORDER BY created_at DESC LIMIT 5;
  `);

  if (res.rows.length === 0) {
    console.log('Not found by 37055C, searching recent missions:');
    const recent = await dbPool.query(`
      SELECT mission_id, objective, entity_type, geography, status, terminal_reason, created_at, started_at
      FROM public.atlas_discovery_missions
      ORDER BY created_at DESC LIMIT 5;
    `);
    console.log(JSON.stringify(recent.rows, null, 2));
  } else {
    console.log(JSON.stringify(res.rows[0], null, 2));
  }
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
