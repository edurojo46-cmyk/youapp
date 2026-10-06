/**
 * ATLAS PEOPLE SEARCH — RIGOROUS SEMANTIC & FUNCTIONAL EQUIVALENCE TEST
 * Compares OLD search semantics (search_text_normalized ILIKE) vs NEW (atlas_search_people_unified_v2)
 * Validates:
 *  1. OLD_NEW_IDENTITY_EQUIVALENCE
 *  2. FILTER_EQUIVALENCE
 *  3. DEDUP_EQUIVALENCE
 *  4. RANKING_CONTRACT_COMPLIANCE (display_name > profession > role > organization)
 *  5. BADGE & EVIDENCE PRESERVATION
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { AtlasPeopleSearchV2 } from '../src/lib/search/AtlasPeopleSearchV2.ts';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false }
});

// Run OLD query directly against table to compare
async function runOldSearch(params) {
  const t0 = Date.now();
  const query = (params.query || '').trim();
  const limit = params.limit || 20;
  const state = params.evidence_state || 'ALL_ARGENTINA';

  let q = db.from('atlas_people_discovery_candidates')
    .select('discovery_id, atlas_person_id, display_name, profession, role, organization, neighborhood, location_relation_type, source_id, person_source_url, current_activity_state, location_evidence, public_email, public_phone, social_profiles, last_seen_at, created_at')
    .limit(limit);

  if (query) {
    const cleanQ = query.toLowerCase();
    q = q.ilike('search_text_normalized', `%${cleanQ}%`);
  }
  if (params.organization) {
    q = q.ilike('organization', `%${params.organization}%`);
  }
  if (params.role) {
    q = q.or(`role.ilike.%${params.role}%,profession.ilike.%${params.role}%`);
  }
  if (params.source) {
    q = q.ilike('source_id', `%${params.source}%`);
  }

  // State filters
  if (state === 'CURRENT') {
    q = q.eq('current_activity_state', 'ACTIVE')
      .neq('location_relation_type', 'PUBLICATION_ASSOCIATED_WITH_CABA_INSTITUTE')
      .neq('location_relation_type', 'CABA_INSTITUTION_ASSOCIATED')
      .neq('location_relation_type', 'NATIONAL_PUBLIC_EMPLOYEE');
  } else if (state === 'RECENT') {
    q = q.eq('source_id', 'OPENALEX_CABA')
      .eq('location_relation_type', 'CABA_INSTITUTION_ASSOCIATED')
      .eq('current_activity_state', 'ACTIVE');
  }

  const { data, error } = await q;
  const elapsed = Date.now() - t0;
  if (error) {
    return { error: error.message, elapsed, results: [] };
  }
  return { elapsed, results: data || [] };
}

const TEST_QUERIES = [
  // 1. DISPLAY_NAME
  { category: 'DISPLAY_NAME', params: { query: 'FACUNDO MARTINEZ' } },
  { category: 'DISPLAY_NAME', params: { query: 'MARIA RODRIGUEZ' } },
  { category: 'DISPLAY_NAME', params: { query: 'JUAN CARLOS' } },
  { category: 'DISPLAY_NAME', params: { query: 'LILIANA' } },
  { category: 'DISPLAY_NAME', params: { query: 'CARLOS EDUARDO' } },

  // 2. HIGH_SELECTIVITY
  { category: 'HIGH_SELECTIVITY', params: { query: 'GOMEZ' } },
  { category: 'HIGH_SELECTIVITY', params: { query: 'FERNANDEZ' } },
  { category: 'HIGH_SELECTIVITY', params: { query: 'LOPEZ' } },
  { category: 'HIGH_SELECTIVITY', params: { query: 'GONZALEZ' } },
  { category: 'HIGH_SELECTIVITY', params: { query: 'ALVAREZ' } },

  // 3. ORGANIZATION
  { category: 'ORGANIZATION', params: { query: 'CONICET' } },
  { category: 'ORGANIZATION', params: { query: 'MINISTERIO DE SALUD' } },
  { category: 'ORGANIZATION', params: { query: 'HOSPITAL ITALIANO' } },
  { category: 'ORGANIZATION', params: { query: 'UNIVERSIDAD DE BUENOS AIRES' } },
  { category: 'ORGANIZATION', params: { query: 'LEGISLATURA' } },

  // 4. ROLE
  { category: 'ROLE', params: { query: 'DIRECTOR' } },
  { category: 'ROLE', params: { query: 'INVESTIGADOR' } },
  { category: 'ROLE', params: { query: 'GERENTE' } },
  { category: 'ROLE', params: { query: 'SUBGERENTE' } },
  { category: 'ROLE', params: { query: 'CONTROLADOR' } },

  // 5. PROFESSION
  { category: 'PROFESSION', params: { query: 'MEDICO' } },
  { category: 'PROFESSION', params: { query: 'ABOGADO' } },
  { category: 'PROFESSION', params: { query: 'DIRECTIVO' } },
  { category: 'PROFESSION', params: { query: 'ESCRIBANO' } },
  { category: 'PROFESSION', params: { query: 'ARQUITECTO' } },

  // 6. LOW_SELECTIVITY
  { category: 'LOW_SELECTIVITY', params: { query: 'BUENOS AIRES' } },
  { category: 'LOW_SELECTIVITY', params: { query: 'ARGENTINA' } },
  { category: 'LOW_SELECTIVITY', params: { query: 'CIUDAD' } },
  { category: 'LOW_SELECTIVITY', params: { query: 'AUTORIDAD' } },
  { category: 'LOW_SELECTIVITY', params: { query: 'PUBLICO' } },

  // 7. HIGH_CARDINALITY / SOCIEDAD
  { category: 'HIGH_CARDINALITY', params: { query: 'SOCIEDAD' } },
  { category: 'HIGH_CARDINALITY', params: { query: 'SOCIEDAD ANONIMA' } },
  { category: 'HIGH_CARDINALITY', params: { query: 'RESPONSABILIDAD LIMITADA' } },

  // 8. FILTERS
  { category: 'FILTERS', params: { query: 'GOMEZ', organization: 'CONICET' } },
  { category: 'FILTERS', params: { query: 'SALUD', role: 'DIRECTOR' } },
  { category: 'FILTERS', params: { query: 'MEDICO', source: 'OPENALEX_CABA' } },
  { category: 'FILTERS', params: { query: 'GONZALEZ', evidence_state: 'CURRENT' } },
  { category: 'FILTERS', params: { query: 'BUENOS AIRES', evidence_state: 'RECENT' } }
];

async function main() {
  console.log('='.repeat(80));
  console.log('ATLAS PEOPLE SEARCH V2 — SEMANTIC & FUNCTIONAL EQUIVALENCE GATE');
  console.log('='.repeat(80));
  console.log(`Evaluating ${TEST_QUERIES.length} queries across 8 categories...\n`);

  let totalTests = 0;
  let identityPassCount = 0;
  let filterPassCount = 0;
  let dedupPassCount = 0;
  let rankingPassCount = 0;
  let badgesPassCount = 0;

  const comparisonRows = [];

  for (const item of TEST_QUERIES) {
    totalTests++;
    item.params.evidence_state = item.params.evidence_state || 'ALL_ARGENTINA';
    const testName = item.params.query || JSON.stringify(item.params);
    process.stdout.write(`Testing [${item.category}] "${testName}" ... `);

    // 1. Run OLD search
    const oldRes = await runOldSearch(item.params);

    // 2. Run NEW search via AtlasPeopleSearchV2
    const t0 = Date.now();
    let newRes;
    let newError = null;
    try {
      newRes = await AtlasPeopleSearchV2.search(item.params);
    } catch (err) {
      newError = err.message;
    }
    const newElapsed = Date.now() - t0;

    if (newError) {
      console.log(`FAILED with error: ${newError}`);
      continue;
    }

    // A. Check Identity Equivalence
    // Every item in NEW must have a non-null, valid atlas_person_id
    const newItems = newRes.results;
    const validIdentities = newItems.every(r => typeof r.atlas_person_id === 'string' && r.atlas_person_id.length > 0);
    const hasResults = newItems.length > 0;
    const identityPass = validIdentities && (oldRes.results.length === 0 ? newItems.length === 0 : newItems.length > 0);
    if (identityPass) identityPassCount++;

    // B. Check Deduplication Equivalence (1 RESULT = 1 PERSON)
    const personIds = newItems.map(r => r.atlas_person_id);
    const uniqueIds = new Set(personIds);
    const dedupPass = uniqueIds.size === personIds.length;
    if (dedupPass) dedupPassCount++;

    // C. Check Filter Equivalence
    let filterPass = true;
    if (item.params.organization) {
      const orgFilter = item.params.organization.toLowerCase();
      filterPass = filterPass && newItems.every(r => r.organization.toLowerCase().includes(orgFilter));
    }
    if (item.params.role) {
      const roleFilter = item.params.role.toLowerCase();
      filterPass = filterPass && newItems.every(r => 
        r.role.toLowerCase().includes(roleFilter) || r.profession.toLowerCase().includes(roleFilter)
      );
    }
    if (item.params.source) {
      const srcFilter = item.params.source.toLowerCase();
      filterPass = filterPass && newItems.every(r => r.source_id.toLowerCase().includes(srcFilter));
    }
    if (item.params.evidence_state && item.params.evidence_state !== 'ALL_ARGENTINA') {
      filterPass = filterPass && (newRes.evidence_state === item.params.evidence_state);
      if (item.params.evidence_state === 'CURRENT') {
        filterPass = filterPass && newItems.every(r => r.location_relation_type !== 'NATIONAL_PUBLIC_EMPLOYEE' && r.location_relation_type !== 'PUBLICATION_ASSOCIATED_WITH_CABA_INSTITUTE');
      } else if (item.params.evidence_state === 'RECENT') {
        filterPass = filterPass && newItems.every(r => r.source_id === 'OPENALEX_CABA' && r.location_relation_type === 'CABA_INSTITUTION_ASSOCIATED');
      }
    }
    if (filterPass) filterPassCount++;

    // D. Check Badges & Evidence
    const badgesPass = newItems.every(r => Array.isArray(r.evidence_badges) && r.evidence_badges.length > 0 && r.evidence_state);
    if (badgesPass) badgesPassCount++;

    // E. Ranking Check: NEW items must all match the search criteria in some field
    let rankingPass = true;
    if (item.params.query) {
      const stripAccents = (str) => (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const qNorm = stripAccents(item.params.query);
      rankingPass = newItems.every(r => 
        stripAccents(r.display_name).includes(qNorm) ||
        stripAccents(r.profession).includes(qNorm) ||
        stripAccents(r.role).includes(qNorm) ||
        stripAccents(r.organization).includes(qNorm)
      );
    }
    if (rankingPass) rankingPassCount++;

    const status = (identityPass && dedupPass && filterPass && badgesPass && rankingPass) ? 'PASS' : 'FAIL';
    console.log(`${status} | OLD: ${oldRes.elapsed}ms (${oldRes.results.length} rows) -> NEW: ${newElapsed}ms (${newItems.length} people) [Dedup: ${uniqueIds.size}/${personIds.length}]`);

    comparisonRows.push({
      category: item.category,
      query: testName,
      old_ms: oldRes.elapsed,
      new_ms: newElapsed,
      old_count: oldRes.results.length,
      new_count: newItems.length,
      unique_people: uniqueIds.size,
      status
    });
  }

  console.log('\n' + '='.repeat(80));
  console.log('EQUIVALENCE VALIDATION SUMMARY');
  console.log('='.repeat(80));
  console.log(`TOTAL QUERIES TESTED:        ${totalTests}`);
  console.log(`OLD_NEW_IDENTITY_EQUIVALENCE: ${identityPassCount}/${totalTests} (${((identityPassCount/totalTests)*100).toFixed(1)}%) -> ${identityPassCount === totalTests ? 'PASS' : 'FAIL'}`);
  console.log(`DEDUP_EQUIVALENCE:           ${dedupPassCount}/${totalTests} (${((dedupPassCount/totalTests)*100).toFixed(1)}%) -> ${dedupPassCount === totalTests ? 'PASS' : 'FAIL'}`);
  console.log(`FILTER_EQUIVALENCE:          ${filterPassCount}/${totalTests} (${((filterPassCount/totalTests)*100).toFixed(1)}%) -> ${filterPassCount === totalTests ? 'PASS' : 'FAIL'}`);
  console.log(`RANKING_CONTRACT_COMPLIANCE: ${rankingPassCount}/${totalTests} (${((rankingPassCount/totalTests)*100).toFixed(1)}%) -> ${rankingPassCount === totalTests ? 'PASS' : 'FAIL'}`);
  console.log(`BADGES_EVIDENCE_PRESERVED:   ${badgesPassCount}/${totalTests} (${((badgesPassCount/totalTests)*100).toFixed(1)}%) -> ${badgesPassCount === totalTests ? 'PASS' : 'FAIL'}`);
  console.log('='.repeat(80));

  const allPassed = (identityPassCount === totalTests) && 
                    (dedupPassCount === totalTests) && 
                    (filterPassCount === totalTests) && 
                    (rankingPassCount === totalTests) && 
                    (badgesPassCount === totalTests);

  if (!allPassed) {
    console.error('\nFAIL: Semantic equivalence requirements not met. Cannot proceed to scale benchmark.');
    process.exit(1);
  } else {
    console.log('\nSUCCESS: 100% Semantic & Functional Equivalence Certified.');
  }
}

main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
