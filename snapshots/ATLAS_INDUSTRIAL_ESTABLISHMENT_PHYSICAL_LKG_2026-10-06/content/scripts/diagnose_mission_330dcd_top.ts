import { dbPool } from '../server/db.ts';

async function main() {
  const res = await dbPool.query(`
    SELECT mission_id, objective, geography, status, terminal_reason,
           scanned_count, certified_new_searchable, true_net_new_count,
           duplicate_existing_count, rejected_count, persisted_count,
           error_message, started_at, completed_at
    FROM public.atlas_discovery_missions 
    WHERE mission_id LIKE '%330DCD%'
  `);

  for (const r of res.rows) {
    console.log(JSON.stringify(r, null, 2));
  }
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
