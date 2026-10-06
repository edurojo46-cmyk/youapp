import { dbPool } from '../server/db.ts';

async function listDistinctConcepts() {
  const res = await dbPool.query(`
    SELECT source_id, source_name, source_family, supported_motor_template, geography_scope, entity_types_supported, field_telemetry
    FROM public.atlas_source_knowledge_map
    WHERE can_produce_entity_rows = 'TRUE'
      AND current_status IN ('CANARY', 'PROMOTED', 'ACTIVE')
    ORDER BY quality_score DESC
    LIMIT 25;
  `);

  console.log(`Found ${res.rows.length} validated sources in SSOT:`);
  for (const r of res.rows) {
    console.log(`- ${r.source_id}: "${r.source_name}" | family: ${r.source_family} | template: ${r.supported_motor_template} | geo: ${r.geography_scope}`);
  }
  process.exit(0);
}

listDistinctConcepts().catch(err => {
  console.error(err);
  process.exit(1);
});
