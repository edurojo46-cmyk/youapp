import { dbPool } from '../server/db.ts';

async function checkMission() {
  const res = await dbPool.query(`
    SELECT mission_id, status, terminal_reason, scanned_count, certified_new_searchable,
           duplicate_existing_count, rejected_count, checkpoint_data
    FROM public.atlas_discovery_missions
    WHERE mission_id = 'MISS_1791202631041_E3FEF6'
  `);
  
  if (res.rows.length === 0) {
    console.log('Mission not found');
    process.exit(1);
  }
  
  const m = res.rows[0];
  console.log('Mission summary:');
  console.log('Status:', m.status);
  console.log('Terminal Reason:', m.terminal_reason);
  console.log('Scanned:', m.scanned_count);
  console.log('Certified:', m.certified_new_searchable);
  console.log('Duplicates:', m.duplicate_existing_count);
  console.log('Rejected:', m.rejected_count);
  const wis = m.checkpoint_data?.orchestrator_telemetry?.work_items || [];
  for (const w of wis) {
    console.log(w.kind, '|', w.source_id, '|', w.status, '| scanned:', w.items_scanned, '| yielded:', w.items_yielded);
  }
  
  // Also check candidates in ledger or db
  const candRes = await dbPool.query(`
    SELECT count(*) as total_candidates
    FROM public.atlas_people_discovery_candidates
    WHERE mission_id = 'MISS_1791202631041_E3FEF6'
  `).catch(() => ({ rows: [] }));
  console.log('DB candidates count:', candRes.rows[0]?.total_candidates);

  process.exit(0);
}

checkMission().catch(err => {
  console.error(err);
  process.exit(1);
});
