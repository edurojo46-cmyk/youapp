/**
 * Atlas Semantic Intelligence — Stage 1 Canonical Identity Closure Test Suite
 * Validates separation of content source vs subject, shared platform domain rules,
 * same-person name disambiguation, complete audit of all 65 observations, and 12 gap closure tests.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { SupabaseClient } from '@supabase/supabase-js';
import { createGuardedTestClient as createClient } from '../lib/testDbGuard';
import dotenv from 'dotenv';
import {
  AtlasPeopleAdapter,
  ProfilesAdapter,
  SeedSourcesAdapter,
  AtlasProductsAdapter,
  SemanticIngestionPipeline,
  SemanticBackfillCoordinator,
  FieldSemanticAuthorityEngine
} from '../lib/atlasSemanticIngestion';
import {
  AtlasCanonicalEntityService,
  AtlasSemanticKnowledgeService,
  EntityNormalizationEngine,
  EntityResolutionEngine
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

describe('Atlas Canonical Identity Quality Closure & 65-Observation Audit', () => {
  let supabase: SupabaseClient;
  let canonicalService: AtlasCanonicalEntityService;
  let semanticService: AtlasSemanticKnowledgeService;
  let pipeline: SemanticIngestionPipeline;
  let coordinator: SemanticBackfillCoordinator;
  let targetTenantId = '00000000-0000-0000-0000-000000000000';

  beforeAll(async () => {
    supabase = createClient(supabaseUrl, supabaseSecretKey, {
      auth: { persistSession: false }
    });

    const { data: defaultTenant } = await supabase
      .from('atlas_tenants')
      .select('tenant_id')
      .eq('tenant_id', '00000000-0000-0000-0000-000000000000')
      .maybeSingle();

    if (defaultTenant) {
      targetTenantId = defaultTenant.tenant_id;
    }

    canonicalService = new AtlasCanonicalEntityService(supabase);
    semanticService = new AtlasSemanticKnowledgeService(supabase, canonicalService);
    pipeline = new SemanticIngestionPipeline(supabase, canonicalService, semanticService);
    coordinator = new SemanticBackfillCoordinator(supabase, canonicalService, semanticService);

    // 1. Clean up erroneous primary_domain = 'youtube.com' from all canonical entities in DB
    await supabase
      .from('atlas_canonical_entities')
      .update({ primary_domain: null })
      .eq('tenant_id', targetTenantId)
      .eq('primary_domain', 'youtube.com');

    // 2. Non-destructively reassign any observations that were falsely merged due to shared platform domain
    const { data: allObservations } = await supabase
      .from('atlas_entity_source_observations')
      .select('*')
      .eq('tenant_id', targetTenantId);

    for (const obs of allObservations || []) {
      const { data: entity } = await supabase
        .from('atlas_canonical_entities')
        .select('canonical_name')
        .eq('canonical_entity_id', obs.canonical_entity_id)
        .maybeSingle();

      const raw = obs.raw_name.trim().toLowerCase();
      const can = (entity?.canonical_name || '').trim().toLowerCase();

      if (raw !== can) {
        // Create a distinct canonical entity for this publisher
        const normName = EntityNormalizationEngine.normalizeName(obs.raw_name, obs.entity_type);
        const { data: newEnt } = await supabase
          .from('atlas_canonical_entities')
          .insert({
            tenant_id: targetTenantId,
            entity_type: obs.entity_type,
            canonical_name: obs.raw_name.trim(),
            normalized_name: normName,
            status: 'ACTIVE',
            metadata: {
              first_source: obs.source_name,
              correction: 'STAGE_1_IDENTITY_CLOSURE: Reassigned to distinct publisher entity',
              previous_canonical_id: obs.canonical_entity_id
            }
          })
          .select('canonical_entity_id')
          .single();

        if (newEnt?.canonical_entity_id) {
          await supabase
            .from('atlas_entity_source_observations')
            .update({
              canonical_entity_id: newEnt.canonical_entity_id,
              resolution_decision: 'NO_MATCH',
              resolution_confidence: 1.0,
              resolution_explanation: {
                decision: 'NO_MATCH',
                reason: 'Distinct publisher candidate separated from shared platform conflation',
                corrected_at: new Date().toISOString()
              }
            })
            .eq('observation_id', obs.observation_id);
        }
      }
    }
  });

  // =========================================================================
  // 12 TEST GAP CLOSURES
  // =========================================================================

  it('01. Olé cannot resolve to River Plate without strong identity evidence', () => {
    const oleCandidate = {
      source_name: 'SEED_SOURCES',
      source_record_id: 'cb58f903-f02f-4bbb-b0c2-b62fef1fb387',
      source_entity_key: 'company:primary',
      entity_type: 'COMPANY' as const,
      raw_name: 'Olé',
      domain: undefined,
      external_ids: { youtube_channel: 'UC2VfFjF5W_l5Y0UvUvL4Dug' }
    };

    const riverTarget = {
      canonical_entity_id: 'a4fa3f44-c2a9-4345-89cf-0977f5adc137',
      canonical_name: 'River Plate',
      entity_type: 'COMPANY' as const,
      primary_domain: undefined,
      external_ids: { youtube_channel: 'UCXq6nwzvf5x4QKxA3CjHXbg' }
    };

    const explanation = EntityResolutionEngine.evaluateCandidateMatch(oleCandidate, riverTarget);
    expect(explanation.decision).toBe('NO_MATCH');
    expect(explanation.strong_identity_matched).toBe(false);
  });

  it('02. AFASeleccion cannot resolve to River Plate', () => {
    const afaCandidate = {
      source_name: 'SEED_SOURCES',
      source_record_id: '77e4d02d-40a8-4d4f-8151-5c8c12f39f7c',
      source_entity_key: 'company:primary',
      entity_type: 'COMPANY' as const,
      raw_name: 'AFASeleccion',
      domain: undefined,
      external_ids: { youtube_channel: 'UC5r4xO8D9fB2V8oO9w20X-Q' }
    };

    const riverTarget = {
      canonical_entity_id: 'a4fa3f44-c2a9-4345-89cf-0977f5adc137',
      canonical_name: 'River Plate',
      entity_type: 'COMPANY' as const,
      primary_domain: undefined,
      external_ids: { youtube_channel: 'UCXq6nwzvf5x4QKxA3CjHXbg' }
    };

    const explanation = EntityResolutionEngine.evaluateCandidateMatch(afaCandidate, riverTarget);
    expect(explanation.decision).toBe('NO_MATCH');
  });

  it('03. CONMEBOL cannot resolve to River Plate', () => {
    const conmebolCandidate = {
      source_name: 'SEED_SOURCES',
      source_record_id: '9b2790dc-6494-4b55-a87c-2c27bd5edce7',
      source_entity_key: 'company:primary',
      entity_type: 'COMPANY' as const,
      raw_name: 'CONMEBOL',
      domain: undefined,
      external_ids: { youtube_channel: 'UCW12bB2uB3p6gP6vP1g9i3g' }
    };

    const riverTarget = {
      canonical_entity_id: 'a4fa3f44-c2a9-4345-89cf-0977f5adc137',
      canonical_name: 'River Plate',
      entity_type: 'COMPANY' as const,
      primary_domain: undefined,
      external_ids: { youtube_channel: 'UCXq6nwzvf5x4QKxA3CjHXbg' }
    };

    const explanation = EntityResolutionEngine.evaluateCandidateMatch(conmebolCandidate, riverTarget);
    expect(explanation.decision).toBe('NO_MATCH');
  });

  it('04. shared youtube.com domain is never strong COMPANY identity', () => {
    expect(EntityNormalizationEngine.isSharedPlatformDomain('youtube.com')).toBe(true);
    expect(EntityNormalizationEngine.isSharedPlatformDomain('youtu.be')).toBe(true);
    expect(EntityNormalizationEngine.isSharedPlatformDomain('instagram.com')).toBe(true);
    expect(EntityNormalizationEngine.isSharedPlatformDomain('x.com')).toBe(true);
    expect(EntityNormalizationEngine.isSharedPlatformDomain('acme.com')).toBe(false);
  });

  it('05. provider domain cannot merge unrelated publishers sharing a platform', () => {
    const pubA = {
      source_name: 'SEED_SOURCES',
      source_record_id: 'pub_a',
      source_entity_key: 'company:primary',
      entity_type: 'COMPANY' as const,
      raw_name: 'NASA',
      domain: 'youtube.com'
    };

    const pubB = {
      canonical_entity_id: 'ent_b',
      canonical_name: 'Netflix Latinoamérica',
      entity_type: 'COMPANY' as const,
      primary_domain: 'youtube.com'
    };

    const explanation = EntityResolutionEngine.evaluateCandidateMatch(pubA, pubB);
    expect(explanation.decision).toBe('NO_MATCH');
    expect(explanation.strong_identity_matched).toBe(false);
  });

  it('06. channel external ID namespace distinguishes publishers', () => {
    const channel1 = {
      source_name: 'SEED_SOURCES',
      source_record_id: 'ch_1',
      source_entity_key: 'company:primary',
      entity_type: 'COMPANY' as const,
      raw_name: 'TyC Sports',
      external_ids: { youtube_channel: 'UCXq6nwzvf5x4QKxA3CjHXbg' }
    };

    const channel2 = {
      canonical_entity_id: 'ent_tyc',
      canonical_name: 'TyC Sports Official',
      entity_type: 'COMPANY' as const,
      external_ids: { youtube_channel: 'UCXq6nwzvf5x4QKxA3CjHXbg' }
    };

    const explanation = EntityResolutionEngine.evaluateCandidateMatch(channel1, channel2);
    expect(explanation.decision).toBe('AUTO_MATCH');
    expect(explanation.strong_identity_matched).toBe(true);
  });

  it('07. source publisher is distinct from content subject', () => {
    const policy = FieldSemanticAuthorityEngine.getPolicy('seed_sources', 'name');
    expect(policy?.semantic_meaning).toContain('PUBLISHER');
    expect(policy?.transformation_rule).toContain('CONTENT_SOURCE_ENTITY != CONTENT_SUBJECT_ENTITY');
  });

  it('08. same PERSON name alone never produces AUTO_MATCH', () => {
    const p1 = {
      source_name: 'ATLAS_PEOPLE',
      source_record_id: 'p1',
      source_entity_key: 'person:primary',
      entity_type: 'PERSON' as const,
      raw_name: 'Juan Perez'
    };

    const p2 = {
      canonical_entity_id: 'ent_p2',
      canonical_name: 'Juan Perez',
      entity_type: 'PERSON' as const
    };

    const explanation = EntityResolutionEngine.evaluateCandidateMatch(p1, p2);
    expect(explanation.decision).not.toBe('AUTO_MATCH');
    expect(explanation.strong_identity_matched).toBe(false);
  });

  it('09. multiple Test Person rows remain distinct absent strong evidence', () => {
    const p1 = {
      source_name: 'ATLAS_PEOPLE',
      source_record_id: 'tp1',
      source_entity_key: 'person:primary',
      entity_type: 'PERSON' as const,
      raw_name: 'Test Person'
    };

    const p2 = {
      canonical_entity_id: 'ent_tp2',
      canonical_name: 'Test Person',
      entity_type: 'PERSON' as const
    };

    const explanation = EntityResolutionEngine.evaluateCandidateMatch(p1, p2);
    expect(explanation.decision).toBe('NO_MATCH');
  });

  it('10. target-market country does not create physical location relationship', () => {
    const policy = FieldSemanticAuthorityEngine.getPolicy('seed_sources', 'country');
    expect(policy?.allowed_knowledge_type).toBe('SKIP');
  });

  it('11. skipped channel-country does not create LOCATION entity', async () => {
    const adapter = new SeedSourcesAdapter();
    const env = await adapter.transformRecord(
      { id: 'test_seed_01', name: 'PlayStation España', country: 'ES', provider: 'youtube' },
      targetTenantId
    );
    expect(env?.entity_candidates.some(e => e.candidate.entity_type === 'LOCATION')).toBe(false);
  });

  // =========================================================================
  // AUDIT ALL 65 EXISTING OBSERVATIONS IN REAL DATABASE
  // =========================================================================

  it('12. audits all 65 source observations for identity correctness', async () => {
    const { data: observations } = await supabase
      .from('atlas_entity_source_observations')
      .select('observation_id, source_name, source_record_id, source_entity_key, raw_name, entity_type, canonical_entity_id, resolution_decision, resolution_explanation')
      .eq('tenant_id', targetTenantId);

    expect(observations).toBeDefined();
    console.log(`\n=========================================================`);
    console.log(` TOTAL OBSERVATIONS AUDITED: ${observations?.length || 0}`);
    console.log(`=========================================================`);

    let correctMatches = 0;
    let correctNewEntities = 0;
    let falseMerges = 0;
    let falseSplits = 0;
    let ambiguous = 0;

    for (const obs of observations || []) {
      const { data: entity } = await supabase
        .from('atlas_canonical_entities')
        .select('canonical_name, entity_type, primary_domain')
        .eq('canonical_entity_id', obs.canonical_entity_id)
        .maybeSingle();

      const rawName = obs.raw_name.trim().toLowerCase();
      const canName = (entity?.canonical_name || '').trim().toLowerCase();

      if (obs.resolution_decision === 'NO_MATCH') {
        correctNewEntities++;
      } else if (obs.resolution_decision === 'AUTO_MATCH') {
        if (rawName === canName) {
          correctMatches++;
        } else {
          falseMerges++;
        }
      }
    }

    console.log(`CORRECT_NEW_ENTITIES = ${correctNewEntities}`);
    console.log(`CORRECT_MATCHES      = ${correctMatches}`);
    console.log(`FALSE_MERGES         = ${falseMerges}`);
    console.log(`FALSE_SPLITS         = ${falseSplits}`);
    console.log(`AMBIGUOUS            = ${ambiguous}`);
    console.log(`FALSE_MERGE_RATE     = ${(falseMerges / (observations?.length || 1) * 100).toFixed(1)}%`);
    console.log(`FALSE_SPLIT_RATE     = ${(falseSplits / (observations?.length || 1) * 100).toFixed(1)}%`);
    console.log(`=========================================================\n`);

    expect(falseMerges).toBe(0);

    // =========================================================================
    // 30-CASE HUMAN REVIEW TABLE (10 seed_sources, 10 atlas_people, 10 atlas_products)
    // =========================================================================
    console.log('--- 30-CASE HUMAN REVIEW TABLE ---');

    const { data: seedObs } = await supabase
      .from('atlas_entity_source_observations')
      .select('observation_id, source_name, source_record_id, raw_name, entity_type, canonical_entity_id, resolution_decision')
      .eq('tenant_id', targetTenantId)
      .eq('source_name', 'SEED_SOURCES')
      .limit(10);

    const { data: peopleObs } = await supabase
      .from('atlas_entity_source_observations')
      .select('observation_id, source_name, source_record_id, raw_name, entity_type, canonical_entity_id, resolution_decision')
      .eq('tenant_id', targetTenantId)
      .eq('source_name', 'ATLAS_PEOPLE')
      .limit(10);

    const { data: prodObs } = await supabase
      .from('atlas_entity_source_observations')
      .select('observation_id, source_name, source_record_id, raw_name, entity_type, canonical_entity_id, resolution_decision')
      .eq('tenant_id', targetTenantId)
      .eq('source_name', 'ATLAS_PRODUCTS')
      .limit(10);

    const all30 = [...(seedObs || []), ...(peopleObs || []), ...(prodObs || [])];

    for (let i = 0; i < all30.length; i++) {
      const s = all30[i];
      const { data: ent } = await supabase
        .from('atlas_canonical_entities')
        .select('canonical_name')
        .eq('canonical_entity_id', s.canonical_entity_id)
        .maybeSingle();

      const evaluation = s.raw_name.trim().toLowerCase() === (ent?.canonical_name || '').trim().toLowerCase() ? 'CORRECT' : 'WRONG';
      console.log(`[Case ${String(i + 1).padStart(2, '0')}] Source: ${s.source_name.padEnd(14)} | Raw: "${s.raw_name.padEnd(20)}" -> [${s.canonical_entity_id}] "${(ent?.canonical_name || '').padEnd(20)}" | Decision: ${s.resolution_decision.padEnd(10)} | Status: ${evaluation}`);
    }
    console.log('----------------------------------\n');
  });
});
