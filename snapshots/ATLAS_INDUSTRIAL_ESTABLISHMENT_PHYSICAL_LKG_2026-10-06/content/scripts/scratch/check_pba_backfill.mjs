import pg from 'pg';
import { parseDbUrl } from '../export_search_projection_v2.mjs';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const c = new pg.Client(parseDbUrl());
  await c.connect();

  console.log('=== CHECKING FOR UNTAGGED PBA & CABA HISTORICAL IDENTITIES ===\n');

  // 1. Check if there are any candidate rows with source_id from PBA institutions
  const pbaSourcePatterns = [
    'sedici%', 'cic%', 'inta%', 'unsam%', 'unq%', 'unlp%', 'mdp%', 'bblanca%', 'laplata%'
  ];
  const pbaSourcesRes = await c.query(`
    SELECT source_id, count(*) as count, count(*) FILTER (WHERE target_region = 'PBA') as tagged_pba
    FROM atlas_people_discovery_candidates
    WHERE source_id ILIKE ANY($1)
    GROUP BY source_id;
  `, [pbaSourcePatterns]);
  console.log('Candidates from PBA source patterns:');
  console.table(pbaSourcesRes.rows);

  // 2. Check if there are any candidate rows with CABA source patterns
  const cabaSourcePatterns = [
    '%caba%', '%uba%', '%gcba%', '%cpacf%', '%cpcecaba%', '%cpau%', '%igj%'
  ];
  const cabaSourcesRes = await c.query(`
    SELECT 
      count(*) as total_caba_source_rows,
      count(*) FILTER (WHERE target_region = 'CABA') as tagged_caba,
      count(*) FILTER (WHERE target_region IS NULL) as untagged_caba
    FROM atlas_people_discovery_candidates
    WHERE source_id ILIKE ANY($1);
  `, [cabaSourcePatterns]);
  console.log('CABA source rows:');
  console.table(cabaSourcesRes.rows);

  // 3. Count distinct atlas_person_id for CABA and PBA
  const liveRes = await c.query(`
    SELECT 
      caba_qualified_unique_real_people,
      pba_qualified_unique_real_people,
      caba_pba_qualified_unique_real_people,
      atlas_geo_sprint_mode
    FROM atlas_people_live_metrics
    WHERE id = 'current';
  `);
  console.log('Live metrics row in DB:');
  console.table(liveRes.rows);

  await c.end();
}

main().catch(console.error);
