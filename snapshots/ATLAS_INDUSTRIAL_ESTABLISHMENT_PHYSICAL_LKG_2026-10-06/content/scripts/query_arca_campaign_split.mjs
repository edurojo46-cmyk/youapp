import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

async function main() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 5 });
  const client = await pool.connect();

  const preflightTs = '2026-09-20T18:31:35.322Z';

  const rBefore = await client.query(`
    SELECT count(*) as rows,
           count(DISTINCT atlas_person_id) as distinct_canonical,
           count(DISTINCT source_person_id) as distinct_source
    FROM public.atlas_person_identity_map
    WHERE source_id = 'ARCA_CONDICION_TRIBUTARIA' AND observed_at < $1
  `, [preflightTs]);
  console.log('ARCA BEFORE preflight (< ' + preflightTs + '):', rBefore.rows[0]);

  const rAfter = await client.query(`
    SELECT count(*) as rows,
           count(DISTINCT atlas_person_id) as distinct_canonical,
           count(DISTINCT source_person_id) as distinct_source
    FROM public.atlas_person_identity_map
    WHERE source_id = 'ARCA_CONDICION_TRIBUTARIA' AND observed_at >= $1
  `, [preflightTs]);
  console.log('ARCA AFTER preflight (>= ' + preflightTs + '):', rAfter.rows[0]);

  const rAllBefore = await client.query(`
    SELECT count(*) as total_rows, count(DISTINCT atlas_person_id) as distinct_canonical
    FROM public.atlas_person_identity_map
    WHERE observed_at < $1
  `, [preflightTs]);
  console.log('ALL SOURCES BEFORE preflight (< ' + preflightTs + '):', rAllBefore.rows[0]);

  // Also check distinct canonical overall before vs after
  // Net new canonical identities created in final campaign:
  const rNewInCampaign = await client.query(`
    SELECT count(DISTINCT atlas_person_id) as new_canonical_in_campaign
    FROM public.atlas_person_identity_map
    WHERE observed_at >= $1
      AND atlas_person_id NOT IN (
        SELECT atlas_person_id FROM public.atlas_person_identity_map WHERE observed_at < $1
      )
  `, [preflightTs]);
  console.log('NET NEW CANONICAL IN FINAL CAMPAIGN:', rNewInCampaign.rows[0]);

  client.release();
  await pool.end();
}

main().catch(console.error);
