import { dbPool } from '../server/db.ts';

async function main() {
  console.log('=== DEEP AUDIT OF ATLAS_SOURCE_KNOWLEDGE_MAP ===');

  // 1. Status breakdown
  const statusRes = await dbPool.query(`
    SELECT current_status, permitted_status, count(*) as count
    FROM public.atlas_source_knowledge_map
    GROUP BY current_status, permitted_status
    ORDER BY count DESC;
  `);
  console.log('Status breakdown:', statusRes.rows);

  // 2. Protocols (source types / families)
  const protoRes = await dbPool.query(`
    SELECT protocol, count(*) as count
    FROM public.atlas_source_knowledge_map
    GROUP BY protocol
    ORDER BY count DESC;
  `);
  console.log('\nProtocols breakdown:', protoRes.rows);

  // 3. Source families
  const famRes = await dbPool.query(`
    SELECT source_family, count(*) as count
    FROM public.atlas_source_knowledge_map
    GROUP BY source_family
    ORDER BY count DESC
    LIMIT 25;
  `);
  console.log('\nTop 25 Source Families:', famRes.rows);

  // 4. Chambers, Associations, Colleges, Federations
  const chamberRes = await dbPool.query(`
    SELECT source_id, source_name, source_family, protocol, canonical_url, geography_scope
    FROM public.atlas_source_knowledge_map
    WHERE source_name ILIKE '%camara%'
       OR source_name ILIKE '%cámara%'
       OR source_name ILIKE '%asociaci%'
       OR source_name ILIKE '%federaci%'
       OR source_name ILIKE '%colegio%'
       OR source_name ILIKE '%union%'
       OR source_name ILIKE '%unión%'
       OR source_name ILIKE '%directorio%'
    LIMIT 50;
  `);
  console.log(`\nChambers/Associations/Colegios/Directorios found (${chamberRes.rows.length}):`);
  for (const r of chamberRes.rows) {
    console.log(`  - [${r.source_id}] "${r.source_name}" (${r.protocol} / ${r.geography_scope}) -> ${r.canonical_url}`);
  }

  // 5. Social / Commercial profile sources
  const socialRes = await dbPool.query(`
    SELECT source_id, source_name, source_family, protocol, canonical_url, geography_scope
    FROM public.atlas_source_knowledge_map
    WHERE source_name ILIKE '%social%'
       OR source_name ILIKE '%linkedin%'
       OR source_name ILIKE '%instagram%'
       OR source_name ILIKE '%facebook%'
       OR source_name ILIKE '%twitter%'
       OR source_name ILIKE '%youtube%'
       OR source_name ILIKE '%perfil%'
    LIMIT 50;
  `);
  console.log(`\nSocial/Profile sources found (${socialRes.rows.length}):`);
  for (const r of socialRes.rows) {
    console.log(`  - [${r.source_id}] "${r.source_name}" (${r.protocol} / ${r.geography_scope}) -> ${r.canonical_url}`);
  }
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
