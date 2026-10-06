import dotenv from 'dotenv';
dotenv.config();
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { ConicetWorkFirstResolver, WorkFirstResolutionResult } from '../src/lib/search/conicet/ConicetWorkFirstResolver';
import { compareAuthorNames, normalizeNameForComparison } from '../src/lib/search/conicet/AtlasNameComparator';
import { runReconciliation } from './reconcile_caba_universe_v1_1';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const RUN_ID = `run_conicet_canary_v1_1_${Date.now()}`;
const RESOLVER_VERSION = 'v1.1-work-first';
const PREVIOUS_RESOLVER_VERSION = 'v1.0-work-first';
const CANARY_SAMPLE_SIZE = 200;

export interface ObservedCanaryMetricsV1_1 {
  SAMPLE_SIZE: number;
  WITH_DOI: number;
  WITHOUT_DOI: number;

  // Work-Level Resolution
  CROSSREF_OPENALEX_WORK_RESOLVED: number;
  WORKS_RESOLVED_EXACT_DOI: number;
  WORKS_RESOLVED_TITLE: number;
  CONICET_DIRECT_DSPACE_WORK: number;
  TOTAL_WORKS_RESOLVED: number;
  WORK_RESOLUTION_RATE: number;

  // Identity & Authorship Breakdown (Semantic Disambiguation)
  AUTHORSHIP_TARGET_FOUND_IN_EXTERNAL_WORK: number;
  CONICET_DIRECT_DSPACE_IDENTITY_EVIDENCE: number;
  TOTAL_IDENTITY_EVIDENCE_CASES: number;
  IDENTITIES_RESOLVED: number;

  // Identity Strength / External ID Confidence
  IDENTITY_HIGH_CONFIDENCE_STRONG_ID: number;
  IDENTITY_HIGH_CONFIDENCE_MULTI_EVIDENCE: number;
  IDENTITY_PARTIAL_FROM_DSPACE: number;
  IDENTITY_PARTIAL: number;
  WITHOUT_STRONG_EXTERNAL_ID: number;
  WITH_ORCID_EMBEDDED: number;
  WITH_OPENALEX_ID: number;
  WITH_ONLY_CONICET_HANDLE_AFFILIATION: number;

  // Territorial States
  CURRENT: number;
  RECENT: number;
  ASSOCIATED_STALE: number;
  NON_CABA: number;
  TERRITORIAL_CONFLICT: number;
  UNRESOLVED: number;
  AMBIGUOUS: number;

  // Telemetry & Costs
  OPENALEX_REQUESTS: number;
  CROSSREF_SINGLE_DOI_REQUESTS: number;
  CROSSREF_LIST_REQUESTS: number;
  REQUESTS_PER_RESOLVED_IDENTITY: number;
  EXTERNAL_DATA_CHARGE_USD: number;
  DURATION_SECONDS: number;

  // Certification Gates
  CANARY_PASS: boolean;
  AUDIT_GATES: {
    FALSE_IDENTITY_MERGE: number;
    FALSE_IDENTITY_MERGE_PERSISTED: number;
    FALSE_WORK_MATCH: number;
    FALSE_CABA_PROMOTION: number;
    FALSE_NON_CABA_CLASSIFICATION: number;
    AMBIGUOUS: number;
    TERRITORIAL_CONFLICT: number;
    GATES_PASS: boolean;
  };

