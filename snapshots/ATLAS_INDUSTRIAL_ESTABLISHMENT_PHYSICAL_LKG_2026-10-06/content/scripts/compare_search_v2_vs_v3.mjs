import fs from 'fs';
import path from 'path';
import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });

const TEST_50_QUERIES = [
  // 1-10: Names
  { id: 'q_name_01', cat: 'name', term: 'CARLOS' },
  { id: 'q_name_02', cat: 'name', term: 'MARIA' },
  { id: 'q_name_03', cat: 'name', term: 'JUAN' },
  { id: 'q_name_04', cat: 'name', term: 'GONZALEZ' },
  { id: 'q_name_05', cat: 'name', term: 'RODRIGUEZ' },
  { id: 'q_name_06', cat: 'name', term: 'FERNANDEZ' },
  { id: 'q_name_07', cat: 'name', term: 'LOPEZ' },
  { id: 'q_name_08', cat: 'name', term: 'MARTINEZ' },
  { id: 'q_name_09', cat: 'name', term: 'DIEGO' },
  { id: 'q_name_10', cat: 'name', term: 'ANA' },

  // 11-20: Organizations
  { id: 'q_org_01', cat: 'org', term: 'TECH' },
  { id: 'q_org_02', cat: 'org', term: 'HOSPITAL' },
  { id: 'q_org_03', cat: 'org', term: 'UNIVERSIDAD' },
  { id: 'q_org_04', cat: 'org', term: 'S.A.' },
  { id: 'q_org_05', cat: 'org', term: 'MINISTERIO' },
  { id: 'q_org_06', cat: 'org', term: 'BANCO' },
  { id: 'q_org_07', cat: 'org', term: 'SECRETARIA' },
  { id: 'q_org_08', cat: 'org', term: 'INSTITUTO' },
  { id: 'q_org_09', cat: 'org', term: 'EMPRESA' },
  { id: 'q_org_10', cat: 'org', term: 'FUNDACION' },

  // 21-28: Roles
  { id: 'q_role_01', cat: 'role', term: 'DIRECTOR' },
  { id: 'q_role_02', cat: 'role', term: 'PRESIDENTE' },
  { id: 'q_role_03', cat: 'role', term: 'GERENTE' },
  { id: 'q_role_04', cat: 'role', term: 'VOCAL' },
  { id: 'q_role_05', cat: 'role', term: 'SINDICO' },
  { id: 'q_role_06', cat: 'role', term: 'SOCIO' },
  { id: 'q_role_07', cat: 'role', term: 'SECRETARIO' },
  { id: 'q_role_08', cat: 'role', term: 'SUBGERENTE' },

  // 29-36: Professions
  { id: 'q_prof_01', cat: 'prof', term: 'ABOGADO' },
  { id: 'q_prof_02', cat: 'prof', term: 'MEDICO' },
  { id: 'q_prof_03', cat: 'prof', term: 'CONTADOR' },
  { id: 'q_prof_04', cat: 'prof', term: 'INGENIERO' },
  { id: 'q_prof_05', cat: 'prof', term: 'ARQUITECTO' },
  { id: 'q_prof_06', cat: 'prof', term: 'ESCRIBANO' },
  { id: 'q_prof_07', cat: 'prof', term: 'LICENCIADO' },
  { id: 'q_prof_08', cat: 'prof', term: 'DOCENTE' },

  // 37-42: Accents
  { id: 'q_acc_01', cat: 'accent', term: 'gonzález' },
  { id: 'q_acc_02', cat: 'accent', term: 'gonzalez' },
  { id: 'q_acc_03', cat: 'accent', term: 'martín' },
  { id: 'q_acc_04', cat: 'accent', term: 'martin' },
  { id: 'q_acc_05', cat: 'accent', term: 'médico' },
  { id: 'q_acc_06', cat: 'accent', term: 'medico' },

  // 43-46: Multi-token
  { id: 'q_multi_01', cat: 'multi', term: 'CARLOS DIRECTOR' },
  { id: 'q_multi_02', cat: 'multi', term: 'MARIA HOSPITAL' },
  { id: 'q_multi_03', cat: 'multi', term: 'JUAN ABOGADO' },
  { id: 'q_multi_04', cat: 'multi', term: 'DIEGO GERENTE' },

  // 47-50: Partial terms
  { id: 'q_part_01', cat: 'partial', term: 'carl' },
  { id: 'q_part_02', cat: 'partial', term: 'hosp' },
  { id: 'q_part_03', cat: 'partial', term: 'abog' },
  { id: 'q_part_04', cat: 'partial', term: 'direc' }
];

function percentile(arr, p) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * p)] ?? 0;
}

