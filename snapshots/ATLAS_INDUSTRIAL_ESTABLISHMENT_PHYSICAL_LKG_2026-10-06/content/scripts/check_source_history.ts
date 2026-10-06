import { dbPool } from '../server/db.ts';

async function checkSpecificSource() {
  console.log('--- 1. Search atlas_source_knowledge_map for 8E56C7A403 ---');
  const r1 = await dbPool.query(`
    SELECT source_id, source_name, source_family, current_status, geography_scope, field_telemetry
    FROM public.atlas_source_knowledge_map
    WHERE source_id = 'SRC_CKAN_PORTAL_8E56C7A403';
  `);
  console.log('Exact 8E56C7A403 in atlas_source_knowledge_map:', r1.rows.length);
  if (r1.rows.length > 0) {
    console.log(JSON.stringify(r1.rows[0], null, 2));
  }

  console.log('--- 2. Search all tables for 8E56C7A403 ---');
  const r2 = await dbPool.query(`
    SELECT table_name, column_name 
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND data_type IN ('text', 'character varying', 'jsonb', 'json');
  `);
  console.log('Total text/json columns to scan:', r2.rows.length);

  // Search missions for 8E56C7A403
  const rM = await dbPool.query(`
    SELECT mission_id, objective, status, terminal_reason, criteria, error_message, created_at
    FROM public.atlas_discovery_missions
    WHERE criteria::text ILIKE '%8E56C7A403%' OR error_message ILIKE '%8E56C7A403%';
  `);
  console.log('Missions mentioning 8E56C7A403:', rM.rows.length);
  for (const m of rM.rows) {
    console.log(`- Mission ${m.mission_id}: ${m.objective} -> status: ${m.status}, reason: ${m.terminal_reason}`);
  }

  // Search entities for 8E56C7A403
  const rE = await dbPool.query(`
    SELECT canonical_entity_id, canonical_name, metadata
    FROM public.atlas_canonical_entities
    WHERE metadata::text ILIKE '%8E56C7A403%'
    LIMIT 5;
  `);
  console.log('Entities mentioning 8E56C7A403:', rE.rows.length);
  for (const e of rE.rows) {
    console.log(`- Entity ${e.canonical_name}: source=${e.metadata?.source_id}, relation=${e.metadata?.evidence?.relation_id}`);
  }

  // Check mission #0_4BF23F
  console.log('--- 3. Search for latest GARAGE CABA mission details ---');
  const latestGarage = await dbPool.query(`
    SELECT *
    FROM public.atlas_discovery_missions
    WHERE objective ILIKE '%GARAGE%'
    ORDER BY created_at DESC
    LIMIT 1;
  `);
  if (latestGarage.rows.length > 0) {
    const lg = latestGarage.rows[0];
    console.log('Latest GARAGE mission:', lg.mission_id, lg.status, lg.terminal_reason);
    console.log('Objective:', lg.objective, 'Geography:', lg.geography);
    console.log('Scanned:', lg.scanned_count, 'Discovered:', lg.discovered_count, 'Certified:', lg.certified_new_searchable);
    console.log('Criteria:', JSON.stringify(lg.criteria, null, 2));
  }

  await dbPool.end();
}

checkSpecificSource().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
