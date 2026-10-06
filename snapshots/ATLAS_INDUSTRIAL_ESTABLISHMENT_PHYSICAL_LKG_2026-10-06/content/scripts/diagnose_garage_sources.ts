import { dbPool } from '../server/db.ts';

async function diagnose() {
  console.log('=== 1. SEARCH FOR MISSION 4BF23F ===');
  const mRes = await dbPool.query(`
    SELECT mission_id, objective, entity_type, geography, status, terminal_reason, criteria, error_message, created_at, completed_at
    FROM public.atlas_discovery_missions
    WHERE mission_id ILIKE '%4BF23F%' OR mission_id ILIKE '%4bf23f%'
    LIMIT 5;
  `);

  if (mRes.rows.length > 0) {
    const m = mRes.rows[0];
    console.log('Found 4BF23F:', m.mission_id, m.status, m.terminal_reason);
    console.log('Created at:', m.created_at);
    console.log('Error message:', m.error_message);
    console.log('Criteria:', JSON.stringify(m.criteria, null, 2));
  } else {
    console.log('4BF23F not found by exact string, checking recent GARAGE missions:');
    const recent = await dbPool.query(`
      SELECT mission_id, objective, entity_type, geography, status, terminal_reason, created_at
      FROM public.atlas_discovery_missions
      WHERE objective ILIKE '%GARAGE%'
      ORDER BY created_at DESC LIMIT 5;
    `);
    console.log(recent.rows);
  }

  console.log('\n=== 2. HISTORICAL GARAGE MISSIONS WITH ROWS/CERTIFIED > 0 ===');
  const histMissions = await dbPool.query(`
    SELECT mission_id, objective, entity_type, geography, status, terminal_reason, certified_new_searchable, scanned_count, criteria, created_at
    FROM public.atlas_discovery_missions
    WHERE objective ILIKE '%GARAGE%'
    ORDER BY created_at DESC LIMIT 10;
  `);
  for (const hm of histMissions.rows) {
    console.log(`- ${hm.mission_id}: status=${hm.status}, reason=${hm.terminal_reason}, cert=${hm.certified_new_searchable}, scanned=${hm.scanned_count}, created=${hm.created_at}`);
  }

  console.log('\n=== 3. CHECK atlas_source_knowledge_map FOR 8E56C7A403 ===');
  const kmExact = await dbPool.query(`
    SELECT *
    FROM public.atlas_source_knowledge_map
    WHERE source_id ILIKE '%8E56C7A403%' OR source_id ILIKE '%8e56c7a403%';
  `);
  console.log(`Exact 8E56C7A403 rows: ${kmExact.rows.length}`);
  for (const row of kmExact.rows) {
    console.log('Source ID:', row.source_id);
    console.log(JSON.stringify(row, null, 2));
  }

  console.log('\n=== 4. CHECK ALL SOURCES IN atlas_source_knowledge_map ===');
  const allKM = await dbPool.query(`
    SELECT source_id, source_name, source_family, access_method, current_status, geography_scope, entity_types_supported, row_unit_supported, can_produce_entity_rows
    FROM public.atlas_source_knowledge_map;
  `);
  console.log(`Total sources in KM: ${allKM.rows.length}`);
  for (const s of allKM.rows) {
    console.log(`- ${s.source_id} (${s.source_name}): family=${s.source_family}, status=${s.current_status}, geo=${s.geography_scope}, entity_types=${JSON.stringify(s.entity_types_supported)}, row_units=${JSON.stringify(s.row_unit_supported)}, can_produce=${s.can_produce_entity_rows}`);
  }

  await dbPool.end();
}

diagnose().catch(err => {
  console.error('Diagnosis error:', err);
  process.exit(1);
});
