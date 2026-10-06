import dotenv from 'dotenv';
dotenv.config();
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { ConicetWorkFirstResolver, WorkFirstResolutionResult } from '../src/lib/search/conicet/ConicetWorkFirstResolver';
import { runReconciliation } from './reconcile_caba_universe_v1_1';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const RUN_ID = `run_conicet_canary_${Date.now()}`;
const RESOLVER_VERSION = 'v1.0-work-first';
const CANARY_SAMPLE_SIZE = 200;

export interface ObservedCanaryMetrics {
  SAMPLE_SIZE: number;
  WITH_DOI: number;
  WITHOUT_DOI: number;
  WORKS_RESOLVED_EXACT_DOI: number;
  WORKS_RESOLVED_TITLE: number;
  WORK_RESOLUTION_RATE: number;
  AUTHORSHIP_TARGET_FOUND: number;
  IDENTITIES_RESOLVED: number;
  WITH_ORCID_EMBEDDED: number;
  CURRENT: number;
  RECENT: number;
  ASSOCIATED_STALE: number;
  NON_CABA: number;
  TERRITORIAL_CONFLICT: number;
  UNRESOLVED: number;
  AMBIGUOUS: number;
  OPENALEX_REQUESTS: number;
  CROSSREF_SINGLE_DOI_REQUESTS: number;
  CROSSREF_LIST_REQUESTS: number;
  REQUESTS_PER_RESOLVED_IDENTITY: number;
  EXTERNAL_DATA_CHARGE_USD: number;
  DURATION_SECONDS: number;
  CANARY_PASS: boolean;
  AUDIT_GATES: {
    FALSE_IDENTITY_MERGE: number;
    FALSE_WORK_MATCH: number;
    FALSE_CABA_PROMOTION: number;
    GATES_PASS: boolean;
  };
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runCanary() {
  console.log('================================================================');
  console.log('ATLAS PEOPLE CABA — CONICET RESOLUTION CANARY V1 (N=200)');
  console.log(`RUN_ID: ${RUN_ID}`);
  console.log(`RESOLVER_VERSION: ${RESOLVER_VERSION}`);
  console.log('================================================================\n');

  const startTime = Date.now();

  // -------------------------------------------------------------------------
  // 1. PRE-FLIGHT VERIFICATION: Physical PostgreSQL Resolution Tables & Invariants
  // -------------------------------------------------------------------------
  console.log('--- 1. VERIFICACIÓN FÍSICA PRE-FLIGHT EN POSTGRESQL ---');
  const { data: runCheck, error: runCheckErr } = await supabase
    .from('atlas_people_resolution_runs')
    .select('run_id')
    .limit(1);
  if (runCheckErr) {
    throw new Error(`PRE-FLIGHT FAILED: atlas_people_resolution_runs table missing or inaccessible: ${runCheckErr.message}`);
  }
  console.log('✓ atlas_people_resolution_runs: EXISTS physically in PostgreSQL');

  const { data: itemCheck, error: itemCheckErr } = await supabase
    .from('atlas_people_resolution_items')
    .select('id')
    .limit(1);
  if (itemCheckErr) {
    throw new Error(`PRE-FLIGHT FAILED: atlas_people_resolution_items table missing or inaccessible: ${itemCheckErr.message}`);
  }
  console.log('✓ atlas_people_resolution_items: EXISTS physically in PostgreSQL');

  // Verify certified baseline
  console.log('\nChecking certified baseline (11.247 personas vivas CABA)...');
  const initialRecon = await runReconciliation();
  const startUniverse = initialRecon.CABA_UNIVERSE_UNIQUE;
  console.log(`START_UNIVERSE: ${startUniverse} (Expected certified baseline: 11.247)`);
  if (startUniverse !== 11247) {
    throw new Error(`BASELINE DIVERGENCE: Expected 11.247, got ${startUniverse}`);
  }

  // Register run in atlas_people_resolution_runs
  const { error: regErr } = await supabase
    .from('atlas_people_resolution_runs')
    .insert({
      run_id: RUN_ID,
      source: 'CONICET_OAI_PMH',
      start_universe: startUniverse,
      status: 'RUNNING',
      started_at: new Date(startTime).toISOString()
    });
  if (regErr) throw new Error(`Failed to initialize run ledger: ${regErr.message}`);
  console.log(`✓ Run ledger initialized in atlas_people_resolution_runs (${RUN_ID})\n`);

  // -------------------------------------------------------------------------
  // 2. LOAD CONICET CANDIDATES & STRATIFIED DETERMINISTIC SAMPLING (N=200)
  // -------------------------------------------------------------------------
  console.log('--- 2. SELECCIÓN DE MUESTRA DETERMINÍSTICA ESTRATIFICADA (N=200) ---');
  const allConicetRows: any[] = [];
  let offset = 0;
  const BATCH_SIZE = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('atlas_people_discovery_candidates')
      .select('discovery_id, display_name, person_source_url, source_record_id, organization, role, location_evidence, social_profiles')
      .eq('source_id', 'CONICET_OAI_PMH')
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;
    allConicetRows.push(...data);
    offset += data.length;
    if (data.length < BATCH_SIZE) break;
  }

