import { dbPool } from '../server/db.ts';

async function main() {
  const res = await dbPool.query(`
    SELECT source_id, source_name, canonical_url, source_family, supported_motor_template, field_telemetry
    FROM public.atlas_source_knowledge_map 
    WHERE source_name ILIKE '%estacionamiento%' 
       OR source_name ILIKE '%garage%' 
       OR canonical_url ILIKE '%estacionamiento%'
  `);
  for (const r of res.rows) {
    console.log('ID:', r.source_id);
    console.log('Name:', r.source_name);
    console.log('URL:', r.canonical_url);
    console.log('Family:', r.source_family);
    console.log('Template:', r.supported_motor_template);
    console.log('Resource links in telemetry:', r.field_telemetry?.capability_ir?.technical_inspection?.resource_links);
    console.log('Direct URL in capability_ir:', r.field_telemetry?.capability_ir?.canonical_url);
    console.log('---');
  }
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
