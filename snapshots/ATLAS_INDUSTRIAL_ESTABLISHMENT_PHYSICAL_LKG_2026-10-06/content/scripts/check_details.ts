import { dbPool } from '../server/db.ts';

async function checkDetails() {
  console.log('--- 1. Search atlas_source_knowledge_map for 8E56C7A403 ---');
  const r1 = await dbPool.query(`
    SELECT source_id, source_name, source_family, current_status, geography_scope, field_telemetry
    FROM public.atlas_source_knowledge_map
    WHERE source_id ILIKE '%8E56C7A403%';
  `);
  console.log('Exact 8E56C7A403 in atlas_source_knowledge_map count:', r1.rows.length);
  for (const s of r1.rows) {
    console.log('ID:', s.source_id);
    console.log('Name:', s.source_name);
    console.log('Family:', s.source_family);
    console.log('Status:', s.current_status);
    console.log('Scope:', s.geography_scope);
    console.log('Telemetry:', JSON.stringify(s.field_telemetry, null, 2));
  }

  console.log('\n--- 2. Search all source KM rows where name/url contains garage or estacionamiento or ckan ---');
  const rS = await dbPool.query(`
    SELECT source_id, source_name, source_family, current_status, canonical_url
    FROM public.atlas_source_knowledge_map
    WHERE source_id ILIKE '%CKAN%' OR source_name ILIKE '%garage%' OR source_name ILIKE '%estacionamiento%' OR canonical_url ILIKE '%garage%' OR canonical_url ILIKE '%estacionamiento%' OR canonical_url ILIKE '%playa%';
  `);
  console.log(`Matched ${rS.rows.length} sources:`);
  for (const s of rS.rows) {
    console.log(`- ${s.source_id}: ${s.source_name} (${s.source_family}) -> status: ${s.current_status}, url: ${s.canonical_url}`);
  }

  console.log('\n--- 3. Search entities created by any mission with GARAGE ---');
  const rEnt = await dbPool.query(`
    SELECT canonical_entity_id, canonical_name, entity_type, metadata->>'source' as src, metadata->>'source_id' as sid, metadata->>'mission_id' as mid, created_at
    FROM public.atlas_canonical_entities
    WHERE canonical_name ILIKE '%garage%' OR metadata->>'role' ILIKE '%garage%' OR metadata->>'industry' ILIKE '%garage%' OR metadata->>'category' ILIKE '%garage%'
    ORDER BY created_at DESC
    LIMIT 10;
  `);
  console.log(`Found ${rEnt.rows.length} garage entities:`);
  for (const e of rEnt.rows) {
    console.log(`- Entity: "${e.canonical_name}" | src: ${e.src} | sid: ${e.sid} | mid: ${e.mid} | created: ${e.created_at}`);
  }

  await dbPool.end();
}

checkDetails().catch(e => { console.error(e); process.exit(1); });
