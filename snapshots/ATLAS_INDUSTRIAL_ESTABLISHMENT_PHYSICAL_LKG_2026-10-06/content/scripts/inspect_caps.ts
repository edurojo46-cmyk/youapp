import { dbPool } from '../server/db.ts';

async function main() {
  const res = await dbPool.query(`
    SELECT source_id, source_name, field_telemetry
    FROM public.atlas_source_knowledge_map
    WHERE can_produce_entity_rows = 'TRUE'
      AND current_status IN ('CANARY', 'PROMOTED', 'ACTIVE')
    LIMIT 30;
  `);

  for (const r of res.rows) {
    const cap = r.field_telemetry?.capability_ir;
    console.log(r.source_id, '|', r.source_name, '| archetypes:', cap?.source_archetype, '| categories:', cap?.categories_supported || cap?.target_sectors || cap?.relations_supported);
  }
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
