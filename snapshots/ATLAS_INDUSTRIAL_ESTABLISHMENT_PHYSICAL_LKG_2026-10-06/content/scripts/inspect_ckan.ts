import { dbPool } from '../server/db.ts';

async function inspectCkan() {
  const res = await dbPool.query(`
    SELECT source_id, source_name, canonical_url, source_family, supported_motor_template, field_telemetry
    FROM public.atlas_source_knowledge_map
    WHERE source_id = 'SRC_CKAN_PORTAL_8E56C7A403'
  `);
  console.log(JSON.stringify(res.rows[0], null, 2));
  process.exit(0);
}

inspectCkan().catch(err => {
  console.error(err);
  process.exit(1);
});
