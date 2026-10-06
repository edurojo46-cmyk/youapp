import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

async function main() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 5 });
  const client = await pool.connect();

  const preflightTs = '2026-09-20T18:31:35.322Z';

  console.log('--- 1. CAMPAIGN TIME WINDOW ---');
  const rTime = await client.query(`
    SELECT min(observed_at) as campaign_start, max(observed_at) as campaign_end, count(*) as campaign_source_rows
    FROM public.atlas_person_identity_map
    WHERE source_id = 'ARCA_CONDICION_TRIBUTARIA' AND observed_at >= $1
  `, [preflightTs]);
  console.log(rTime.rows[0]);

  const campaignStart = rTime.rows[0].campaign_start;

  console.log('--- 2. CANONICAL BASELINE VS FINAL ---');
  // Baseline set of canonical people: those present before campaignStart
  const rBaseline = await client.query(`
    SELECT count(DISTINCT atlas_person_id) as baseline_canonical
    FROM public.atlas_person_identity_map
    WHERE observed_at < $1 AND atlas_person_id IS NOT NULL
  `, [campaignStart]);
  console.log('Baseline Canonical:', rBaseline.rows[0].baseline_canonical);

  const rFinal = await client.query(`
    SELECT count(DISTINCT atlas_person_id) as final_canonical
    FROM public.atlas_person_identity_map
    WHERE atlas_person_id IS NOT NULL
  `);
  console.log('Final Canonical:', rFinal.rows[0].final_canonical);

  console.log('--- 3. NEW VS MERGED IN FINAL CAMPAIGN ---');
  // In the campaign (observed_at >= campaignStart), how many distinct atlas_person_id are NEW vs MERGED into baseline?
  // Using a temporary table or CTE with index for speed:
  await client.query('CREATE TEMP TABLE baseline_ids AS SELECT DISTINCT atlas_person_id FROM public.atlas_person_identity_map WHERE observed_at < $1 AND atlas_person_id IS NOT NULL', [campaignStart]);
  await client.query('CREATE INDEX ON baseline_ids (atlas_person_id)');

  const rSplit = await client.query(`
    SELECT 
      count(DISTINCT m.atlas_person_id) FILTER (WHERE b.atlas_person_id IS NULL) as net_new_canonical,
      count(DISTINCT m.atlas_person_id) FILTER (WHERE b.atlas_person_id IS NOT NULL) as merged_canonical,
      count(DISTINCT m.source_person_id) as distinct_campaign_source_records,
      count(*) as total_campaign_mappings
    FROM public.atlas_person_identity_map m
    LEFT JOIN baseline_ids b ON m.atlas_person_id = b.atlas_person_id
    WHERE m.source_id = 'ARCA_CONDICION_TRIBUTARIA' AND m.observed_at >= $1
  `, [campaignStart]);
  console.log('Campaign Split:', rSplit.rows[0]);

  client.release();
  await pool.end();
}

main().catch(console.error);
