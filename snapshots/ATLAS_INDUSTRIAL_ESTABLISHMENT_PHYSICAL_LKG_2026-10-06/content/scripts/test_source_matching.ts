import { dbPool } from '../server/db.ts';

async function testSourceMatching() {
  const sources = await dbPool.query(`
    SELECT source_id, source_name, source_family, current_status, can_produce_entity_rows,
           field_telemetry->>'can_produce_bulk_rows' as bulk_rows,
           field_telemetry->'capability_ir'->>'state' as cap_state,
           field_telemetry->'capability_ir'->>'connector_class' as conn_class
    FROM public.atlas_source_knowledge_map
    WHERE source_id IN (
      'SRC_CKAN_PORTAL_8E56C7A403',
      'SRC_CKAN_PORTAL_228A0A6096',
      'SRC_CKAN_PORTAL_BD572121C1',
      'SRC_CKAN_PORTAL_6E02508C0F'
    );
  `);
  console.log('Matching CKAN sources:');
  console.log(JSON.stringify(sources.rows, null, 2));

  // Also check: How was SRC_CKAN_PORTAL_8E56C7A403 executed in the past?
  // Let's find any historical audit, work items, telemetry or partitions mentioning 8E56C7A403
  const auditRes = await dbPool.query(`
    SELECT * FROM public.atlas_constitution_decisions
    WHERE rules_triggered::text ILIKE '%8E56C7A403%' OR metadata::text ILIKE '%8E56C7A403%'
    LIMIT 5;
  `);
  console.log('Decisions mentioning 8E56C7A403:', auditRes.rows.length);

  // Search partitions
  const partRes = await dbPool.query(`
    SELECT * FROM public.atlas_mission_partitions
    WHERE last_error ILIKE '%8E56C7A403%' OR query_signature ILIKE '%8E56C7A403%'
    LIMIT 5;
  `);
  console.log('Partitions mentioning 8E56C7A403:', partRes.rows.length);

  await dbPool.end();
}

testSourceMatching().catch(console.error);