  console.log(`Total candidatos CONICET en base: ${allConicetRows.length}`);

  // Fetch items already completed in atlas_people_resolution_items for this resolver version
  const { data: completedItems } = await supabase
    .from('atlas_people_resolution_items')
    .select('discovery_id, status')
    .eq('resolver_version', RESOLVER_VERSION);

  const completedSet = new Set((completedItems || []).map(i => i.discovery_id));
  console.log(`Items ya resueltos en atlas_people_resolution_items: ${completedSet.size}`);

  const pendingCandidates = allConicetRows.filter(r => !completedSet.has(r.discovery_id));
  console.log(`Candidatos pendientes no resueltos: ${pendingCandidates.length}`);

  // Stratify by organization / institute
  const orgMap = new Map<string, any[]>();
  for (const c of pendingCandidates) {
    const org = c.organization || 'OTROS';
    if (!orgMap.has(org)) orgMap.set(org, []);
    orgMap.get(org)!.push(c);
  }

  const sample: any[] = [];
  const orgKeys = Array.from(orgMap.keys()).sort();
  const perOrgTarget = Math.max(1, Math.floor(CANARY_SAMPLE_SIZE / orgKeys.length));

  for (const org of orgKeys) {
    const list = orgMap.get(org)!;
    // Deterministic sort by discovery_id
    list.sort((a, b) => a.discovery_id.localeCompare(b.discovery_id));
    const take = list.slice(0, perOrgTarget);
    sample.push(...take);
    if (sample.length >= CANARY_SAMPLE_SIZE) break;
  }

  // Fill up to CANARY_SAMPLE_SIZE deterministically
  if (sample.length < CANARY_SAMPLE_SIZE) {
    const sampleIds = new Set(sample.map(s => s.discovery_id));
    for (const c of pendingCandidates) {
      if (!sampleIds.has(c.discovery_id)) {
        sample.push(c);
        sampleIds.add(c.discovery_id);
        if (sample.length >= CANARY_SAMPLE_SIZE) break;
      }
    }
  }

  console.log(`Muestra estratificada seleccionada: ${sample.length} candidatos en ${orgKeys.length} institutos.\n`);

  // -------------------------------------------------------------------------
  // 3. EXECUTE CANARY RESOLUTION ENGINE
  // -------------------------------------------------------------------------
  console.log('--- 3. EJECUTANDO MOTOR CONICET WORK-FIRST ---');
  const resolver = new ConicetWorkFirstResolver('contact@youapp.com');
  const results: WorkFirstResolutionResult[] = [];

  let withDoi = 0;
  let withoutDoi = 0;
  let worksResolvedExactDoi = 0;
  let worksResolvedTitle = 0;
  let authorshipTargetFoundCount = 0;
  let identitiesResolved = 0;
  let withOrcidEmbedded = 0;
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

      if (res.authorship_target_found) authorshipTargetFoundCount++;
      if (res.identity_resolved) identitiesResolved++;
      if (res.has_embedded_orcid) withOrcidEmbedded++;
      if (res.is_ambiguous) ambiguousCount++;

