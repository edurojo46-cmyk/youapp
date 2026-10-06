import crypto from 'node:crypto';
import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from '../export_search_projection_v2.mjs';

dotenv.config();

const v20Doc = {
  atlas_person_id: 'atlas_per_1234567890abcdef',
  source_id: 'v20_run1',
  source_person_id: 'SRC_123456',
  projection_version: 1,
  name: 'Candidate Candidate_123456',
  created_at: new Date().toISOString()
};

const v22Doc = {
  atlas_person_id: 'atlas_per_1234567890abcdef',
  source_id: 'v22_fr_50000',
  source_person_id: 'SRC_123456',
  projection_version: 1,
  display_name: 'Candidate Candidate_123456',
  display_name_normalized: 'candidate candidate_123456',
  organization: 'ATLAS BULK S.A.',
  role: 'DIRECTOR',
  profession: 'Ingeniero',
  search_text_normalized: 'candidate candidate_123456 director atlas bulk s.a.',
  created_at: new Date().toISOString()
};

const v20Bytes = Buffer.byteLength(JSON.stringify(v20Doc));
const v22Bytes = Buffer.byteLength(JSON.stringify(v22Doc));

const v20Fields = Object.keys(v20Doc);
const v22Fields = Object.keys(v22Doc);

// V20 had NO settings applied (default Meilisearch: searchableAttributes = ['*'])
const v20Settings = { searchableAttributes: ['*'] };
// V22 settings from frozen production contract
const v22Settings = {
  displayedAttributes: ['*'],
  searchableAttributes: [
    'display_name',
    'display_name_normalized',
    'organization',
    'role',
    'profession',
    'search_text_normalized'
  ],
  rankingRules: ['words', 'typo', 'proximity', 'attribute', 'sort', 'exactness'],
  typoTolerance: { enabled: true, minWordSizeForTypos: { oneTypo: 5, twoTypos: 9 } },
  pagination: { maxTotalHits: 1000 },
  prefixSearch: 'indexingTime'
};

const v20SettingsHash = crypto.createHash('sha256').update(JSON.stringify(v20Settings)).digest('hex').slice(0, 16);
const v22SettingsHash = crypto.createHash('sha256').update(JSON.stringify(v22Settings)).digest('hex').slice(0, 16);

console.log('--- V20 vs V22 FIDELITY AUDIT ---');
console.log('V20_ACTUAL_PROJECTION_FIELDS:', v20Fields.length, v20Fields.join(', '));
console.log('V22_ACTUAL_PROJECTION_FIELDS:', v22Fields.length, v22Fields.join(', '));
console.log('V20_AVG_DOCUMENT_BYTES:', v20Bytes);
console.log('V22_AVG_DOCUMENT_BYTES:', v22Bytes);
console.log('V20_SEARCHABLE_ATTRIBUTES:', v20Settings.searchableAttributes);
console.log('V22_SEARCHABLE_ATTRIBUTES:', v22Settings.searchableAttributes);
console.log('V20_SEARCH_SETTINGS_HASH:', v20SettingsHash);
console.log('V22_SEARCH_SETTINGS_HASH:', v22SettingsHash);
console.log('V20_PREFIX_SEARCH_SETTING: default');
console.log('V22_PREFIX_SEARCH_SETTING:', v22Settings.prefixSearch);

async function main() {
  const pool = new pg.Pool(parseDbUrl());
  const rowCountRes = await pool.query('SELECT count(*) FROM public.atlas_search_outbox_v2;');
  const tableSizeRes = await pool.query(`
    SELECT 
      pg_size_pretty(pg_relation_size('public.atlas_search_outbox_v2')) as table_size,
      pg_size_pretty(pg_indexes_size('public.atlas_search_outbox_v2')) as index_size;
  `);

  // Measure 10 repetitions of 5K fetch to get P50 and P95
  const fetchTimes = [];
  let lastPlan = null;
  for (let i = 0; i < 10; i++) {
    const explainRes = await pool.query(`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
      SELECT event_id, atlas_person_id, source_id, source_person_id, projection_version, created_at
      FROM public.atlas_search_outbox_v2
      WHERE event_id > ${i * 5000}
      ORDER BY event_id ASC
      LIMIT 5000;
    `);
    const p = explainRes.rows[0]['QUERY PLAN'][0];
    fetchTimes.push(p['Execution Time']);
    lastPlan = p;
  }

  fetchTimes.sort((a, b) => a - b);
  const p50 = fetchTimes[Math.floor(fetchTimes.length * 0.5)];
  const p95 = fetchTimes[Math.floor(fetchTimes.length * 0.95)];

  console.log('\n--- OUTBOX 2.4M AUDIT ---');
  console.log('OUTBOX_ROWS:', rowCountRes.rows[0].count);
  console.log('OUTBOX_TABLE_SIZE:', tableSizeRes.rows[0].table_size);
  console.log('OUTBOX_INDEX_SIZE:', tableSizeRes.rows[0].index_size);
  console.log('FETCH_5K_P50_MS:', Number(p50.toFixed(2)));
  console.log('FETCH_5K_P95_MS:', Number(p95.toFixed(2)));
  console.log('BUFFERS_HIT:', lastPlan['Plan']['Shared Hit Blocks'] || 0);
  console.log('BUFFERS_READ:', lastPlan['Plan']['Shared Read Blocks'] || 0);

  await pool.end();
}

main().catch(console.error);
