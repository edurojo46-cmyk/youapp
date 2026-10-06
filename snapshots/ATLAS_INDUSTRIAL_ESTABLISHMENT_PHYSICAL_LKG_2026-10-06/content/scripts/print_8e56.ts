import { dbPool } from '../server/db.ts';

async function print8E56() {
  const res = await dbPool.query(`
    SELECT * FROM public.atlas_source_knowledge_map
    WHERE source_id = 'SRC_CKAN_PORTAL_8E56C7A403';
  `);
  console.log(JSON.stringify(res.rows[0], null, 2));
  await dbPool.end();
}

print8E56().catch(console.error);
