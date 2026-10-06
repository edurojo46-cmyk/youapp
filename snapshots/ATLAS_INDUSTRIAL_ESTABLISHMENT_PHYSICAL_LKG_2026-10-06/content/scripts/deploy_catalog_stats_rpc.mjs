import dotenv from 'dotenv';
import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

async function createStatsFunction() {
  const client = new pg.Client({ ...parseDbUrl() });
  await client.connect();

  console.log('Creating public.get_atlas_industrial_catalog_stats() RPC function...');

  await client.query(`
    CREATE OR REPLACE FUNCTION public.get_atlas_industrial_catalog_stats()
    RETURNS jsonb LANGUAGE sql STABLE AS $$
      SELECT jsonb_build_object(
        'totalRelations', (SELECT count(*) FROM public.atlas_products WHERE status = 'ACTIVE'),
        'totalProducts', (SELECT count(DISTINCT name) FROM public.atlas_products WHERE status = 'ACTIVE'),
        'totalEntities', (SELECT count(DISTINCT attributes_json->>'company_name') FROM public.atlas_products WHERE status = 'ACTIVE'),
        'totalCategories', (SELECT count(DISTINCT category) FROM public.atlas_products WHERE status = 'ACTIVE'),
        'totalProvinces', (SELECT count(DISTINCT attributes_json->>'province') FROM public.atlas_products WHERE status = 'ACTIVE')
      );
    $$;
  `);

  const res = await client.query(`SELECT public.get_atlas_industrial_catalog_stats() as stats;`);
  console.log('RPC output:', res.rows[0].stats);

  await client.end();
}

createStatsFunction().catch(console.error);
