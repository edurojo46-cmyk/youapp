import fs from 'fs';
import path from 'path';
import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });
const GOLDEN_FILE = path.resolve('reports/atlas/realtime/pre_change_search_golden.json');
const isCompareMode = process.argv.includes('--compare');

const TEST_QUERIES = [
  { id: 'q_name_1', category: 'display_name', term: 'CARLOS' },
  { id: 'q_name_2', category: 'display_name', term: 'MARIA' },
  { id: 'q_org_1', category: 'organization', term: 'TECH' },
  { id: 'q_org_2', category: 'organization', term: 'HOSPITAL' },
  { id: 'q_role_1', category: 'role', term: 'DIRECTOR' },
  { id: 'q_role_2', category: 'role', term: 'PRESIDENTE' },
  { id: 'q_prof_1', category: 'profession', term: 'ABOGADO' },
  { id: 'q_prof_2', category: 'profession', term: 'MEDICO' },
  { id: 'q_multi_1', category: 'multi_token', term: 'CARLOS DIRECTOR' },
  { id: 'q_multi_2', category: 'multi_token', term: 'MARIA HOSPITAL' },
  { id: 'q_accent_1', category: 'accent_normalization', term: 'gonzález' },
  { id: 'q_accent_2', category: 'accent_normalization', term: 'gonzalez' },
  { id: 'q_case_1', category: 'case_normalization', term: 'carlos' },
  { id: 'q_case_2', category: 'case_normalization', term: 'CARLOS' }
];

async function executeSearch(queryTerm, limit = 50) {
  const t0 = performance.now();
  const res = await pool.query(`
    SELECT discovery_id, atlas_person_id, display_name, role, organization, profession, search_rank
    FROM public.atlas_search_people_unified_v2(
      p_query := $1,
      p_limit := $2,
      p_offset := 0
    );
  `, [queryTerm, limit]);
  const dur = performance.now() - t0;
  return {
    rows: res.rows,
    duration_ms: Number(dur.toFixed(2))
  };
}

async function run() {
  console.log(`=== ATLAS SEARCH PARITY HARNESS (${isCompareMode ? 'VERIFY MODE' : 'BASELINE CAPTURE'}) ===\n`);

  const results = {};
  let totalLatency = 0;
  let errorCount = 0;

  for (const q of TEST_QUERIES) {
    try {
      const searchRes = await executeSearch(q.term, 50);
      const top10 = searchRes.rows.slice(0, 10).map(r => r.discovery_id);
      const top50 = searchRes.rows.slice(0, 50).map(r => r.discovery_id);
      totalLatency += searchRes.duration_ms;

      results[q.id] = {
        category: q.category,
        term: q.term,
        result_count: searchRes.rows.length,
        duration_ms: searchRes.duration_ms,
        top10_ids: top10,
        top50_ids: top50
      };
      console.log(`[${q.id}] ${q.category} ("${q.term}"): ${searchRes.rows.length} rows in ${searchRes.duration_ms}ms`);
    } catch (err) {
      errorCount++;
      console.error(`[${q.id}] ERROR on "${q.term}":`, err.message);
      results[q.id] = { error: err.message };
    }
  }

  const avgLatency = Number((totalLatency / TEST_QUERIES.length).toFixed(2));

  if (!isCompareMode) {
    const goldenPayload = {
      captured_at: new Date().toISOString(),
      query_count: TEST_QUERIES.length,
      avg_latency_ms: avgLatency,
      error_count: errorCount,
      queries: results
    };
    fs.writeFileSync(GOLDEN_FILE, JSON.stringify(goldenPayload, null, 2), 'utf8');
    console.log(`\nSuccessfully captured PRE_CHANGE_SEARCH_GOLDEN at: ${GOLDEN_FILE}`);
  } else {
    // Compare mode
    if (!fs.existsSync(GOLDEN_FILE)) {
      console.error(`Cannot compare: ${GOLDEN_FILE} does not exist!`);
      await pool.end();
      process.exit(1);
    }
    const golden = JSON.parse(fs.readFileSync(GOLDEN_FILE, 'utf8'));

    let top10Matches = 0;
    let top10Total = 0;
    let top50Matches = 0;
    let top50Total = 0;

    for (const q of TEST_QUERIES) {
      const g = golden.queries[q.id];
      const cur = results[q.id];
      if (!g || !cur || g.error || cur.error) continue;

      // Check overlap in top 10
      const gTop10Set = new Set(g.top10_ids || []);
      const curTop10 = cur.top10_ids || [];
      const overlap10 = curTop10.filter(id => gTop10Set.has(id)).length;
      top10Matches += overlap10;
      top10Total += Math.max(gTop10Set.size, 1);

      // Check overlap in top 50
      const gTop50Set = new Set(g.top50_ids || []);
      const curTop50 = cur.top50_ids || [];
      const overlap50 = curTop50.filter(id => gTop50Set.has(id)).length;
      top50Matches += overlap50;
      top50Total += Math.max(gTop50Set.size, 1);
    }

    const top10ParityPct = top10Total > 0 ? Number(((top10Matches / top10Total) * 100).toFixed(2)) : 100;
    const top50ParityPct = top50Total > 0 ? Number(((top50Matches / top50Total) * 100).toFixed(2)) : 100;

    const comparisonReport = {
      evaluated_at: new Date().toISOString(),
      golden_captured_at: golden.captured_at,
      search_top10_parity_pct: top10ParityPct,
      search_top50_parity_pct: top50ParityPct,
      current_avg_latency_ms: avgLatency,
      baseline_avg_latency_ms: golden.avg_latency_ms,
      error_count: errorCount
    };

    console.log('\n======================================================');
    console.log('  SEARCH PARITY VERIFICATION RESULT');
    console.log('======================================================');
    console.log(JSON.stringify(comparisonReport, null, 2));

    fs.writeFileSync('reports/atlas/realtime/search_parity_verification_result.json', JSON.stringify(comparisonReport, null, 2), 'utf8');
  }

  await pool.end();
}

run().catch(console.error);
