import { dbPool } from '../server/db.ts';

async function main() {
  const colsRes = await dbPool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'atlas_source_knowledge_map'
    ORDER BY ordinal_position;
  `);
  console.log('Columns in atlas_source_knowledge_map:');
  for (const c of colsRes.rows) {
    console.log(`  ${c.column_name} (${c.data_type})`);
  }

  const countRes = await dbPool.query(`SELECT count(*) as total FROM public.atlas_source_knowledge_map;`);
  console.log('Total rows:', countRes.rows[0].total);

  const sample = await dbPool.query(`SELECT * FROM public.atlas_source_knowledge_map LIMIT 3;`);
  console.log('Sample 3 rows:', JSON.stringify(sample.rows, null, 2));
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