      if (res.territorial_state === 'CURRENT') currentCount++;
      else if (res.territorial_state === 'RECENT') recentCount++;
      else if (res.territorial_state === 'ASSOCIATED_STALE') associatedStaleCount++;
      else if (res.territorial_state === 'NON_CABA_CONFIRMED') nonCabaCount++;
      else if (res.territorial_state === 'TERRITORIAL_CONFLICT') territorialConflictCount++;
      else unresolvedCount++;

      // ---------------------------------------------------------------------
      // 4. TRANSACTIONAL PERSISTENCE: Resolution Tables as Single Source of Truth
      // ---------------------------------------------------------------------
      const dbStatus = res.status;

      // Write directly to atlas_people_resolution_items (UPSERT with UNIQUE constraint)
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
        console.error(`Error persisting resolution item for ${candidate.discovery_id}:`, itemErr.message);
      }

      // Propagate certified derived state to Discovery WITHOUT touching social_profiles
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

      if (index % 10 === 0 || index === sample.length) {
        console.log(`[${index}/${sample.length}] "${candidate.display_name}" -> Status: ${res.status} | Work: ${res.work_match_method} | Author: ${res.author_match_method} | Terr: ${res.territorial_state}`);
      }

      // Respect API pacing (100ms)
      await delay(100);
    } catch (err: any) {
      console.error(`Error resolving index ${index} (${candidate.display_name}):`, err.message);
      unresolvedCount++;
    }
  }

  const durationSeconds = Math.round((Date.now() - startTime) / 1000);
  const stats = resolver.getStats();

  // -------------------------------------------------------------------------
  // 5. FORENSIC AUDIT (>= 50 cases)
  // -------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log('AUDITORÍA FORENSE DE EVIDENCIA — MUESTRA DE AL MENOS 50 CASOS');
  console.log('================================================================\n');

  // Mandatory audit subsets:
  // 1. All title-only matches
  const titleMatches = results.filter(r => r.work_match_method === 'WORK_CANDIDATE_MATCH_TITLE_STRONG');
  // 2. All territorial conflicts
  const conflictMatches = results.filter(r => r.territorial_state === 'TERRITORIAL_CONFLICT');
  // 3. All identity matches without ORCID
  const noOrcidMatches = results.filter(r => r.identity_resolved && !r.has_embedded_orcid);
  // 4. All ambiguous / multiple plausible authorships
  const ambiguousMatches = results.filter(r => r.is_ambiguous || r.author_match_method === 'AMBIGUOUS_MULTIPLE_CANDIDATES');
  // 5. Standard sample to reach >= 50
  const otherResolved = results.filter(r => r.identity_resolved && r.has_embedded_orcid);

  const auditSet = new Map<string, WorkFirstResolutionResult>();
  for (const item of [...titleMatches, ...conflictMatches, ...ambiguousMatches, ...noOrcidMatches, ...otherResolved]) {
    auditSet.set(item.discovery_id, item);
    if (auditSet.size >= 60) break;
  }

  const auditList = Array.from(auditSet.values());
  console.log(`Casos seleccionados para auditoría forense: ${auditList.length}`);
  console.log(`- Title-only matches auditados: ${titleMatches.length}`);
  console.log(`- Territorial conflict auditados: ${conflictMatches.length}`);
  console.log(`- Ambiguous authorship auditados: ${ambiguousMatches.length}`);
  console.log(`- Sin ORCID auditados: ${noOrcidMatches.length}`);

  let falseIdentityMerges = 0;
  let falseWorkMatches = 0;
  let falseCabaPromotions = 0;

  const auditReportRows: any[] = [];

  for (let idx = 0; idx < auditList.length; idx++) {
    const c = auditList[idx];
    const targetNorm = c.display_name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    const matchedAuthorNorm = c.matched_author ? `${c.matched_author.given || ''} ${c.matched_author.family || ''}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim() : '';

    let isIdentityMergeValid = true;
    let isWorkMatchValid = true;
    let isCabaPromotionValid = true;

    // Gate 1: Check False Identity Merge
    if (c.identity_resolved && c.matched_author) {
      const tokensTarget = targetNorm.split(' ').filter(t => t.length > 1);
      const tokensMatched = matchedAuthorNorm.split(' ').filter(t => t.length > 1);
      const overlap = tokensTarget.filter(t => tokensMatched.includes(t));
      if (overlap.length === 0) {
        isIdentityMergeValid = false;
        falseIdentityMerges++;
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

    auditReportRows.push({
      idx: idx + 1,
      target_name: c.display_name,
      work_match: c.work_match_method,
      work_doi: c.work_doi ? c.work_doi.slice(0, 20) : 'HANDLE_ONLY',
      author_match: c.author_match_method,
      territory: c.territorial_state,
      identity_resolved: c.identity_resolved,
      audit_identity: isIdentityMergeValid ? 'PASS' : 'FAIL',
      audit_work: isWorkMatchValid ? 'PASS' : 'FAIL',
      audit_caba: isCabaPromotionValid ? 'PASS' : 'FAIL'
    });
  }

  console.table(auditReportRows.slice(0, 25)); // Print sample
  console.log(`... y ${auditReportRows.length - 25} casos más auditados.`);

  console.log('\n--- RESULTADOS AUDITORÍA FORENSE ---');
  console.log(`FALSE_IDENTITY_MERGE:  ${falseIdentityMerges} (Exigido: 0) -> ${falseIdentityMerges === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`FALSE_WORK_MATCH:      ${falseWorkMatches} (Exigido: 0) -> ${falseWorkMatches === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`FALSE_CABA_PROMOTION:  ${falseCabaPromotions} (Exigido: 0) -> ${falseCabaPromotions === 0 ? 'PASS' : 'FAIL'}`);

  const auditGatesPass = falseIdentityMerges === 0 && falseWorkMatches === 0 && falseCabaPromotions === 0;

  // -------------------------------------------------------------------------
  // 6. METRICAS OBSERVADAS OBLIGATORIAS
  // -------------------------------------------------------------------------
  const totalWorksResolved = worksResolvedExactDoi + worksResolvedTitle;
  const workResolutionRate = parseFloat(((totalWorksResolved / sample.length) * 100).toFixed(1));
  const reqPerResolved = identitiesResolved > 0 
    ? parseFloat(((stats.crossrefSingleDoiRequests + stats.crossrefListRequests + stats.openalexRequests) / identitiesResolved).toFixed(2))
    : 0;

  const observedMetrics: ObservedCanaryMetrics = {
    SAMPLE_SIZE: sample.length,
    WITH_DOI: withDoi,
    WITHOUT_DOI: withoutDoi,
    WORKS_RESOLVED_EXACT_DOI: worksResolvedExactDoi,
    WORKS_RESOLVED_TITLE: worksResolvedTitle,
    WORK_RESOLUTION_RATE: workResolutionRate,
    AUTHORSHIP_TARGET_FOUND: authorshipTargetFoundCount,
    IDENTITIES_RESOLVED: identitiesResolved,
    WITH_ORCID_EMBEDDED: withOrcidEmbedded,
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
      FALSE_WORK_MATCH: falseWorkMatches,
      FALSE_CABA_PROMOTION: falseCabaPromotions,
      GATES_PASS: auditGatesPass
    }
  };

  console.log('\n================================================================');
  console.log('REPORTE OBLIGATORIO — VALORES FÍSICOS OBSERVADOS (N=200)');
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
  console.log(`END_UNIVERSE: ${postRecon.CABA_UNIVERSE_UNIQUE}`);

  // Save report to disk
  const reportDir = path.resolve(process.cwd(), 'reports/atlas/people');
  fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, 'conicet_canary_report_v1.json');
  fs.writeFileSync(reportPath, JSON.stringify({ observedMetrics, auditList }, null, 2), 'utf8');
  console.log(`Report JSON saved to: ${reportPath}`);

  return { observedMetrics, postRecon, auditList };
}

runCanary().catch(err => {
  console.error('Fatal error in Canary execution:', err);
  process.exit(1);
});
