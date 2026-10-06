import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from '../export_search_projection_v2.mjs';
dotenv.config();

const { Pool } = pg;
const pool = new Pool(parseDbUrl());

async function main() {
  console.log('Inspecting atlas_people_discovery_candidates for duplicate normalized fields...');

  // 1. Total count of candidates
  const countRes = await pool.query('SELECT count(*) FROM public.atlas_people_discovery_candidates WHERE atlas_person_id IS NOT NULL;');
  const totalInDb = parseInt(countRes.rows[0].count, 10);
  console.log(`Total candidates in DB with atlas_person_id: ${totalInDb}`);

  // 2. Sample 20,000 candidates
  const sampleRes = await pool.query(`
    SELECT source_id, display_name, role, profession, organization, search_text_normalized
    FROM public.atlas_people_discovery_candidates
    WHERE atlas_person_id IS NOT NULL
    LIMIT 20000;
  `);

  function normalizeText(str) {
    if (!str) return '';
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  let arcaTotal = 0;
  let arcaDupes = 0;
  let allTotal = 0;
  let allDupes = 0;
  const sourceStats = {};

  for (const r of sampleRes.rows) {
    const displayName = (r.display_name || '').trim();
    const normName = normalizeText(displayName);
    const normRole = normalizeText(r.role);
    const normOrg = normalizeText(r.organization);
    const normProf = normalizeText(r.profession);

    const rawSearchText = r.search_text_normalized 
      ? r.search_text_normalized 
      : `${normName} ${normRole} ${normOrg} ${normProf}`.trim();
    const searchText = normalizeText(rawSearchText);

    const isDup = (normName === searchText);

    allTotal++;
    if (isDup) allDupes++;

    const src = r.source_id || 'UNKNOWN';
    const isArca = src.toUpperCase().includes('ARCA') || src.toUpperCase().includes('PADRON') || src.toUpperCase().includes('CUIT');
    if (isArca) {
      arcaTotal++;
      if (isDup) arcaDupes++;
    }

    const srcPrefix = src.split(':')[0] || 'UNKNOWN';
    if (!sourceStats[srcPrefix]) {
      sourceStats[srcPrefix] = { total: 0, dupes: 0, nonDupesSample: [] };
    }
    sourceStats[srcPrefix].total++;
    if (isDup) {
      sourceStats[srcPrefix].dupes++;
    } else {
      if (sourceStats[srcPrefix].nonDupesSample.length < 2) {
        sourceStats[srcPrefix].nonDupesSample.push({
          displayName,
          normName,
          searchText,
          role: r.role,
          org: r.organization,
          prof: r.profession
        });
      }
    }
  }

  const arcaRate = arcaTotal > 0 ? (arcaDupes / arcaTotal) * 100 : 0;
  const allRate = allTotal > 0 ? (allDupes / allTotal) * 100 : 0;

  console.log(`\nDUPLICATE_RATE_ARCA        : ${arcaRate.toFixed(2)}% (${arcaDupes}/${arcaTotal})`);
  console.log(`DUPLICATE_RATE_ALL_SOURCES : ${allRate.toFixed(2)}% (${allDupes}/${allTotal})`);
  console.log('\nBreakdown by Source Prefix:');
  for (const [prefix, stat] of Object.entries(sourceStats)) {
    const rate = ((stat.dupes / stat.total) * 100).toFixed(2);
    console.log(`- ${prefix}: total=${stat.total}, dupes=${stat.dupes}, dupeRate=${rate}%`);
    if (stat.nonDupesSample.length > 0) {
      console.log(`  Sample non-duplicate:`, JSON.stringify(stat.nonDupesSample[0]));
    }
  }

  // Also query across entire table with aggregate
  console.log('\nRunning table-wide aggregate query across all candidates...');
  const aggRes = await pool.query(`
    SELECT 
      count(*) as total_rows,
      count(*) FILTER (WHERE source_id ILIKE '%arca%' OR source_id ILIKE '%padron%') as arca_rows,
      count(*) FILTER (WHERE (source_id ILIKE '%arca%' OR source_id ILIKE '%padron%') AND (COALESCE(role, '') = '' AND COALESCE(profession, '') = '' AND COALESCE(organization, '') = '' AND (search_text_normalized IS NULL OR search_text_normalized = display_name))) as arca_dupes,
      count(*) FILTER (WHERE COALESCE(role, '') = '' AND COALESCE(profession, '') = '' AND COALESCE(organization, '') = '' AND (search_text_normalized IS NULL OR search_text_normalized = display_name)) as all_dupes,
      count(*) FILTER (WHERE COALESCE(role, '') <> '' OR COALESCE(profession, '') <> '' OR COALESCE(organization, '') <> '') as rows_with_org_or_role
    FROM public.atlas_people_discovery_candidates
    WHERE atlas_person_id IS NOT NULL;
  `);

  console.log('Table-wide stats:', aggRes.rows[0]);
  const row = aggRes.rows[0];
  const tTotal = parseInt(row.total_rows, 10);
  const aRows = parseInt(row.arca_rows, 10);
  const aDupes = parseInt(row.arca_dupes, 10);
  const alDupes = parseInt(row.all_dupes, 10);
  console.log(`TABLE_WIDE DUPLICATE_RATE_ARCA        : ${((aDupes / aRows) * 100).toFixed(2)}%`);
  console.log(`TABLE_WIDE DUPLICATE_RATE_ALL_SOURCES : ${((alDupes / tTotal) * 100).toFixed(2)}%`);
  console.log(`Rows with role/org/profession         : ${row.rows_with_org_or_role}`);

  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
