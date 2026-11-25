/**
 * Atlas Semantic Intelligence — Real Semantic Backfill Stage 0 & Stage 1 Runner
 * Stage 0: Dry Run (max 50 real source rows, 0 DB writes)
 * Stage 1: Controlled Write (max 50 real source rows, first sanctioned production write)
 * Stops immediately after Stage 1.
 */

import { describe, it, expect } from 'vitest';
import { createGuardedTestClient as createClient } from '../lib/testDbGuard';
import dotenv from 'dotenv';
import {
  SemanticBackfillCoordinator,
  SemanticBackfillAudit
} from '../lib/atlasSemanticIngestion';
import {
  AtlasCanonicalEntityService,
  AtlasSemanticKnowledgeService
} from '../lib/atlasSemantic';

function loadEnv() {
  const loadFn = dotenv?.config || (dotenv as any)?.default?.config;
  if (typeof loadFn === 'function') {
    loadFn({ path: '.env.local' });
    loadFn({ path: '.env' });
  }
}
loadEnv();

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

describe('Atlas Semantic Real Backfill — Stage 0 & Stage 1 Execution', () => {
  it('Executes Stage 0 Dry Run and Stage 1 Controlled Write of max 50 real records', async () => {
    if (!supabaseSecretKey) {
      throw new Error('SUPABASE_SECRET_KEY is required for real backfill execution');
    }

    const supabase = createClient(supabaseUrl, supabaseSecretKey, {
      auth: { persistSession: false }
    });

    // Check target tenant for production backfill
    let { data: defaultTenant } = await supabase
      .from('atlas_tenants')
      .select('tenant_id')
      .eq('tenant_id', '00000000-0000-0000-0000-000000000000')
      .maybeSingle();

    if (!defaultTenant) {
      const { data: firstTenant } = await supabase
        .from('atlas_tenants')
        .select('tenant_id')
        .limit(1)
        .single();
      defaultTenant = firstTenant;
    }

    const targetTenantId = defaultTenant?.tenant_id || '00000000-0000-0000-0000-000000000000';

    const canonicalService = new AtlasCanonicalEntityService(supabase);
    const semanticService = new AtlasSemanticKnowledgeService(supabase, canonicalService);
    const coordinator = new SemanticBackfillCoordinator(supabase, canonicalService, semanticService);
    const auditService = new SemanticBackfillAudit(supabase);

    // =========================================================================
    // STAGE 0: DRY RUN (Max 50 real rows, READ-ONLY, WRITE = 0)
    // =========================================================================
    console.log('\n--- EXECUTING STAGE 0 DRY RUN (MAX 50 ROWS) ---');
    const stage0Report = await coordinator.runStage0DryRun({
      stage: 'STAGE_0_DRY_RUN',
      tenant_id: targetTenantId,
      max_rows: 50
    });

    console.log(`STAGE_0_SOURCE_ROWS_READ         = ${stage0Report.source_rows_read}`);
    console.log(`STAGE_0_ROWS_ELIGIBLE            = ${stage0Report.rows_eligible}`);
    console.log(`STAGE_0_CLAIMS_CANDIDATES        = ${stage0Report.claims_created}`);
    console.log(`STAGE_0_FACTS_CANDIDATES         = ${stage0Report.facts_created}`);
    console.log(`STAGE_0_RELATIONSHIPS_CANDIDATES = ${stage0Report.relationships_created}`);

    expect(stage0Report.source_rows_read).toBeGreaterThan(0);
    expect(stage0Report.source_rows_read).toBeLessThanOrEqual(50);
    expect(stage0Report.errors).toBe(0);

    // Verify DB count remains 0 during dry run
    const { count: entitiesCountPre } = await supabase
      .from('atlas_canonical_entities')
      .select('*', { count: 'exact', head: true });
    expect(entitiesCountPre || 0).toBe(0);

    // =========================================================================
    // STAGE 1: CONTROLLED PRODUCTION WRITE (Max 50 real rows)
    // =========================================================================
    console.log('\n--- EXECUTING STAGE 1 CONTROLLED WRITE (MAX 50 ROWS) ---');
    const stage1Report = await coordinator.runStage1ControlledWrite({
      stage: 'STAGE_1_CONTROLLED_WRITE',
      tenant_id: targetTenantId,
      max_rows: 50
    });

    console.log(`STAGE_1_SOURCE_ROWS_READ         = ${stage1Report.source_rows_read}`);
    console.log(`STAGE_1_ROWS_ELIGIBLE            = ${stage1Report.rows_eligible}`);
    console.log(`CANONICAL_ENTITIES_CREATED       = ${stage1Report.canonical_entities_created}`);
    console.log(`CANONICAL_ENTITIES_MATCHED       = ${stage1Report.canonical_entities_matched}`);
    console.log(`SOURCE_OBSERVATIONS_CREATED      = ${stage1Report.observations_created}`);
    console.log(`CLAIMS_CREATED                   = ${stage1Report.claims_created}`);
    console.log(`FACTS_CREATED                    = ${stage1Report.facts_created}`);
    console.log(`RELATIONSHIPS_CREATED            = ${stage1Report.relationships_created}`);
    console.log(`INFERENCES_CREATED               = ${stage1Report.inferences_created}`);
    console.log(`EVIDENCE_LINKS_CREATED           = ${stage1Report.evidence_links_created}`);
    console.log(`ERRORS                           = ${stage1Report.errors}`);

    expect(stage1Report.source_rows_read).toBeGreaterThan(0);
    expect(stage1Report.source_rows_read).toBeLessThanOrEqual(50);
    expect(stage1Report.canonical_entities_created).toBeGreaterThan(0);
    expect(stage1Report.observations_created).toBeGreaterThan(0);
    expect(stage1Report.errors).toBe(0);

    // Query post-backfill database totals
    const { count: postEntities } = await supabase
      .from('atlas_canonical_entities')
      .select('*', { count: 'exact', head: true });
    const { count: postObservations } = await supabase
      .from('atlas_entity_source_observations')
      .select('*', { count: 'exact', head: true });
    const { count: postFacts } = await supabase
      .from('atlas_semantic_facts')
      .select('*', { count: 'exact', head: true });
    const { count: postRelationships } = await supabase
      .from('atlas_semantic_relationships')
      .select('*', { count: 'exact', head: true });
    const { count: postInferences } = await supabase
      .from('atlas_semantic_inferences')
      .select('*', { count: 'exact', head: true });
    const { count: postEvidence } = await supabase
      .from('atlas_semantic_fact_evidence')
      .select('*', { count: 'exact', head: true });

    console.log('\n=========================================================');
    console.log(' POST-BACKFILL REAL DATABASE TOTALS');
    console.log('=========================================================');
    console.log(`POST_BACKFILL_CANONICAL_ENTITIES_COUNT  = ${postEntities}`);
    console.log(`POST_BACKFILL_SOURCE_OBSERVATIONS_COUNT = ${postObservations}`);
    console.log(`POST_BACKFILL_FACTS_COUNT               = ${postFacts}`);
    console.log(`POST_BACKFILL_RELATIONSHIPS_COUNT       = ${postRelationships}`);
    console.log(`POST_BACKFILL_INFERENCES_COUNT          = ${postInferences}`);
    console.log(`POST_BACKFILL_FACT_EVIDENCE_COUNT       = ${postEvidence}`);
    console.log('=========================================================\n');

    expect(postEntities).toBeGreaterThan(0);
    expect(postObservations).toBeGreaterThan(0);

    // =========================================================================
    // HUMAN REVIEW SAMPLE (20 real transformations)
    // =========================================================================
    const samples = await auditService.getHumanReviewSample(targetTenantId, 20);
    console.log('--- HUMAN REVIEW AUDIT SAMPLES (20 TRANSFORMATIONS) ---');
    samples.forEach((s, idx) => {
      console.log(`[${idx + 1}] ${s.source_name} (${s.source_record_id}) -> [${s.entity_type}] ${s.entity_canonical_name} | ${s.predicate_code}: ${s.object_summary} | Epistemic: ${s.knowledge_type} | Obs: ${s.evidence_observation_id}`);
    });
    console.log('-------------------------------------------------------\n');

    expect(samples.length).toBeGreaterThan(0);
  }, 300000);
});
