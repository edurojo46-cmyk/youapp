import { dbPool } from '../server/db.ts';

async function main() {
  const q = `
    SELECT 
      count(*)::int as total,
      count(*) filter (where validation_state in ('VALIDATED', 'LEARNED'))::int as active,
      count(*) filter (where jsonb_array_length(osm_tags) > 0)::int as with_osm,
      count(*) filter (where jsonb_array_length(clae_codes) > 0)::int as with_clae,
      count(*) filter (where jsonb_array_length(wikidata_ids) > 0)::int as with_wiki
    FROM public.atlas_concept_registry;
  `;
  const res = await dbPool.query(q);
  console.log('CONCEPT_METRICS:', JSON.stringify(res.rows[0]));
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
