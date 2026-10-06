import { dbPool } from '../server/db.ts';

async function main() {
  console.log('=== AUDITING PUBLIC.ATLAS_SOURCE_KNOWLEDGE_MAP ===');
  
  // Check table existence and row count
  const countRes = await dbPool.query(`
    SELECT count(*) as total,
           count(*) FILTER (WHERE status = 'ACTIVE' OR status = 'VALIDATED' OR validation_state = 'ACTIVE') as active_count
    FROM public.atlas_source_knowledge_map;
  `);
  console.log('Row counts:', countRes.rows[0]);

  // Inspect schema
  const colsRes = await dbPool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'atlas_source_knowledge_map'
    ORDER BY ordinal_position;
  `);
  console.log('Columns:');
  for (const c of colsRes.rows) {
    console.log(`  ${c.column_name} (${c.data_type})`);
  }

  // Sample sources
  const sampleRes = await dbPool.query(`
    SELECT source_id, source_name, source_type, protocol, source_class, 
           domain, sector, geography_level, validation_state, status
    FROM public.atlas_source_knowledge_map
    LIMIT 10;
  `);
  console.log('\nSample rows:');
  for (const r of sampleRes.rows) {
    console.log(r);
  }
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