async function run() {
  console.log(`=== GOLDEN SEARCH EQUIVALENCE: V2 (LEGACY) VS V3 (NORMALIZED) ===`);
  console.log(`Evaluating ${TEST_50_QUERIES.length} representative queries...\n`);

  const v2Latencies = [];
  const v3Latencies = [];
  let v2Errors = 0;
  let v3Errors = 0;

  let totalTop10Matches = 0;
  let totalTop10Possible = 0;
  let totalTop50Matches = 0;
  let totalTop50Possible = 0;
  let functionalCoverageMatches = 0;

  const comparisonRows = [];

  for (let i = 0; i < TEST_50_QUERIES.length; i++) {
    const q = TEST_50_QUERIES[i];
    let v2Res = null;
    let v3Res = null;
    let v2Dur = 0;
    let v3Dur = 0;

    // Run V2
    try {
      const t0 = performance.now();
      const r = await pool.query(`
        SELECT discovery_id, atlas_person_id, display_name, search_rank
        FROM public.atlas_search_people_unified_v2(p_query := $1, p_limit := 50, p_offset := 0);
      `, [q.term]);
      v2Dur = performance.now() - t0;
      v2Latencies.push(v2Dur);
      v2Res = r.rows;
    } catch (e) {
      v2Errors++;
      console.error(`[V2 ERROR] ${q.id} ("${q.term}"):`, e.message);
    }

    // Run V3
    try {
      const t0 = performance.now();
      const r = await pool.query(`
        SELECT discovery_id, atlas_person_id, display_name, search_rank
        FROM public.atlas_search_people_unified_v3(p_query := $1, p_limit := 50, p_offset := 0);
      `, [q.term]);
      v3Dur = performance.now() - t0;
      v3Latencies.push(v3Dur);
      v3Res = r.rows;
    } catch (e) {
      v3Errors++;
      console.error(`[V3 ERROR] ${q.id} ("${q.term}"):`, e.message);
    }

    if (v2Res && v3Res) {
      const v2Top10 = new Set(v2Res.slice(0, 10).map(r => r.discovery_id));
      const v3Top10 = v3Res.slice(0, 10).map(r => r.discovery_id);
      const overlap10 = v3Top10.filter(id => v2Top10.has(id)).length;
      totalTop10Matches += overlap10;
      totalTop10Possible += Math.max(v2Top10.size, 1);

      const v2Top50 = new Set(v2Res.slice(0, 50).map(r => r.discovery_id));
      const v3Top50 = v3Res.slice(0, 50).map(r => r.discovery_id);
      const overlap50 = v3Top50.filter(id => v2Top50.has(id)).length;
      totalTop50Matches += overlap50;
      totalTop50Possible += Math.max(v2Top50.size, 1);

      if ((v2Res.length > 0 && v3Res.length > 0) || (v2Res.length === 0 && v3Res.length === 0)) {
        functionalCoverageMatches++;
      }

      console.log(`[${i + 1}/${TEST_50_QUERIES.length}] ${q.cat.padEnd(8)} "${q.term}": V2=${v2Res.length}r (${Math.round(v2Dur)}ms) | V3=${v3Res.length}r (${Math.round(v3Dur)}ms) | top10_overlap=${overlap10}/${Math.min(10, v2Res.length)}`);
    }
  }

  const functionalCoveragePct = Number(((functionalCoverageMatches / TEST_50_QUERIES.length) * 100).toFixed(2));
  const top10ParityPct = totalTop10Possible > 0 ? Number(((totalTop10Matches / totalTop10Possible) * 100).toFixed(2)) : 100;
  const top50ParityPct = totalTop50Possible > 0 ? Number(((totalTop50Matches / totalTop50Possible) * 100).toFixed(2)) : 100;

  const summary = {
    evaluated_at: new Date().toISOString(),
    query_count: TEST_50_QUERIES.length,
    functional_coverage_pct: functionalCoveragePct,
    top10_set_parity_pct: top10ParityPct,
    top50_set_parity_pct: top50ParityPct,
    v2_errors: v2Errors,
    v3_errors: v3Errors,
    v2_search_p50_ms: Math.round(percentile(v2Latencies, 0.50)),
    v3_search_p50_ms: Math.round(percentile(v3Latencies, 0.50)),
    v2_search_p95_ms: Math.round(percentile(v2Latencies, 0.95)),
    v3_search_p95_ms: Math.round(percentile(v3Latencies, 0.95)),
    speedup_ratio: Number((percentile(v2Latencies, 0.50) / (percentile(v3Latencies, 0.50) || 1)).toFixed(2))
  };

  console.log('\n======================================================');
  console.log('  GOLDEN SEARCH EQUIVALENCE VERDICT');
  console.log('======================================================');
  console.log(JSON.stringify(summary, null, 2));

  fs.writeFileSync('reports/atlas/realtime/golden_search_equivalence_v2_vs_v3.json', JSON.stringify(summary, null, 2), 'utf8');

  await pool.end();
}

run().catch(console.error);
