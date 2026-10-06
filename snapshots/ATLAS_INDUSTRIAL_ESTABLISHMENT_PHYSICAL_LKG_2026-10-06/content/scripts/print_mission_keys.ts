import { dbPool } from '../server/db.ts';

async function main() {
  const res = await dbPool.query(`
    SELECT * FROM public.atlas_discovery_missions 
    WHERE mission_id LIKE '%37055C%' OR mission_id LIKE '%37055c%'
    LIMIT 1;
  `);
  console.log('COLUMNS:', Object.keys(res.rows[0]));
  const r = res.rows[0];
  console.log('MISSION_ID:', r.mission_id);
  console.log('OBJECTIVE:', r.objective);
  console.log('ENTITY_TYPE:', r.entity_type);
  console.log('GEOGRAPHY:', r.geography);
  console.log('STATUS:', r.status);
  console.log('TERMINAL_REASON:', r.terminal_reason);
  console.log('TARGET_NEW_RECORDS:', r.target_new_records);
  console.log('CREATED_AT:', r.created_at);
  console.log('STARTED_AT:', r.started_at);
  console.log('COMPLETED_AT:', r.completed_at);
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