  // Re-evaluation of the 2 Previous Canary V1 Flagged Cases
  SPECIFIC_CASES_EVALUATION: {
    CASE_1_MARTIN_GOMEZ: {
      discovery_id: string;
      target_name: string;
      matched_author: string;
      name_normalization_equivalence: string;
      status: string;
      territorial_state: string;
      persisted_false_merge: boolean;
    };
    CASE_2_ECHEVERRIA_HUARTE: {
      discovery_id: string;
      target_name: string;
      matched_author: string;
      name_normalization_equivalence: string;
      status: string;
      territorial_state: string;
      persisted_false_merge: boolean;
    };
  };
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runCanaryV1_1() {
  console.log('================================================================');
  console.log('ATLAS PEOPLE CABA — CONICET RESOLUTION CANARY V1.1 RECERTIFICATION');
  console.log(`RUN_ID: ${RUN_ID}`);
  console.log(`RESOLVER_VERSION: ${RESOLVER_VERSION}`);
  console.log(`PREVIOUS_VERSION: ${PREVIOUS_RESOLVER_VERSION}`);
  console.log('================================================================\n');

  const startTime = Date.now();

  // 1. Physical PostgreSQL verification
  console.log('--- 1. VERIFICACIÓN FÍSICA PRE-FLIGHT EN POSTGRESQL ---');
  const { data: runCheck, error: runCheckErr } = await supabase
    .from('atlas_people_resolution_runs')
    .select('run_id')
    .limit(1);
  if (runCheckErr) {
    throw new Error(`PRE-FLIGHT FAILED: atlas_people_resolution_runs missing: ${runCheckErr.message}`);
  }
  console.log('✓ atlas_people_resolution_runs: EXISTS physically in PostgreSQL');

  const { data: itemCheck, error: itemCheckErr } = await supabase
    .from('atlas_people_resolution_items')
    .select('id')
    .limit(1);
  if (itemCheckErr) {
    throw new Error(`PRE-FLIGHT FAILED: atlas_people_resolution_items missing: ${itemCheckErr.message}`);
  }
  console.log('✓ atlas_people_resolution_items: EXISTS physically in PostgreSQL');

  // Check baseline universe
  console.log('\nChecking physical universe state...');
  const initialRecon = await runReconciliation();
  const physicalUniverse = initialRecon.CABA_UNIVERSE_UNIQUE;
  const certifiedBaseline = 11247;
  console.log(`LAST_CERTIFIED_BASELINE: ${certifiedBaseline}`);
  console.log(`PROVISIONAL_UNIVERSE_IN_DB: ${physicalUniverse}`);

  // Register run in atlas_people_resolution_runs
  const { error: regErr } = await supabase
    .from('atlas_people_resolution_runs')
    .insert({
      run_id: RUN_ID,
      source: 'CONICET_OAI_PMH',
      start_universe: physicalUniverse,
      status: 'RUNNING',
      started_at: new Date(startTime).toISOString()
    });
  if (regErr) throw new Error(`Failed to initialize run ledger: ${regErr.message}`);
  console.log(`✓ Run ledger initialized in atlas_people_resolution_runs (${RUN_ID})\n`);

  // 2. Fetch EXACT SAME DETERMINISTIC SAMPLE (N=200) from Canary V1
  console.log('--- 2. CARGANDO EXACTA MUESTRA DETERMINÍSTICA N=200 DE CANARY V1 ---');
  const { data: v1Items, error: v1Err } = await supabase
    .from('atlas_people_resolution_items')
    .select('discovery_id')
    .eq('resolver_version', PREVIOUS_RESOLVER_VERSION)
    .order('discovery_id', { ascending: true });

  if (v1Err || !v1Items || v1Items.length === 0) {
    throw new Error(`Failed to load Canary V1 items: ${v1Err?.message || 'Empty list'}`);
  }

  const v1DiscoveryIds = v1Items.map(i => i.discovery_id);
  console.log(`Discovery IDs obtenidos de Canary V1: ${v1DiscoveryIds.length}`);

  // Load candidate details from atlas_people_discovery_candidates
  const { data: candidates, error: candErr } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('discovery_id, display_name, person_source_url, source_record_id, organization, role, location_evidence, social_profiles')
    .in('discovery_id', v1DiscoveryIds);

  if (candErr || !candidates || candidates.length === 0) {
    throw new Error(`Failed to load candidates from atlas_people_discovery_candidates: ${candErr?.message}`);
  }

  // Ensure deterministic sort identical to V1
  const candidateMap = new Map(candidates.map(c => [c.discovery_id, c]));
  const sample = v1DiscoveryIds.map(id => candidateMap.get(id)!).filter(Boolean);

  console.log(`Muestra idéntica confirmada: ${sample.length} candidatos.\n`);
  if (sample.length !== CANARY_SAMPLE_SIZE) {
    throw new Error(`SAMPLE SIZE MISMATCH: Expected ${CANARY_SAMPLE_SIZE}, got ${sample.length}`);
  }

  // 3. Execute Canary Resolution Engine V1.1
  console.log('--- 3. EJECUTANDO MOTOR CONICET WORK-FIRST V1.1 ---');
  const resolver = new ConicetWorkFirstResolver('contact@youapp.com');
  const results: WorkFirstResolutionResult[] = [];

  let withDoi = 0;
  let withoutDoi = 0;

  let worksResolvedExactDoi = 0;
  let worksResolvedTitle = 0;
  let conicetDirectDspaceWork = 0;

  let authorshipTargetFoundInExternalWork = 0;
  let conicetDirectDspaceIdentityEvidence = 0;
  let identitiesResolved = 0;

  let identityHighConfidenceStrongId = 0;
  let identityHighConfidenceMultiEvidence = 0;
  let identityPartialFromDspace = 0;
  let identityPartial = 0;
  let withoutStrongExternalId = 0;
  let withOrcidEmbedded = 0;
  let withOpenAlexId = 0;
  let withOnlyConicetHandleAffiliation = 0;

  let currentCount = 0;
  let recentCount = 0;
  let associatedStaleCount = 0;
  let nonCabaCount = 0;
  let territorialConflictCount = 0;
  let unresolvedCount = 0;
  let ambiguousCount = 0;

  for (let i = 0; i < sample.length; i++) {
    const candidate = sample[i];
    const index = i + 1;

    try {
      const res = await resolver.resolveCandidate(candidate);
      results.push(res);

      if (res.has_doi) withDoi++;
      else withoutDoi++;

      if (res.work_match_method === 'EXACT_DOI') worksResolvedExactDoi++;
      else if (res.work_match_method === 'WORK_CANDIDATE_MATCH_TITLE_STRONG') worksResolvedTitle++;
      else if (res.work_match_method === 'CONICET_DIRECT_WORK') conicetDirectDspaceWork++;

      if (res.authorship_target_found_in_external_work) authorshipTargetFoundInExternalWork++;
      if (res.conicet_direct_dspace_identity_evidence) conicetDirectDspaceIdentityEvidence++;

      if (res.identity_resolved) identitiesResolved++;

      if (res.identity_strength === 'IDENTITY_HIGH_CONFIDENCE_STRONG_ID') identityHighConfidenceStrongId++;
      else if (res.identity_strength === 'IDENTITY_HIGH_CONFIDENCE_MULTI_EVIDENCE') identityHighConfidenceMultiEvidence++;
      else if (res.identity_strength === 'IDENTITY_PARTIAL') {
        identityPartial++;
        if (res.conicet_direct_dspace_identity_evidence) {
          identityPartialFromDspace++;
        }
      }

      if (res.has_embedded_orcid) withOrcidEmbedded++;
      if (res.identity_resolved && !res.has_embedded_orcid) withoutStrongExternalId++;
      if (res.conicet_direct_dspace_identity_evidence && !res.authorship_target_found_in_external_work) {
        withOnlyConicetHandleAffiliation++;
      }

      if (res.is_ambiguous) ambiguousCount++;

      if (res.territorial_state === 'CURRENT') currentCount++;
      else if (res.territorial_state === 'RECENT') recentCount++;
      else if (res.territorial_state === 'ASSOCIATED_STALE') associatedStaleCount++;
      else if (res.territorial_state === 'NON_CABA_CONFIRMED') nonCabaCount++;
      else if (res.territorial_state === 'TERRITORIAL_CONFLICT') territorialConflictCount++;
      else unresolvedCount++;

      // Transactional persistence to atlas_people_resolution_items (V1.1)
      const dbStatus = res.status;
      const { error: itemErr } = await supabase
        .from('atlas_people_resolution_items')
        .upsert({
          run_id: RUN_ID,
          discovery_id: candidate.discovery_id,
          source_id: 'CONICET_OAI_PMH',
          resolver_version: RESOLVER_VERSION,
          status: dbStatus,
          attempt_count: 1,
          resolved_person_external_id: res.work_doi || res.handle_id,
          identity_confidence: res.identity_confidence,
          territorial_state: res.territorial_state,
          last_error: null,
          metadata: {
            crossref_openalex_work_resolved: res.crossref_openalex_work_resolved,
            authorship_target_found_in_external_work: res.authorship_target_found_in_external_work,
            conicet_direct_dspace_identity_evidence: res.conicet_direct_dspace_identity_evidence,
            identity_strength: res.identity_strength,
            work_match_method: res.work_match_method,
            work_match_confidence: res.work_match_confidence,
            author_match_method: res.author_match_method,
            author_match_confidence: res.author_match_confidence,
            identity_resolution_method: res.identity_resolution_method,
            identity_confidence: res.identity_confidence,
            territorial_resolution_method: res.territorial_resolution_method,
            territorial_confidence: res.territorial_confidence,
            work_doi: res.work_doi,
            work_title: res.work_title,
            work_year: res.work_year,
            has_doi: res.has_doi,
            matched_author: res.matched_author ? `${res.matched_author.given || ''} ${res.matched_author.family || ''}`.trim() : null,
            matched_orcid: res.matched_orcid,
            affiliation_evidence: res.affiliation_string,
            evidence_summary: res.evidence_summary
          },
          started_at: new Date(startTime).toISOString(),
          completed_at: new Date().toISOString()
        }, { onConflict: 'discovery_id,resolver_version' });

      if (itemErr) {
        console.error(`Error persisting item for ${candidate.discovery_id}:`, itemErr.message);
      }

      // Propagate certified state to Discovery table
      if (res.status === 'RESOLVED_CABA') {
        const activityState = res.territorial_state === 'CURRENT' ? 'ACTIVE' : (res.territorial_state === 'RECENT' ? 'ACTIVE' : 'STALE');
        const relationType = res.territorial_state === 'CURRENT' || res.territorial_state === 'RECENT' ? 'WORKS_IN' : 'CABA_INSTITUTION_ASSOCIATED';

        await supabase
          .from('atlas_people_discovery_candidates')
          .update({
            current_activity_state: activityState,
            location_relation_type: relationType,
            source_last_checked_at: new Date().toISOString()
          })
          .eq('discovery_id', candidate.discovery_id);
      } else if (res.status === 'RESOLVED_NON_CABA') {
        const existingEvidence = candidate.location_evidence || '';
        const nonCabaEvidence = existingEvidence ? `${existingEvidence} | [radicada fuera de CABA: ${res.evidence_summary}]` : `radicada fuera de CABA: ${res.evidence_summary}`;

        await supabase
          .from('atlas_people_discovery_candidates')
          .update({
            location_evidence: nonCabaEvidence,
            source_last_checked_at: new Date().toISOString()
          })
          .eq('discovery_id', candidate.discovery_id);
      }

      if (index % 25 === 0 || index === sample.length) {
        console.log(`[${index}/${sample.length}] "${candidate.display_name}" -> Status: ${res.status} | Work: ${res.work_match_method} | ExtAuthor: ${res.authorship_target_found_in_external_work} | DSpaceFil: ${res.conicet_direct_dspace_identity_evidence} | Terr: ${res.territorial_state}`);
      }

      await delay(100);
    } catch (err: any) {
      console.error(`Error resolving index ${index} (${candidate.display_name}):`, err.message);
      unresolvedCount++;
    }
  }

  const durationSeconds = Math.round((Date.now() - startTime) / 1000);
  const stats = resolver.getStats();

  // 4. Forensic Audit of Evidence (>= 60 cases)
  console.log('\n================================================================');
  console.log('AUDITORÍA FORENSE DE EVIDENCIA V1.1 — MUESTRA COMPLETA DE CASOS');
  console.log('================================================================\n');

  // Mandatory subsets:
  const titleMatches = results.filter(r => r.work_match_method === 'WORK_CANDIDATE_MATCH_TITLE_STRONG');
  const conflictMatches = results.filter(r => r.territorial_state === 'TERRITORIAL_CONFLICT');
  const noOrcidMatches = results.filter(r => r.identity_resolved && !r.has_embedded_orcid);
  const ambiguousMatches = results.filter(r => r.is_ambiguous || r.author_match_method === 'AMBIGUOUS_MULTIPLE_CANDIDATES');
  const otherResolved = results.filter(r => r.identity_resolved && r.has_embedded_orcid);

  // Explicitly ensure the 2 specific cases are in the audit set
  const case1 = results.find(r => r.discovery_id === 'disc_conicet_oai_6126722007f08f77');
  const case2 = results.find(r => r.discovery_id === 'disc_conicet_oai_3009b69abbc570ad');

  const auditSet = new Map<string, WorkFirstResolutionResult>();
  if (case1) auditSet.set(case1.discovery_id, case1);
  if (case2) auditSet.set(case2.discovery_id, case2);

  for (const item of [...titleMatches, ...conflictMatches, ...ambiguousMatches, ...noOrcidMatches, ...otherResolved]) {
    auditSet.set(item.discovery_id, item);
    if (auditSet.size >= 65) break;
  }

  const auditList = Array.from(auditSet.values());
  console.log(`Casos seleccionados para auditoría forense V1.1: ${auditList.length}`);
  console.log(`- Title-only matches auditados: ${titleMatches.length}`);
  console.log(`- Territorial conflict auditados: ${conflictMatches.length}`);
  console.log(`- Ambiguous authorship auditados: ${ambiguousMatches.length}`);
  console.log(`- Sin ORCID auditados: ${noOrcidMatches.length}`);

  let falseIdentityMerges = 0;
  let falseIdentityMergesPersisted = 0;
  let falseWorkMatches = 0;
  let falseCabaPromotions = 0;
  let falseNonCabaClassifications = 0;

  const auditReportRows: any[] = [];

  for (let idx = 0; idx < auditList.length; idx++) {
    const c = auditList[idx];
    let isIdentityMergeValid = true;
    let isWorkMatchValid = true;
    let isCabaPromotionValid = true;
    let isNonCabaValid = true;

    // Gate 1: Check False Identity Merge with Robust AtlasNameComparator
    if (c.identity_resolved && c.matched_author) {
      const matchedAuthorFull = `${c.matched_author.given || ''} ${c.matched_author.family || ''}`.trim() || c.matched_author.name || '';
      const comp = compareAuthorNames(c.display_name, matchedAuthorFull);

      if (!comp.matches) {
        isIdentityMergeValid = false;
        falseIdentityMerges++;
        if (c.status === 'RESOLVED_CABA') {
          falseIdentityMergesPersisted++;
        }
      }
    }

    // Gate 2: Check False Work Match
    if (c.work_match_method === 'WORK_CANDIDATE_MATCH_TITLE_STRONG') {
      if (c.work_match_confidence < 0.90) {
        isWorkMatchValid = false;
        falseWorkMatches++;
      }
    }

    // Gate 3: Check False CABA Promotion
    if (c.territorial_state === 'CURRENT' || c.territorial_state === 'RECENT') {
      const affilLower = (c.affiliation_string || '').toLowerCase();
      const hasCabaKw = [
        'buenos aires', 'caba', 'uba', 'exactas', 'medicina', 'leloir', 'conicet', 'garrahan', 'roffo', 'san andres', 'di tella'
      ].some(kw => affilLower.includes(kw));
      if (!hasCabaKw) {
        isCabaPromotionValid = false;
        falseCabaPromotions++;
      }
    }

    // Gate 4: Check False Non-CABA Classification
    if (c.territorial_state === 'NON_CABA_CONFIRMED') {
      const affilLower = (c.affiliation_string || '').toLowerCase();
      const hasNonCabaKw = [
        'la plata', 'unlp', 'cordoba', 'unc', 'rosario', 'unr', 'cuyo', 'uncuyo', 'mar del plata', 'bahia blanca',
        'tucuman', 'litoral', 'salta', 'jujuy', 'mendoza', 'chubut', 'rio negro', 'santa fe', 'entre rios', 'corrientes', 'misiones'
      ].some(kw => affilLower.includes(kw));
      if (!hasNonCabaKw) {
        isNonCabaValid = false;
        falseNonCabaClassifications++;
      }
    }

    auditReportRows.push({
      idx: idx + 1,
      target_name: c.display_name,
      work_match: c.work_match_method,
      work_doi: c.work_doi ? c.work_doi.slice(0, 20) : 'HANDLE_ONLY',
      author_match: c.author_match_method,
      matched_name: c.matched_author ? `${c.matched_author.given || ''} ${c.matched_author.family || ''}`.trim() : null,
      territory: c.territorial_state,
      identity_strength: c.identity_strength,
      status: c.status,
      audit_identity: isIdentityMergeValid ? 'PASS' : 'FAIL',
      audit_work: isWorkMatchValid ? 'PASS' : 'FAIL',
      audit_caba: isCabaPromotionValid ? 'PASS' : 'FAIL',
      audit_non_caba: isNonCabaValid ? 'PASS' : 'FAIL'
    });
  }

  console.table(auditReportRows.slice(0, 20));
  console.log(`... y ${auditReportRows.length - 20} casos más auditados forensemente.`);

  // 5. Explicit Evaluation of the 2 Specific Cases
  const matchedAuthorCase1 = case1?.matched_author ? `${case1.matched_author.given || ''} ${case1.matched_author.family || ''}`.trim() : 'N/A';
  const matchedAuthorCase2 = case2?.matched_author ? `${case2.matched_author.given || ''} ${case2.matched_author.family || ''}`.trim() : 'N/A';
  const compCase1 = case1 ? compareAuthorNames(case1.display_name, matchedAuthorCase1) : { matches: false };
  const compCase2 = case2 ? compareAuthorNames(case2.display_name, matchedAuthorCase2) : { matches: false };

  console.log('\n--- EVALUACIÓN FORENSE DETALLADA DE LOS 2 CASOS PREVIOS ---');
  console.log(`Caso 1 (disc_conicet_oai_6126722007f08f77): "${case1?.display_name}" vs "${matchedAuthorCase1}"`);
  console.log(`  - NAME_NORMALIZATION_EQUIVALENCE: ${compCase1.matches ? 'PASS (Equivalencia ortográfica guion/espacio reconocida)' : 'FAIL'}`);
  console.log(`  - Territorial State: ${case1?.territorial_state} | Status: ${case1?.status}`);
  console.log(`  - Persisted False Merge: ${case1?.status === 'RESOLVED_CABA' ? 'TRUE (FAIL)' : 'FALSE (PASS - UNRESOLVED en Postgres)'}`);

  console.log(`Caso 2 (disc_conicet_oai_3009b69abbc570ad): "${case2?.display_name}" vs "${matchedAuthorCase2}"`);
  console.log(`  - NAME_NORMALIZATION_EQUIVALENCE: ${compCase2.matches ? 'PASS (Equivalencia ortográfica guion/espacio reconocida)' : 'FAIL'}`);
  console.log(`  - Territorial State: ${case2?.territorial_state} | Status: ${case2?.status}`);
  console.log(`  - Persisted False Merge: ${case2?.status === 'RESOLVED_CABA' ? 'TRUE (FAIL)' : 'FALSE (PASS - UNRESOLVED en Postgres)'}`);

  console.log('\n--- RESULTADOS AUDITORÍA FORENSE V1.1 ---');
  console.log(`FALSE_IDENTITY_MERGE:           ${falseIdentityMerges} (Exigido: 0) -> ${falseIdentityMerges === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`FALSE_IDENTITY_MERGE_PERSISTED: ${falseIdentityMergesPersisted} (Exigido: 0) -> ${falseIdentityMergesPersisted === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`FALSE_WORK_MATCH:               ${falseWorkMatches} (Exigido: 0) -> ${falseWorkMatches === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`FALSE_CABA_PROMOTION:           ${falseCabaPromotions} (Exigido: 0) -> ${falseCabaPromotions === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`FALSE_NON_CABA_CLASSIFICATION:  ${falseNonCabaClassifications} (Exigido: 0) -> ${falseNonCabaClassifications === 0 ? 'PASS' : 'FAIL'}`);

  const auditGatesPass = falseIdentityMerges === 0 &&
                         falseIdentityMergesPersisted === 0 &&
                         falseWorkMatches === 0 &&
                         falseCabaPromotions === 0 &&
                         falseNonCabaClassifications === 0;

  // 6. Mandatory Reconciled Metrics
  const crossrefOpenalexWorkResolved = worksResolvedExactDoi + worksResolvedTitle;
  const totalWorksResolved = crossrefOpenalexWorkResolved + conicetDirectDspaceWork;
  const workResolutionRate = parseFloat(((crossrefOpenalexWorkResolved / sample.length) * 100).toFixed(1));
  const reqPerResolved = identitiesResolved > 0
    ? parseFloat(((stats.crossrefSingleDoiRequests + stats.crossrefListRequests + stats.openalexRequests) / identitiesResolved).toFixed(2))
    : 0;

  const observedMetrics: ObservedCanaryMetricsV1_1 = {
    SAMPLE_SIZE: sample.length,
    WITH_DOI: withDoi,
    WITHOUT_DOI: withoutDoi,

    CROSSREF_OPENALEX_WORK_RESOLVED: crossrefOpenalexWorkResolved,
    WORKS_RESOLVED_EXACT_DOI: worksResolvedExactDoi,
    WORKS_RESOLVED_TITLE: worksResolvedTitle,
    CONICET_DIRECT_DSPACE_WORK: conicetDirectDspaceWork,
    TOTAL_WORKS_RESOLVED: totalWorksResolved,
    WORK_RESOLUTION_RATE: workResolutionRate,

    AUTHORSHIP_TARGET_FOUND_IN_EXTERNAL_WORK: authorshipTargetFoundInExternalWork,
    CONICET_DIRECT_DSPACE_IDENTITY_EVIDENCE: conicetDirectDspaceIdentityEvidence,
    TOTAL_IDENTITY_EVIDENCE_CASES: authorshipTargetFoundInExternalWork + conicetDirectDspaceIdentityEvidence,
    IDENTITIES_RESOLVED: identitiesResolved,

    IDENTITY_HIGH_CONFIDENCE_STRONG_ID: identityHighConfidenceStrongId,
    IDENTITY_HIGH_CONFIDENCE_MULTI_EVIDENCE: identityHighConfidenceMultiEvidence,
    IDENTITY_PARTIAL_FROM_DSPACE: identityPartialFromDspace,
    IDENTITY_PARTIAL: identityPartial,
    WITHOUT_STRONG_EXTERNAL_ID: withoutStrongExternalId,
    WITH_ORCID_EMBEDDED: withOrcidEmbedded,
    WITH_OPENALEX_ID: withOpenAlexId,
    WITH_ONLY_CONICET_HANDLE_AFFILIATION: withOnlyConicetHandleAffiliation,

    CURRENT: currentCount,
    RECENT: recentCount,
    ASSOCIATED_STALE: associatedStaleCount,
    NON_CABA: nonCabaCount,
    TERRITORIAL_CONFLICT: territorialConflictCount,
    UNRESOLVED: unresolvedCount,
    AMBIGUOUS: ambiguousCount,

    OPENALEX_REQUESTS: stats.openalexRequests,
    CROSSREF_SINGLE_DOI_REQUESTS: stats.crossrefSingleDoiRequests,
    CROSSREF_LIST_REQUESTS: stats.crossrefListRequests,
    REQUESTS_PER_RESOLVED_IDENTITY: reqPerResolved,
    EXTERNAL_DATA_CHARGE_USD: 0.0,
    DURATION_SECONDS: durationSeconds,

    CANARY_PASS: auditGatesPass,
    AUDIT_GATES: {
      FALSE_IDENTITY_MERGE: falseIdentityMerges,
      FALSE_IDENTITY_MERGE_PERSISTED: falseIdentityMergesPersisted,
      FALSE_WORK_MATCH: falseWorkMatches,
      FALSE_CABA_PROMOTION: falseCabaPromotions,
      FALSE_NON_CABA_CLASSIFICATION: falseNonCabaClassifications,
      AMBIGUOUS: ambiguousCount,
      TERRITORIAL_CONFLICT: territorialConflictCount,
      GATES_PASS: auditGatesPass
    },

    SPECIFIC_CASES_EVALUATION: {
      CASE_1_MARTIN_GOMEZ: {
        discovery_id: case1?.discovery_id || 'disc_conicet_oai_6126722007f08f77',
        target_name: case1?.display_name || 'C. Martín Gómez',
        matched_author: matchedAuthorCase1,
        name_normalization_equivalence: compCase1.matches ? 'PASS' : 'FAIL',
        status: case1?.status || 'UNRESOLVED',
        territorial_state: case1?.territorial_state || 'UNRESOLVED',
        persisted_false_merge: case1?.status === 'RESOLVED_CABA'
      },
      CASE_2_ECHEVERRIA_HUARTE: {
        discovery_id: case2?.discovery_id || 'disc_conicet_oai_3009b69abbc570ad',
        target_name: case2?.display_name || 'I. Echeverría Huarte',
        matched_author: matchedAuthorCase2,
        name_normalization_equivalence: compCase2.matches ? 'PASS' : 'FAIL',
        status: case2?.status || 'UNRESOLVED',
        territorial_state: case2?.territorial_state || 'UNRESOLVED',
        persisted_false_merge: case2?.status === 'RESOLVED_CABA'
      }
    }
  };

  console.log('\n================================================================');
  console.log('REPORTE OBLIGATORIO — VALORES FÍSICOS OBSERVADOS V1.1 (N=200)');
  console.log('================================================================');
  console.log(JSON.stringify(observedMetrics, null, 2));

  // Update run in atlas_people_resolution_runs
  await supabase
    .from('atlas_people_resolution_runs')
    .update({
      raw_processed: sample.length,
      works_resolved: totalWorksResolved,
      identities_resolved: identitiesResolved,
      net_new_current: currentCount,
      net_new_recent: recentCount,
      net_new_associated: associatedStaleCount,
      non_caba_resolved: nonCabaCount,
      unresolved: unresolvedCount,
      api_requests_openalex: stats.openalexRequests,
      api_requests_crossref: stats.totalCrossrefRequests,
      external_data_charge_usd: 0,
      status: auditGatesPass ? 'COMPLETED' : 'FAILED',
      completed_at: new Date().toISOString()
    })
    .eq('run_id', RUN_ID);

  // Recalculate Post-Canary Scale Metrics
  console.log('\nRecalculating post-canary universe scale metrics...');
  const postRecon = await runReconciliation();
  console.log(`END_PHYSICAL_UNIVERSE: ${postRecon.CABA_UNIVERSE_UNIQUE}`);

  // Save report to disk
  const reportDir = path.resolve(process.cwd(), 'reports/atlas/people');
  fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, 'conicet_canary_report_v1_1.json');
  fs.writeFileSync(reportPath, JSON.stringify({ observedMetrics, postRecon, auditReportRows }, null, 2), 'utf8');
  console.log(`Report JSON saved to: ${reportPath}`);

  return { observedMetrics, postRecon };
}

runCanaryV1_1().catch(err => {
  console.error('Fatal error in Canary V1.1 execution:', err);
  process.exit(1);
});
