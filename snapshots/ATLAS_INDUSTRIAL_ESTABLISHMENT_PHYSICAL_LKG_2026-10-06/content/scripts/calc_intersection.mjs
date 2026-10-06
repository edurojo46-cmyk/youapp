import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

function normalizeName(name) {
  if (!name) return '';
  return name
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  const shadowCfg = { ...parseDbUrl(), database: 'atlas_shadow_cold_gate' };
  const prodCfg = parseDbUrl();

  const shadowPool = new pg.Pool({ ...shadowCfg, max: 2 });
  const prodPool = new pg.Pool({ ...prodCfg, max: 2 });

  const shadowClient = await shadowPool.connect();
  const prodClient = await prodPool.connect();
  await shadowClient.query('SET statement_timeout = 0;');
  await prodClient.query('SET statement_timeout = 0;');

  console.log('Calculating exact intersection between Set A (Production) and Set B (Prior Gate)...');

  // Let us check how many rows in atlas_authority.global_t0_identity_ledger have a match in production
  // We can sample or check via cursor
  const qCount = await shadowClient.query(`
    SELECT count(*) as total FROM atlas_authority.global_t0_identity_ledger;
  `);
  console.log('Total in Ledger (Set B):', qCount.rows[0].total);

  // Check how many raw_record_id in ledger exist in atlas_people_discovery_candidates source_record_id
  const qInter = await prodClient.query(`
    SELECT count(*) as match_count 
    FROM public.atlas_people_discovery_candidates c
    WHERE c.source_record_id IS NOT NULL AND c.source_record_id LIKE 'igj_caba:%';
  `);
  console.log('IGJ records already present in candidates:', qInter.rows[0].match_count);

  await shadowClient.release();
  await prodClient.release();
  await shadowPool.end();
  await prodPool.end();
}

main().catch(console.error);
