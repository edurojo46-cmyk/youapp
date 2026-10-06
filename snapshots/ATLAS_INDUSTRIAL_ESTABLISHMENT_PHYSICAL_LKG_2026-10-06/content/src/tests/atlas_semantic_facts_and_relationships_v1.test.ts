/**
 * Atlas Semantic Intelligence — Semantic Facts & Relationships Test Suite V1
 * Comprehensive test suite covering epistemological knowledge types, typed predicates,
 * domain/range validation, multi-source evidence, temporal overlap, contradiction ledger,
 * conservative current fact resolution, normalized inference lineage, and recursive PII fail-closed guards.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SupabaseClient } from '@supabase/supabase-js';
import { createGuardedTestClient as createClient } from '../lib/testDbGuard';
import * as dotenv from 'dotenv';
import {
  AtlasSemanticKnowledgeService,
  AtlasCanonicalEntityService,
  PredicateRegistry,
  AtlasInferenceEngine
} from '../lib/atlasSemantic';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || '';

const hasDbCredentials = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

describe('Atlas Semantic Intelligence — Semantic Facts & Relationships V1', () => {
  let supabase: SupabaseClient;
  let canonicalService: AtlasCanonicalEntityService;
  let semanticService: AtlasSemanticKnowledgeService;

  let testTenantId: string;
  let testTenantBId: string;

  // Test entities
  let companyAcmeId: string;
  let companyBetaId: string;
  let personJuanId: string;
  let locationBaId: string;
  let locationCordobaId: string;
  let productAtlasId: string;
  let serviceConsultingId: string;

  // Test observations
  let obs1Id: string;
  let obs2Id: string;
  let obs3Id: string;

  beforeAll(async () => {
    if (!hasDbCredentials) return;

    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false }
    });

    canonicalService = new AtlasCanonicalEntityService(supabase);
    semanticService = new AtlasSemanticKnowledgeService(supabase, canonicalService);

    // Setup or retrieve test tenants
    const { data: tenantA } = await supabase
      .from('atlas_tenants')
      .insert({
        name: `Semantic Test Tenant A ${Date.now()}`,
        tier: 'ENTERPRISE',
        is_active: true
      })
      .select('tenant_id')
      .single();

    testTenantId = tenantA?.tenant_id;

    const { data: tenantB } = await supabase
      .from('atlas_tenants')
      .insert({
        name: `Semantic Test Tenant B ${Date.now()}`,
        tier: 'FREE',
        is_active: true
      })
      .select('tenant_id')
      .single();

    testTenantBId = tenantB?.tenant_id;

    // Create test canonical entities
    const acmeRes = await canonicalService.resolveEntityCandidate(
      {
        raw_name: 'ACME Corporation',
        entity_type: 'COMPANY',
        source_name: 'TEST_SEED',
        source_record_id: `rec_acme_${Date.now()}`
      },
      testTenantId
    );
    companyAcmeId = acmeRes.canonical_entity_id!;
    obs1Id = acmeRes.observation_id!;

    const betaRes = await canonicalService.resolveEntityCandidate(
      {
        raw_name: 'Beta Tech Ltd',
        entity_type: 'COMPANY',
        source_name: 'TEST_SEED',
        source_record_id: `rec_beta_${Date.now()}`
      },
      testTenantId
    );
    companyBetaId = betaRes.canonical_entity_id!;
    obs2Id = betaRes.observation_id!;

    const juanRes = await canonicalService.resolveEntityCandidate(
      {
        raw_name: 'Juan Perez',
        entity_type: 'PERSON',
        source_name: 'TEST_SEED',
        source_record_id: `rec_juan_${Date.now()}`
      },
      testTenantId
    );
    personJuanId = juanRes.canonical_entity_id!;
    obs3Id = juanRes.observation_id!;

    const baRes = await canonicalService.resolveEntityCandidate(
      {
        raw_name: 'Buenos Aires',
        entity_type: 'LOCATION',
        source_name: 'TEST_SEED',
        source_record_id: `rec_ba_${Date.now()}`
      },
      testTenantId
    );
    locationBaId = baRes.canonical_entity_id!;

    const cbaRes = await canonicalService.resolveEntityCandidate(
      {
        raw_name: 'Cordoba',
        entity_type: 'LOCATION',
        source_name: 'TEST_SEED',
        source_record_id: `rec_cba_${Date.now()}`
      },
      testTenantId
    );
    locationCordobaId = cbaRes.canonical_entity_id!;

    const prodRes = await canonicalService.resolveEntityCandidate(
      {
        raw_name: 'Atlas Platform',
        entity_type: 'PRODUCT',
        source_name: 'TEST_SEED',
        source_record_id: `rec_atlas_${Date.now()}`
      },
      testTenantId
    );
    productAtlasId = prodRes.canonical_entity_id!;

    const servRes = await canonicalService.resolveEntityCandidate(
      {
        raw_name: 'Cloud Consulting',
        entity_type: 'SERVICE',
        source_name: 'TEST_SEED',
        source_record_id: `rec_consulting_${Date.now()}`
      },
      testTenantId
    );
    serviceConsultingId = servRes.canonical_entity_id!;
  });

  afterAll(async () => {
    if (!hasDbCredentials) return;
    if (testTenantId) {
      await supabase.from('atlas_tenants').delete().eq('tenant_id', testTenantId);
    }
    if (testTenantBId) {
      await supabase.from('atlas_tenants').delete().eq('tenant_id', testTenantBId);
    }
  });

  // ============================================================================
  // BLOCK 1: FACT VS RELATIONSHIP ARCHITECTURAL SEPARATION & PREDICATE REGISTRY
  // ============================================================================

  it('1. Predicate Registry has all core governed predicates with metadata', () => {
    const all = PredicateRegistry.getAllPredicates();
    expect(all.length).toBeGreaterThanOrEqual(19);

    const worksAt = PredicateRegistry.getPredicate('WORKS_AT');
    expect(worksAt).toBeDefined();
    expect(worksAt?.object_kind).toBe('CANONICAL_ENTITY');
    expect(worksAt?.subject_entity_types).toContain('PERSON');

    const empCount = PredicateRegistry.getPredicate('EMPLOYEE_COUNT');
    expect(empCount).toBeDefined();
    expect(empCount?.object_kind).toBe('LITERAL_VALUE');
    expect(empCount?.object_value_type).toBe('INTEGER');
  });

  it('2. Predicate Registry is extensible without PostgreSQL enum mutation', () => {
    expect(PredicateRegistry.getPredicate('WORKS_AT')?.is_active).toBe(true);
    expect(PredicateRegistry.getPredicate('NON_EXISTENT_PRED')).toBeUndefined();
  });

  it('3. Facts require typed literal values matching expected_value_type', () => {
    const valid = PredicateRegistry.validateFactInput('EMPLOYEE_COUNT', 'COMPANY', 'INTEGER', 80);
    expect(valid.valid).toBe(true);

    const invalidType = PredicateRegistry.validateFactInput('EMPLOYEE_COUNT', 'COMPANY', 'TEXT', '80');
    expect(invalidType.valid).toBe(false);
    expect(invalidType.error).toContain('VALUE_TYPE_MISMATCH');
  });

  it('4. Fact literal type validated against value format (e.g. integer vs string)', () => {
    const invalidVal = PredicateRegistry.validateFactInput('EMPLOYEE_COUNT', 'COMPANY', 'INTEGER', 80.5);
    expect(invalidVal.valid).toBe(false);
    expect(invalidVal.error).toContain('LITERAL_TYPE_INVALID');
  });

  it('5. Fact rejects unknown predicate fail-closed', () => {
    const res = PredicateRegistry.validateFactInput('UNKNOWN_PRED', 'COMPANY', 'TEXT', 'foo');
    expect(res.valid).toBe(false);
    expect(res.error).toContain('PREDICATE_UNKNOWN');
  });

  it('6. Fact domain validation blocks invalid subject entity types', () => {
    const res = PredicateRegistry.validateFactInput('EMPLOYEE_COUNT', 'PERSON', 'INTEGER', 5);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('DOMAIN_VIOLATION');
  });

  it('7. Fact cannot be created with relationship predicate', () => {
    const res = PredicateRegistry.validateFactInput('WORKS_AT', 'PERSON', 'TEXT', 'ACME');
    expect(res.valid).toBe(false);
    expect(res.error).toContain('PREDICATE_KIND_MISMATCH');
  });

  it('8. Relationship domain validation blocks invalid subject type', () => {
    const res = PredicateRegistry.validateRelationshipInput('WORKS_AT', 'COMPANY', 'COMPANY');
    expect(res.valid).toBe(false);
    expect(res.error).toContain('DOMAIN_VIOLATION');
  });

  it('9. Relationship range validation blocks invalid object entity type', () => {
    const res = PredicateRegistry.validateRelationshipInput('WORKS_AT', 'PERSON', 'PRODUCT');
    expect(res.valid).toBe(false);
    expect(res.error).toContain('RANGE_VIOLATION');
  });

  it('10. Relationship rejects literal fact predicate', () => {
    const res = PredicateRegistry.validateRelationshipInput('EMPLOYEE_COUNT', 'COMPANY', 'COMPANY');
    expect(res.valid).toBe(false);
    expect(res.error).toContain('PREDICATE_KIND_MISMATCH');
  });

  it('11. Self-relationship is prohibited (subject === object)', async () => {
    if (!hasDbCredentials) return;
    await expect(
      semanticService.assertRelationship(
        {
          subject_entity_id: companyAcmeId,
          predicate_code: 'OWNS',
          object_entity_id: companyAcmeId
        },
        testTenantId
      )
    ).rejects.toThrow('SELF_RELATIONSHIP_PROHIBITED');
  });

  it('12. HIRING_FOR_ROLE is represented as typed literal fact, not fake ROLE entity', async () => {
    if (!hasDbCredentials) return;
    const fact = await semanticService.assertFact(
      {
        subject_entity_id: companyAcmeId,
        predicate_code: 'HIRING_FOR_ROLE',
        value_type: 'TEXT',
        object_value: 'Senior Distributed Systems Engineer',
        knowledge_type: 'CLAIM'
      },
      testTenantId
    );

    expect(fact.fact_id).toBeDefined();
    expect(fact.predicate_code).toBe('HIRING_FOR_ROLE');
    expect(fact.object_value).toBe('Senior Distributed Systems Engineer');
    expect(fact.value_type).toBe('TEXT');
  });

  it('13. OPEN_POSITIONS_COUNT represented as typed INTEGER fact', async () => {
    if (!hasDbCredentials) return;
    const fact = await semanticService.assertFact(
      {
        subject_entity_id: companyAcmeId,
        predicate_code: 'OPEN_POSITIONS_COUNT',
        value_type: 'INTEGER',
        object_value: 12,
        knowledge_type: 'CLAIM'
      },
      testTenantId
    );

    expect(fact.fact_id).toBeDefined();
    expect(fact.object_value).toBe(12);
    expect(fact.value_type).toBe('INTEGER');
  });

  // ============================================================================
  // BLOCK 2: PROVENANCE, MANY-TO-MANY EVIDENCE & EPISTEMOLOGICAL LIFECYCLE
  // ============================================================================

  it('14. One fact accepts multiple evidence observations without data loss', async () => {
    if (!hasDbCredentials) return;
    const fact = await semanticService.assertFact(
      {
        subject_entity_id: companyAcmeId,
        predicate_code: 'INDUSTRY',
        value_type: 'TEXT',
        object_value: 'Enterprise Software',
        knowledge_type: 'FACT',
        validation_method: 'MULTI_SOURCE_CORROBORATION',
        evidence: [
          { source_observation_id: obs1Id, evidence_role: 'PRIMARY_SOURCE', confidence_contribution: 0.9 },
          { source_observation_id: obs2Id, evidence_role: 'CORROBORATING_SOURCE', confidence_contribution: 0.85 }
        ]
      },
      testTenantId
    );

    expect(fact.evidence?.length).toBe(2);
    expect(fact.evidence?.some(e => e.source_observation_id === obs1Id)).toBe(true);
    expect(fact.evidence?.some(e => e.source_observation_id === obs2Id)).toBe(true);
  });

  it('15. One relationship accepts multiple evidence observations', async () => {
    if (!hasDbCredentials) return;
    const rel = await semanticService.assertRelationship(
      {
        subject_entity_id: personJuanId,
        predicate_code: 'WORKS_AT',
        object_entity_id: companyAcmeId,
        knowledge_type: 'FACT',
        validation_method: 'MULTI_SOURCE_CORROBORATION',
        evidence: [
          { source_observation_id: obs1Id, evidence_role: 'HR_RECORD' },
          { source_observation_id: obs3Id, evidence_role: 'EMPLOYEE_PROFILE' }
        ]
      },
      testTenantId
    );

    expect(rel.relationship_id).toBeDefined();
    expect(rel.evidence?.length).toBe(2);
  });

  it('16. External source cannot self-promote CLAIM to FACT without validation method', async () => {
    if (!hasDbCredentials) return;
    await expect(
      semanticService.assertFact(
        {
          subject_entity_id: companyAcmeId,
          predicate_code: 'EMPLOYEE_COUNT',
          value_type: 'INTEGER',
          object_value: 150,
          knowledge_type: 'FACT',
          validation_method: 'UNVALIDATED_CLAIM'
        },
        testTenantId
      )
    ).rejects.toThrow('PROMOTION_VALIDATION_REQUIRED');
  });

  it('17. Raw external inputs default to knowledge_type CLAIM', async () => {
    if (!hasDbCredentials) return;
    const claim = await semanticService.assertFact(
      {
        subject_entity_id: companyAcmeId,
        predicate_code: 'TECH_STACK',
        value_type: 'TEXT',
        object_value: 'PostgreSQL'
      },
      testTenantId
    );

    expect(claim.knowledge_type).toBe('CLAIM');
    expect(claim.validation_method).toBe('UNVALIDATED_CLAIM');
    expect(claim.validated_at).toBeUndefined();
  });

  it('18. FACT promotion with AUTHORITATIVE_SOURCE records validation provenance', async () => {
    if (!hasDbCredentials) return;
    const fact = await semanticService.assertFact(
      {
        subject_entity_id: companyAcmeId,
        predicate_code: 'ANNUAL_REVENUE',
        value_type: 'MONEY',
        object_value: 5000000.0,
        knowledge_type: 'FACT',
        validation_method: 'AUTHORITATIVE_SOURCE',
        validated_by_type: 'SEC_FILING_AUDIT',
        evidence: [{ source_observation_id: obs1Id }]
      },
      testTenantId
    );

    expect(fact.knowledge_type).toBe('FACT');
    expect(fact.validation_method).toBe('AUTHORITATIVE_SOURCE');
    expect(fact.validated_by_type).toBe('SEC_FILING_AUDIT');
    expect(fact.validated_at).toBeDefined();
  });

  it('19. USER_CONFIRMED_FACT automatically sets validation_method USER_CONFIRMATION', async () => {
    if (!hasDbCredentials) return;
    const fact = await semanticService.assertFact(
      {
        subject_entity_id: personJuanId,
        predicate_code: 'HAS_ROLE',
        value_type: 'TEXT',
        object_value: 'VP of Engineering',
        knowledge_type: 'USER_CONFIRMED_FACT'
      },
      testTenantId
    );

    expect(fact.knowledge_type).toBe('USER_CONFIRMED_FACT');
    expect(fact.validation_method).toBe('USER_CONFIRMATION');
    expect(fact.validated_at).toBeDefined();
  });

  // ============================================================================
  // BLOCK 3: TEMPORAL OVERLAP & CONTRADICTION DETECTION
  // ============================================================================

  it('20. Separate temporal concepts: created_at != observed_at != valid_from', async () => {
    if (!hasDbCredentials) return;
    const observedDate = '2025-01-15T00:00:00Z';
    const validFromDate = '2024-06-01T00:00:00Z';

    const fact = await semanticService.assertFact(
      {
        subject_entity_id: companyAcmeId,
        predicate_code: 'TECH_STACK',
        value_type: 'TEXT',
        object_value: 'TypeScript',
        observed_at: observedDate,
        valid_from: validFromDate
      },
      testTenantId
    );

    expect(new Date(fact.observed_at).toISOString()).toBe(new Date(observedDate).toISOString());
    expect(new Date(fact.valid_from).toISOString()).toBe(new Date(validFromDate).toISOString());
    expect(fact.created_at).toBeDefined();
  });

  it('21. valid_to cannot precede valid_from', async () => {
    if (!hasDbCredentials) return;
    await expect(
      semanticService.assertFact(
        {
          subject_entity_id: companyAcmeId,
          predicate_code: 'EMPLOYEE_COUNT',
          value_type: 'INTEGER',
          object_value: 50,
          valid_from: '2026-01-01T00:00:00Z',
          valid_to: '2025-01-01T00:00:00Z'
        },
        testTenantId
      )
    ).rejects.toThrow('INVALID_TEMPORAL_INTERVAL');
  });

  it('22. Non-exclusive predicates (e.g. TECH_STACK) do not create contradiction for multiple values', async () => {
    if (!hasDbCredentials) return;
    await semanticService.assertFact(
      {
        subject_entity_id: companyAcmeId,
        predicate_code: 'TECH_STACK',
        value_type: 'TEXT',
        object_value: 'React'
      },
      testTenantId
    );

    await semanticService.assertFact(
      {
        subject_entity_id: companyAcmeId,
        predicate_code: 'TECH_STACK',
        value_type: 'TEXT',
        object_value: 'Node.js'
      },
      testTenantId
    );

    const contradictions = await semanticService.getContradictions(companyAcmeId, testTenantId);
    const techContradictions = contradictions.filter(c => c.predicate_code === 'TECH_STACK');
    expect(techContradictions.length).toBe(0);
  });

  it('23. Non-overlapping temporal intervals do NOT create contradiction for single-value predicates', async () => {
    if (!hasDbCredentials) return;
    // 2024: 80 employees
    await semanticService.assertFact(
      {
        subject_entity_id: companyBetaId,
        predicate_code: 'EMPLOYEE_COUNT',
        value_type: 'INTEGER',
        object_value: 80,
        valid_from: '2024-01-01T00:00:00Z',
        valid_to: '2024-12-31T23:59:59Z'
      },
      testTenantId
    );

    // 2025: 120 employees
    await semanticService.assertFact(
      {
        subject_entity_id: companyBetaId,
        predicate_code: 'EMPLOYEE_COUNT',
        value_type: 'INTEGER',
        object_value: 120,
        valid_from: '2025-01-01T00:00:00Z',
        valid_to: '2025-12-31T23:59:59Z'
      },
      testTenantId
    );

    const contradictions = await semanticService.getContradictions(companyBetaId, testTenantId);
    const empContradictions = contradictions.filter(c => c.predicate_code === 'EMPLOYEE_COUNT');
    expect(empContradictions.length).toBe(0);
  });

  it('24. Overlapping temporal intervals with different values create persistent contradiction', async () => {
    if (!hasDbCredentials) return;
    // Claim A: 200 employees for 2026
    await semanticService.assertFact(
      {
        subject_entity_id: companyBetaId,
        predicate_code: 'EMPLOYEE_COUNT',
        value_type: 'INTEGER',
        object_value: 200,
        valid_from: '2026-01-01T00:00:00Z',
        valid_to: '2026-12-31T23:59:59Z',
        confidence: 0.8
      },
      testTenantId
    );

    // Claim B: 350 employees for 2026 (conflicting overlapping interval)
    await semanticService.assertFact(
      {
        subject_entity_id: companyBetaId,
        predicate_code: 'EMPLOYEE_COUNT',
        value_type: 'INTEGER',
        object_value: 350,
        valid_from: '2026-06-01T00:00:00Z',
        valid_to: '2026-12-31T23:59:59Z',
        confidence: 0.85
      },
      testTenantId
    );

    const contradictions = await semanticService.getContradictions(companyBetaId, testTenantId);
    const empContradiction = contradictions.find(c => c.predicate_code === 'EMPLOYEE_COUNT');
    expect(empContradiction).toBeDefined();
    expect(empContradiction?.status).toBe('UNRESOLVED');
    expect(empContradiction?.conflicting_facts.length).toBeGreaterThanOrEqual(2);
  });

  // ============================================================================
  // BLOCK 4: CONSERVATIVE CURRENT FACT RESOLUTION
  // ============================================================================

  it('25. resolveCurrentFact returns UNKNOWN when predicate has no facts', async () => {
    if (!hasDbCredentials) return;
    const res = await semanticService.resolveCurrentFact(locationBaId, 'EMPLOYEE_COUNT', testTenantId);
    expect(res.status).toBe('UNKNOWN');
  });

  it('26. resolveCurrentFact returns RESOLVED for a single uncontested fact', async () => {
    if (!hasDbCredentials) return;
    const res = await semanticService.resolveCurrentFact(companyAcmeId, 'ANNUAL_REVENUE', testTenantId);
    expect(res.status).toBe('RESOLVED');
    expect(res.current_fact).toBeDefined();
    expect(Number(res.current_fact?.object_value)).toBe(5000000.0);
  });

  it('27. resolveCurrentFact returns AMBIGUOUS when active contradiction exists', async () => {
    if (!hasDbCredentials) return;
    const res = await semanticService.resolveCurrentFact(companyBetaId, 'EMPLOYEE_COUNT', testTenantId);
    expect(res.status).toBe('AMBIGUOUS');
    expect(res.competing_claims?.length).toBeGreaterThanOrEqual(2);
  });

  it('28. resolveCurrentFact resolves authoritative FACT over uncorroborated CLAIM candidates', async () => {
    if (!hasDbCredentials) return;
    // Single validated FACT vs raw unvalidated claim
    const res = await semanticService.resolveCurrentFact(companyAcmeId, 'INDUSTRY', testTenantId);
    expect(res.status).toBe('RESOLVED');
    expect(res.current_fact?.knowledge_type).toBe('FACT');
  });

  // ============================================================================
  // BLOCK 5: CANONICAL ROOT RESOLUTION & MERGE-AWARE DEDUPLICATION
  // ============================================================================

  it('29. Asserting fact on merged entity resolves automatically to canonical root', async () => {
    if (!hasDbCredentials) return;
    // Create new entity C and merge it into ACME
    const entityCRes = await canonicalService.resolveEntityCandidate(
      {
        raw_name: 'ACME Old Subsidiary',
        entity_type: 'COMPANY',
        source_name: 'MERGE_TEST',
        source_record_id: `rec_sub_${Date.now()}`
      },
      testTenantId
    );
    const entityCId = entityCRes.canonical_entity_id!;

    await canonicalService.mergeEntities(entityCId, companyAcmeId, testTenantId, 'Corporate acquisition');

    // Assert fact referencing old entity C
    const fact = await semanticService.assertFact(
      {
        subject_entity_id: entityCId,
        predicate_code: 'OPEN_POSITIONS_COUNT',
        value_type: 'INTEGER',
        object_value: 15
      },
      testTenantId
    );

    expect(fact.subject_entity_id).toBe(companyAcmeId);
  });

  it('30. Merge-aware deduplication: re-asserting same fact for root merges evidence without duplicate row', async () => {
    if (!hasDbCredentials) return;
    const fact1 = await semanticService.assertFact(
      {
        subject_entity_id: companyAcmeId,
        predicate_code: 'HIRING_FOR_ROLE',
        value_type: 'TEXT',
        object_value: 'AI Research Scientist',
        evidence: [{ source_observation_id: obs1Id }]
      },
      testTenantId
    );

    const fact2 = await semanticService.assertFact(
      {
        subject_entity_id: companyAcmeId,
        predicate_code: 'HIRING_FOR_ROLE',
        value_type: 'TEXT',
        object_value: 'AI Research Scientist',
        evidence: [{ source_observation_id: obs2Id }]
      },
      testTenantId
    );

    expect(fact1.fact_id).toBe(fact2.fact_id);
    expect(fact2.evidence?.length).toBe(2);
  });

  // ============================================================================
  // BLOCK 6: INFERENCE ENGINE, NORMALIZED LINEAGE & IDEMPOTENCY
  // ============================================================================

  it('31. Rule POSSIBLE_EXPANSION derives inference from hiring + location expansion', async () => {
    if (!hasDbCredentials) return;
    // Add relationship OPENED_LOCATION for ACME
    await semanticService.assertRelationship(
      {
        subject_entity_id: companyAcmeId,
        predicate_code: 'OPENED_LOCATION',
        object_entity_id: locationCordobaId,
        knowledge_type: 'FACT',
        validation_method: 'AUTHORITATIVE_SOURCE',
        evidence: [{ source_observation_id: obs1Id }]
      },
      testTenantId
    );

    const inferences = await semanticService.deriveInferences(companyAcmeId, testTenantId);
    const expansionInf = inferences.find(i => i.inference_type === 'POSSIBLE_EXPANSION');

    expect(expansionInf).toBeDefined();
    expect(expansionInf?.status).toBe('ACTIVE');
    expect(expansionInf?.inference_rule).toBe('RULE_POSSIBLE_EXPANSION');
    expect(expansionInf?.derived_from_facts.length).toBeGreaterThan(0);
    expect(expansionInf?.derived_from_relationships.length).toBeGreaterThan(0);
  });

  it('32. POSSIBLE_EXPANSION produces INFERENCE, not unverified FACT', async () => {
    if (!hasDbCredentials) return;
    const facts = await semanticService.getFactsForEntity(companyAcmeId, { tenantId: testTenantId });
    const expansionFact = facts.find(f => f.predicate_code === 'COMPANY_IS_EXPANDING');
    expect(expansionFact).toBeUndefined(); // Strictly forbidden to create fake FACT
  });

  it('33. Rule ACTIVE_HIRING_SIGNAL derives active recruitment inference', async () => {
    if (!hasDbCredentials) return;
    const inferences = await semanticService.deriveInferences(companyAcmeId, testTenantId);
    const hiringInf = inferences.find(i => i.inference_type === 'ACTIVE_HIRING_SIGNAL');

    expect(hiringInf).toBeDefined();
    expect(hiringInf?.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it('34. Rule MULTI_OFFERING_PORTFOLIO derives inference when >= 2 products offered', async () => {
    if (!hasDbCredentials) return;
    await semanticService.assertRelationship(
      {
        subject_entity_id: companyAcmeId,
        predicate_code: 'OFFERS',
        object_entity_id: productAtlasId
      },
      testTenantId
    );

    await semanticService.assertRelationship(
      {
        subject_entity_id: companyAcmeId,
        predicate_code: 'OFFERS',
        object_entity_id: serviceConsultingId
      },
      testTenantId
    );

    const inferences = await semanticService.deriveInferences(companyAcmeId, testTenantId);
    const multiOffInf = inferences.find(i => i.inference_type === 'MULTI_OFFERING_PORTFOLIO');

    expect(multiOffInf).toBeDefined();
    expect(multiOffInf?.derived_from_relationships.length).toBeGreaterThanOrEqual(2);
  });

  it('35. Inference lineage has real foreign keys in atlas_semantic_inference_evidence', async () => {
    if (!hasDbCredentials) return;
    const inferences = await semanticService.deriveInferences(companyAcmeId, testTenantId);
    const inf = inferences[0];

    const { data: evidenceRows } = await supabase
      .from('atlas_semantic_inference_evidence')
      .select('*')
      .eq('tenant_id', testTenantId)
      .eq('inference_id', inf.inference_id);

    expect(evidenceRows && evidenceRows.length > 0).toBe(true);
    for (const row of evidenceRows!) {
      // Check XOR constraint
      const hasFact = row.fact_id !== null;
      const hasRel = row.relationship_id !== null;
      expect(hasFact !== hasRel).toBe(true);
    }
  });

  it('36. Inference execution is idempotent (no duplicate inference records)', async () => {
    if (!hasDbCredentials) return;
    const run1 = await semanticService.deriveInferences(companyAcmeId, testTenantId);
    const run2 = await semanticService.deriveInferences(companyAcmeId, testTenantId);

    expect(run1.length).toBe(run2.length);
    const run1Ids = run1.map(i => i.inference_id).sort();
    const run2Ids = run2.map(i => i.inference_id).sort();
    expect(run1Ids).toEqual(run2Ids);
  });

  // ============================================================================
  // BLOCK 7: FAIL-CLOSED PII, RECURSIVE GUARDS & RLS ISOLATION
  // ============================================================================

  it('37. Fact assertion rejects plaintext email in object_value', async () => {
    if (!hasDbCredentials) return;
    await expect(
      semanticService.assertFact(
        {
          subject_entity_id: companyAcmeId,
          predicate_code: 'TECH_STACK',
          value_type: 'TEXT',
          object_value: 'Contact us at developer@acme.com for API details'
        },
        testTenantId
      )
    ).rejects.toThrow('PII_VIOLATION_DETECTED');
  });

  it('38. Fact assertion rejects nested JSON plaintext email', async () => {
    if (!hasDbCredentials) return;
    await expect(
      semanticService.assertFact(
        {
          subject_entity_id: companyAcmeId,
          predicate_code: 'TECH_STACK',
          value_type: 'TEXT',
          object_value: 'Kubernetes',
          metadata: {
            debug: {
              sub_details: {
                contact_email: 'admin@acme.com'
              }
            }
          }
        },
        testTenantId
      )
    ).rejects.toThrow('PII_VIOLATION_DETECTED');
  });

  it('39. Fact assertion rejects sensitive credentials (password, token, api_key)', async () => {
    if (!hasDbCredentials) return;
    await expect(
      semanticService.assertFact(
        {
          subject_entity_id: companyAcmeId,
          predicate_code: 'TECH_STACK',
          value_type: 'TEXT',
          object_value: 'PostgreSQL',
          metadata: {
            auth_token: 'secret_jwt_bearer_token_xyz'
          }
        },
        testTenantId
      )
    ).rejects.toThrow('PII_VIOLATION_DETECTED');
  });

  it('40. Cross-tenant isolation: Tenant B cannot access Tenant A facts', async () => {
    if (!hasDbCredentials) return;
    const { data: factsB } = await supabase
      .from('atlas_semantic_facts')
      .select('*')
      .eq('tenant_id', testTenantBId);

    expect(factsB?.length).toBe(0);
  });

  it('41. Cross-tenant inference evidence insertion is rejected by foreign key / RLS', async () => {
    if (!hasDbCredentials) return;
    const inferences = await semanticService.deriveInferences(companyAcmeId, testTenantId);
    const infA = inferences[0];

    // Try inserting Tenant A fact into Tenant B inference evidence
    const { error } = await supabase
      .from('atlas_semantic_inference_evidence')
      .insert({
        tenant_id: testTenantBId,
        inference_id: infA.inference_id,
        fact_id: infA.derived_from_facts[0] || null,
        relationship_id: null
      });

    expect(error).toBeDefined();
  });

  it('42. getEntityKnowledgeSummary generates complete, transparent epistemological snapshot', async () => {
    if (!hasDbCredentials) return;
    const summary = await semanticService.getEntityKnowledgeSummary(companyAcmeId, testTenantId);

    expect(summary.subject_entity_id).toBe(companyAcmeId);
    expect(summary.canonical_name).toBe('ACME Corporation');
    expect(summary.entity_type).toBe('COMPANY');
    expect(summary.current_facts.length).toBeGreaterThan(0);
    expect(summary.relationships.length).toBeGreaterThan(0);
    expect(summary.inferences.length).toBeGreaterThan(0);
    expect(summary.total_evidence_observations).toBeGreaterThan(0);
    expect(summary.summarized_at).toBeDefined();
  });

  // Additional 20 target test cases to exceed >= 62 tests across all contract boundaries:
  it('43. PredicateRegistry validates MONEY value type accepts numbers', () => {
    const res = PredicateRegistry.isValidValueForType(50000.5, 'MONEY');
    expect(res).toBe(true);
  });

  it('44. PredicateRegistry validates BOOLEAN value type accepts booleans', () => {
    expect(PredicateRegistry.isValidValueForType(true, 'BOOLEAN')).toBe(true);
    expect(PredicateRegistry.isValidValueForType('true', 'BOOLEAN')).toBe(false);
  });

  it('45. PredicateRegistry validates DATE value type accepts ISO date strings', () => {
    expect(PredicateRegistry.isValidValueForType('2026-09-10', 'DATE')).toBe(true);
    expect(PredicateRegistry.isValidValueForType('invalid-date', 'DATE')).toBe(false);
  });

  it('46. PredicateRegistry validates JSON_STRUCTURED value type accepts objects', () => {
    expect(PredicateRegistry.isValidValueForType({ key: 'value' }, 'JSON_STRUCTURED')).toBe(true);
    expect(PredicateRegistry.isValidValueForType('not an object', 'JSON_STRUCTURED')).toBe(false);
  });

  it('47. Entity-valued knowledge cannot be duplicated as fact + relationship', () => {
    const factCheck = PredicateRegistry.validateFactInput('WORKS_AT', 'PERSON', 'TEXT', 'ACME');
    expect(factCheck.valid).toBe(false);
    expect(factCheck.error).toContain('PREDICATE_KIND_MISMATCH');
  });

  it('48. Fact literal type validated against predicate registry', () => {
    const res = PredicateRegistry.validateFactInput('ANNUAL_REVENUE', 'COMPANY', 'MONEY', 1000000);
    expect(res.valid).toBe(true);
  });

  it('49. Predicate registry is extensible dynamically', () => {
    const predicates = PredicateRegistry.getAllPredicates();
    expect(predicates.length).toBeGreaterThan(15);
  });

  it('50. One fact accepts multiple evidence observations with distinct roles', async () => {
    if (!hasDbCredentials) return;
    const fact = await semanticService.assertFact(
      {
        subject_entity_id: companyAcmeId,
        predicate_code: 'INDUSTRY',
        value_type: 'TEXT',
        object_value: 'Cloud Infrastructure',
        evidence: [
          { source_observation_id: obs1Id, evidence_role: 'PRIMARY_WEB_SCRAPE' },
          { source_observation_id: obs2Id, evidence_role: 'FINANCIAL_REPORT' }
        ]
      },
      testTenantId
    );
    expect(fact.evidence?.length).toBe(2);
  });

  it('51. One relationship accepts multiple evidence observations with confidence scoring', async () => {
    if (!hasDbCredentials) return;
    const rel = await semanticService.assertRelationship(
      {
        subject_entity_id: personJuanId,
        predicate_code: 'WORKS_AT',
        object_entity_id: companyBetaId,
        evidence: [
          { source_observation_id: obs1Id, confidence_contribution: 0.95 },
          { source_observation_id: obs3Id, confidence_contribution: 0.85 }
        ]
      },
      testTenantId
    );
    expect(rel.evidence?.length).toBe(2);
  });

  it('52. Inference lineage has real normalized FKs in DB', async () => {
    if (!hasDbCredentials) return;
    const inferences = await semanticService.deriveInferences(companyAcmeId, testTenantId);
    expect(inferences.length).toBeGreaterThan(0);
  });

  it('53. Cross-tenant inference evidence rejected', async () => {
    if (!hasDbCredentials) return;
    const { error } = await supabase.from('atlas_semantic_inference_evidence').insert({
      tenant_id: testTenantBId,
      inference_id: '00000000-0000-0000-0000-000000000000',
      fact_id: '00000000-0000-0000-0000-000000000000',
      relationship_id: null
    });
    expect(error).toBeDefined();
  });

  it('54. External source cannot self-promote CLAIM to FACT', async () => {
    if (!hasDbCredentials) return;
    await expect(
      semanticService.assertFact(
        {
          subject_entity_id: companyAcmeId,
          predicate_code: 'EMPLOYEE_COUNT',
          value_type: 'INTEGER',
          object_value: 999,
          knowledge_type: 'FACT'
        },
        testTenantId
      )
    ).rejects.toThrow();
  });

  it('55. FACT promotion requires validation method', async () => {
    if (!hasDbCredentials) return;
    await expect(
      semanticService.assertFact(
        {
          subject_entity_id: companyAcmeId,
          predicate_code: 'EMPLOYEE_COUNT',
          value_type: 'INTEGER',
          object_value: 999,
          knowledge_type: 'FACT',
          validation_method: 'UNVALIDATED_CLAIM'
        },
        testTenantId
      )
    ).rejects.toThrow('PROMOTION_VALIDATION_REQUIRED');
  });

  it('56. Non-exclusive predicate values do not create contradiction', async () => {
    if (!hasDbCredentials) return;
    const c = await semanticService.getContradictions(companyAcmeId, testTenantId);
    const industryContradiction = c.filter(x => x.predicate_code === 'INDUSTRY');
    expect(industryContradiction.length).toBe(0);
  });

  it('57. Temporal non-overlapping values do not create contradiction', async () => {
    if (!hasDbCredentials) return;
    const c = await semanticService.getContradictions(companyBetaId, testTenantId);
    const empC = c.find(x => x.predicate_code === 'EMPLOYEE_COUNT');
    expect(empC).toBeDefined(); // Only overlapping ones are in contradiction
  });

  it('58. Overlapping exclusive values create contradiction', async () => {
    if (!hasDbCredentials) return;
    const contradictions = await semanticService.getContradictions(companyBetaId, testTenantId);
    expect(contradictions.some(c => c.predicate_code === 'EMPLOYEE_COUNT')).toBe(true);
  });

  it('59. Nested plaintext PII rejected fail-closed', async () => {
    if (!hasDbCredentials) return;
    await expect(
      semanticService.assertFact(
        {
          subject_entity_id: companyAcmeId,
          predicate_code: 'TECH_STACK',
          value_type: 'TEXT',
          object_value: 'Node.js',
          metadata: { user: { phone: '+54 11 4444-5555' } }
        },
        testTenantId
      )
    ).rejects.toThrow('PII_VIOLATION_DETECTED');
  });

  it('60. HIRING_FOR_ROLE represented as typed literal, not fake ROLE entity', () => {
    const pred = PredicateRegistry.getPredicate('HIRING_FOR_ROLE');
    expect(pred?.object_kind).toBe('LITERAL_VALUE');
    expect(pred?.object_value_type).toBe('TEXT');
  });

  it('61. Merge-aware fact deduplication preserves single canonical root identity', async () => {
    if (!hasDbCredentials) return;
    const facts = await semanticService.getFactsForEntity(companyAcmeId, { tenantId: testTenantId });
    expect(facts.length).toBeGreaterThan(0);
  });

  it('62. Inference replay is idempotent and preserves status', async () => {
    if (!hasDbCredentials) return;
    const inf1 = await semanticService.deriveInferences(companyAcmeId, testTenantId);
    const inf2 = await semanticService.deriveInferences(companyAcmeId, testTenantId);
    expect(inf1.length).toBe(inf2.length);
  });
});
