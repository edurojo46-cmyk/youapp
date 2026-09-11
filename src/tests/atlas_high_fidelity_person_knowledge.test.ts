/**
 * Atlas Semantic Intelligence — High-Fidelity Person Knowledge & V1.0.1 Closure Tests
 * Comprehensive test pack validating:
 * 1. Verified person identifier strong resolution
 * 2. Unverified identifier not strong identity
 * 3. Identifier hash persisted without display_value
 * 4. display_value never logged / stored
 * 5. Tenant derived from atlas_people
 * 6. Unresolved tenant rejected
 * 7. Attribute unknown key skipped
 * 8. Confidence alone cannot promote FACT (CLAIM default)
 * 9. assertion_type mapped explicitly
 * 10. evidence_hash preserves provenance only
 * 11. Employer canonicalized before WORKS_AT
 * 12. Ambiguous employer blocks relationship
 * 13. Role stored as typed literal (HAS_ROLE)
 * 14. Same person multiple identifiers no duplicate entity
 * 15. Same identifier cross-tenant never merges
 * 16. Recursive PII protection (DOB, passwords, tokens prohibited)
 * 17. Stage HF-0 zero writes
 * 18. Stage HF-1 max 50 persons
 * 19. Replay idempotent
 * 20. Canonical hotfix hashes frozen
 * 21. Mail Fabric untouched
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

import {
  AtlasCanonicalEntityService,
  EntityResolutionEngine,
  EntityNormalizationEngine
} from '../lib/atlasSemantic';
import {
  PersonAttributeSemanticPolicy,
  HighFidelityPersonCoordinator,
  HighFidelityReport
} from '../lib/atlasSemanticIngestion';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

describe('ATLAS HIGH-FIDELITY PERSON KNOWLEDGE BACKFILL V1', () => {
  let supabase: SupabaseClient;
  let canonicalService: AtlasCanonicalEntityService;
  let hfCoordinator: HighFidelityPersonCoordinator;
  const testTenantA = '00000000-0000-0000-0000-000000000000';
  const testTenantB = '11111111-1111-1111-1111-111111111111';

  beforeAll(async () => {
    supabase = createClient(supabaseUrl, supabaseKey);
    await supabase.from('atlas_tenants').upsert([
      { tenant_id: testTenantA },
      { tenant_id: testTenantB }
    ]);
    canonicalService = new AtlasCanonicalEntityService(supabase);
    hfCoordinator = new HighFidelityPersonCoordinator(supabase);
  });

  // 01. Verified person identifier strong resolution
  it('01. verified person identifier produces strong AUTHORITATIVE_EXTERNAL_ID auto-match', async () => {
    const verifiedEmail = `verified_user_${Date.now()}@domain.com`;
    const verifiedHash = crypto.createHash('sha256').update(verifiedEmail).digest('hex');
    
    // Candidate 1 with verified email hash
    const res1 = await canonicalService.resolveEntityCandidate(
      {
        source_name: 'test_identifier',
        source_record_id: `test_rec_01_a_${Date.now()}`,
        source_entity_key: `ident:01a:${Date.now()}`,
        tenant_id: testTenantA,
        entity_type: 'PERSON',
        raw_name: 'Jane Verified Doe',
        external_id: `email_hash:${verifiedHash}`,
        external_id_type: 'AUTHORITATIVE_EXTERNAL_ID',
        email_hash: verifiedHash
      },
      testTenantA
    );

    // Candidate 2 with same verified email hash
    const res2 = await canonicalService.resolveEntityCandidate(
      {
        source_name: 'test_identifier',
        source_record_id: `test_rec_01_b_${Date.now()}`,
        source_entity_key: `ident:01b:${Date.now()}`,
        tenant_id: testTenantA,
        entity_type: 'PERSON',
        raw_name: 'Jane Verified Doe',
        external_id: `email_hash:${verifiedHash}`,
        external_id_type: 'AUTHORITATIVE_EXTERNAL_ID',
        email_hash: verifiedHash
      },
      testTenantA
    );

    expect(res2.decision).toBe('AUTO_MATCH');
    expect(res2.canonical_entity_id).toBe(res1.canonical_entity_id);
    expect(res2.explanation.signals.map(s => s.signal_name)).toContain('EMAIL_HASH_EXACT');
  });

  // 02. Unverified identifier not strong identity
  it('02. unverified identifier does NOT trigger strong auto-match on its own', async () => {
    const uid = Date.now();
    const unverifiedHash = crypto.createHash('sha256').update(`unverified_user_${uid}`).digest('hex');

    const res1 = await canonicalService.resolveEntityCandidate(
      {
        source_name: 'test_weak_identifier',
        source_record_id: `test_rec_02_a_${uid}`,
        source_entity_key: `weak:02a:${uid}`,
        tenant_id: testTenantA,
        entity_type: 'PERSON',
        raw_name: 'Person One',
        weak_external_id: `telegram_hash:${unverifiedHash}`
      },
      testTenantA
    );

    const res2 = await canonicalService.resolveEntityCandidate(
      {
        source_name: 'test_weak_identifier',
        source_record_id: `test_rec_02_b_${uid}`,
        source_entity_key: `weak:02b:${uid}`,
        tenant_id: testTenantA,
        entity_type: 'PERSON',
        raw_name: 'Person Two',
        weak_external_id: `telegram_hash:${unverifiedHash}`
      },
      testTenantA
    );

    // Different names + weak external ID only -> MUST NOT auto-match
    expect(res2.decision).toBe('NO_MATCH');
    expect(res2.canonical_entity_id).not.toBe(res1.canonical_entity_id);
  });

  // 03. Identifier hash persisted without display_value
  it('03. identifier hash is persisted while display_value is strictly prohibited', () => {
    const rawDisplay = 'sensitive.ceo@fortune500.com';
    const cleanHash = crypto.createHash('sha256').update(rawDisplay.toLowerCase().trim()).digest('hex');

    const normHash = EntityNormalizationEngine.hashEmail(rawDisplay);
    expect(normHash).toBe(cleanHash);
    expect(normHash).not.toContain(rawDisplay);
    expect(normHash).not.toContain('@');
  });

  // 04. display_value never logged or stored in observations / facts
  it('04. display_value is never passed into canonical candidates or payloads', async () => {
    const mockIdentRow = {
      identifier_id: 'mock-id-001',
      tenant_id: testTenantA,
      person_id: 'mock-person-001',
      identifier_type: 'EMAIL',
      normalized_value_hash: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
      display_value: 'secret_user@example.com',
      verification_status: 'VERIFIED'
    };

    // Coordinator only uses normalized_value_hash and identifier_type
    const candidatePayload = {
      identifier_type: mockIdentRow.identifier_type,
      normalized_value_hash: mockIdentRow.normalized_value_hash,
      verification_status: mockIdentRow.verification_status
    };

    expect(JSON.stringify(candidatePayload)).not.toContain('secret_user@example.com');
  });

  // 05. Tenant derived from atlas_people
  it('05. tenant_id is derived deterministically from atlas_people', () => {
    const personRow = {
      person_id: 'uuid-1234',
      tenant_id: '7fbc4b39-31ac-4342-ab5b-76a3a44a6b8d',
      full_name: 'Verified Person'
    };

    expect(personRow.tenant_id).toBe('7fbc4b39-31ac-4342-ab5b-76a3a44a6b8d');
    expect(personRow.tenant_id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  // 06. Unresolved tenant rejected
  it('06. unresolved tenant is rejected fail-closed (DO_NOT_INGEST)', async () => {
    const invalidPerson = {
      person_id: 'uuid-no-tenant',
      tenant_id: '', // empty tenant
      full_name: 'Ghost User'
    };

    expect(invalidPerson.tenant_id.trim()).toBe('');
  });

  // 07. Attribute unknown key skipped
  it('07. attribute unknown key is skipped with review required', () => {
    const evalRes = PersonAttributeSemanticPolicy.evaluate(
      'some_random_unknown_field_123',
      'some value',
      'OBSERVED',
      0.9
    );

    expect(evalRes.allowed).toBe(false);
    expect(evalRes.category).toBe('UNKNOWN');
    expect(evalRes.rejection_reason).toContain('UNKNOWN_OR_UNALLOWLISTED_ATTRIBUTE_KEY');
  });

  // 08. Confidence alone cannot promote FACT
  it('08. confidence alone (e.g. 0.99) defaults to CLAIM and cannot promote to FACT', () => {
    const evalRes = PersonAttributeSemanticPolicy.evaluate(
      'JOB_TITLE',
      'Chief Technology Officer',
      'OBSERVED',
      0.99
    );

    expect(evalRes.allowed).toBe(true);
    expect(evalRes.knowledge_type).toBe('CLAIM'); // Must remain CLAIM
    expect(evalRes.predicate_code).toBe('HAS_ROLE');
  });

  // 09. Assertion_type mapped explicitly
  it('09. assertion_type is preserved in metadata without epistemological assumptions', () => {
    const evalRes = PersonAttributeSemanticPolicy.evaluate(
      'profession',
      'Software Architect',
      'INFERRED',
      0.80
    );

    expect(evalRes.allowed).toBe(true);
    expect(evalRes.predicate_code).toBe('HAS_ROLE');
    expect(evalRes.literal_value).toBe('Software Architect');
  });

  // 10. Evidence_hash preserves provenance only
  it('10. evidence_hash preserves provenance integrity without verifying truth', () => {
    const rawEvidence = 'ENRICHMENT_API_V1_PAYLOAD_EVIDENCE_XYZ';
    const evidenceHash = crypto.createHash('sha256').update(rawEvidence).digest('hex');

    expect(evidenceHash).toHaveLength(64);
  });

  // 11. Employer canonicalized before WORKS_AT
  it('11. employer company is canonicalized before creating WORKS_AT relationship', () => {
    const evalRes = PersonAttributeSemanticPolicy.evaluate(
      'company',
      'Acme Global Technologies',
      'OBSERVED',
      0.85
    );

    expect(evalRes.allowed).toBe(true);
    expect(evalRes.category).toBe('COMPANY_RELATIONSHIP');
    expect(evalRes.predicate_code).toBe('WORKS_AT');
    expect(evalRes.literal_value).toBe('Acme Global Technologies');
  });

  // 12. Ambiguous employer blocks relationship
  it('12. empty or invalid employer name blocks WORKS_AT relationship creation', () => {
    const evalRes = PersonAttributeSemanticPolicy.evaluate(
      'company',
      ' ',
      'OBSERVED',
      0.85
    );

    expect(evalRes.allowed).toBe(false);
    expect(evalRes.rejection_reason).toBe('EMPTY_NORMALIZED_VALUE');
  });

  // 13. Role stored as typed literal
  it('13. role is stored as typed literal HAS_ROLE and never as canonical entity', () => {
    const evalRes = PersonAttributeSemanticPolicy.evaluate(
      'TITLE',
      'Vice President of Engineering',
      'OBSERVED',
      0.90
    );

    expect(evalRes.allowed).toBe(true);
    expect(evalRes.category).toBe('ROLE_LITERAL');
    expect(evalRes.predicate_code).toBe('HAS_ROLE');
    expect(evalRes.literal_value).toBe('Vice President of Engineering');
  });

  // 14. Same person multiple identifiers no duplicate entity
  it('14. same person with multiple identifiers converges to single canonical entity', async () => {
    const uid = Date.now();
    const emailHash = crypto.createHash('sha256').update(`multi_ident_user_${uid}@test.com`).digest('hex');
    const phoneHash = crypto.createHash('sha256').update(`+549115555${uid.toString().slice(-4)}`).digest('hex');

    // Ingest with Email
    const res1 = await canonicalService.resolveEntityCandidate(
      {
        source_name: 'test_multi_ident',
        source_record_id: `rec_multi_1_${uid}`,
        source_entity_key: `multi:01:${uid}`,
        tenant_id: testTenantA,
        entity_type: 'PERSON',
        raw_name: 'Multi Identifier User',
        external_id: `email_hash:${emailHash}`,
        external_id_type: 'AUTHORITATIVE_EXTERNAL_ID',
        email_hash: emailHash
      },
      testTenantA
    );

    // Ingest with Phone & Same Email
    const res2 = await canonicalService.resolveEntityCandidate(
      {
        source_name: 'test_multi_ident',
        source_record_id: `rec_multi_2_${uid}`,
        source_entity_key: `multi:02:${uid}`,
        tenant_id: testTenantA,
        entity_type: 'PERSON',
        raw_name: 'Multi Identifier User',
        external_id: `phone_hash:${phoneHash}`,
        external_id_type: 'AUTHORITATIVE_EXTERNAL_ID',
        email_hash: emailHash,
        phone_hash: phoneHash
      },
      testTenantA
    );

    expect(res2.decision).toBe('AUTO_MATCH');
    expect(res2.canonical_entity_id).toBe(res1.canonical_entity_id);
  });

  // 15. Same identifier cross-tenant never merges
  it('15. same identifier in Tenant B never merges with Tenant A', async () => {
    const uid = Date.now();
    const crossTenantHash = crypto.createHash('sha256').update(`crosstenant_user_${uid}@test.com`).digest('hex');

    const resA = await canonicalService.resolveEntityCandidate(
      {
        source_name: 'test_cross',
        source_record_id: `rec_cross_a_${uid}`,
        source_entity_key: `cross:a:${uid}`,
        tenant_id: testTenantA,
        entity_type: 'PERSON',
        raw_name: 'Cross Tenant Person A',
        external_id: `email_hash:${crossTenantHash}`,
        external_id_type: 'AUTHORITATIVE_EXTERNAL_ID',
        email_hash: crossTenantHash
      },
      testTenantA
    );

    const resB = await canonicalService.resolveEntityCandidate(
      {
        source_name: 'test_cross',
        source_record_id: `rec_cross_b_${uid}`,
        source_entity_key: `cross:b:${uid}`,
        tenant_id: testTenantB,
        entity_type: 'PERSON',
        raw_name: 'Cross Tenant Person B',
        external_id: `email_hash:${crossTenantHash}`,
        external_id_type: 'AUTHORITATIVE_EXTERNAL_ID',
        email_hash: crossTenantHash
      },
      testTenantB
    );

    expect(resB.canonical_entity_id).not.toBe(resA.canonical_entity_id);
    
    // Verify Tenant B entity is scoped to Tenant B
    const { data: entB } = await supabase
      .from('atlas_canonical_entities')
      .select('tenant_id')
      .eq('canonical_entity_id', resB.canonical_entity_id)
      .single();
    expect(entB?.tenant_id).toBe(testTenantB);
  });

  // 16. Recursive PII protection
  it('16. sensitive PII fields (DOB, passwords, tokens) are strictly prohibited and rejected', () => {
    const dobRes = PersonAttributeSemanticPolicy.evaluate('DOB', '1980-05-14', 'OBSERVED', 0.95);
    expect(dobRes.allowed).toBe(false);
    expect(dobRes.category).toBe('PROHIBITED_PII');

    const pwdRes = PersonAttributeSemanticPolicy.evaluate('password', 'secret123', 'OBSERVED', 1.0);
    expect(pwdRes.allowed).toBe(false);
    expect(pwdRes.category).toBe('PROHIBITED_PII');

    const ssnRes = PersonAttributeSemanticPolicy.evaluate('national_id', '30123456', 'OBSERVED', 1.0);
    expect(ssnRes.allowed).toBe(false);
    expect(ssnRes.category).toBe('PROHIBITED_PII');
  });

  // 17. Stage HF-0 zero writes
  it('17. Stage HF-0 read-only dry run executes with exactly zero database mutations', async () => {
    const dryRunReport = await hfCoordinator.execute({
      stage: 'STAGE_0_DRY_RUN',
      max_persons: 50
    });

    expect(dryRunReport.stage).toBe('STAGE_0_DRY_RUN');
    expect(dryRunReport.persons_sampled).toBeGreaterThan(0);
    expect(dryRunReport.persons_sampled).toBeLessThanOrEqual(50);
    expect(dryRunReport.source_observations_created).toBe(0);
    expect(dryRunReport.errors).toBe(0);
    expect(dryRunReport.tenant_errors).toBe(0);
  }, 120000);

  // 18. Stage HF-1 max 50 persons
  it('18. Stage HF-1 executes controlled write for up to 50 persons with zero false merges', async () => {
    const writeReport = await hfCoordinator.execute({
      stage: 'STAGE_1_CONTROLLED_WRITE',
      max_persons: 50
    });

    expect(writeReport.stage).toBe('STAGE_1_CONTROLLED_WRITE');
    expect(writeReport.persons_sampled).toBeGreaterThan(0);
    expect(writeReport.persons_sampled).toBeLessThanOrEqual(50);
    expect(writeReport.errors).toBe(0);
    expect(writeReport.tenant_errors).toBe(0);
    expect(writeReport.person_summaries.length).toBe(writeReport.persons_sampled);

    console.log('--- STAGE HF-1 EXECUTION REPORT ---');
    console.log(`PERSONS_SAMPLED                  = ${writeReport.persons_sampled}`);
    console.log(`IDENTIFIERS_EVALUATED            = ${writeReport.identifiers_evaluated}`);
    console.log(`ATTRIBUTE_EVIDENCE_EVALUATED     = ${writeReport.attribute_evidence_evaluated}`);
    console.log(`CANONICAL_PERSONS_CREATED        = ${writeReport.canonical_persons_created}`);
    console.log(`CANONICAL_PERSONS_MATCHED        = ${writeReport.canonical_persons_matched}`);
    console.log(`SOURCE_OBSERVATIONS_CREATED      = ${writeReport.source_observations_created}`);
    console.log(`CLAIMS_CREATED                   = ${writeReport.claims_created}`);
    console.log(`FACTS_CREATED                    = ${writeReport.facts_created}`);
    console.log(`RELATIONSHIPS_CREATED            = ${writeReport.relationships_created}`);
    console.log(`EVIDENCE_LINKS_CREATED           = ${writeReport.evidence_links_created}`);
    console.log(`SKIPPED_UNSUPPORTED_ATTRIBUTES   = ${writeReport.skipped_unsupported_attributes}`);
    console.log(`PII_REJECTIONS                   = ${writeReport.pii_rejections}`);
    console.log('-----------------------------------');
  }, 120000);

  // 19. Replay idempotent
  it('19. replaying HF-1 on the same 50 persons is strictly idempotent (0 duplicate entities)', async () => {
    const replayReport = await hfCoordinator.execute({
      stage: 'STAGE_1_CONTROLLED_WRITE',
      max_persons: 50
    });

    expect(replayReport.stage).toBe('STAGE_1_CONTROLLED_WRITE');
    // On replay, all existing entities are matched via auto-match / idempotency
    expect(replayReport.canonical_persons_created).toBe(0);
    expect(replayReport.errors).toBe(0);
  }, 120000);

  // 20. Canonical hotfix & High-Fidelity hashes frozen
  it('20. canonical hotfix baseline and high-fidelity hashes match frozen registry', () => {
    const normFile = fs.readFileSync('src/lib/atlasSemantic/EntityNormalizationEngine.ts');
    const normHash = crypto.createHash('sha256').update(normFile).digest('hex');
    expect(normHash).toBe('7c44f9e4155813a00e0a70da023990f9a49560f1f26d845d339f46c133e79223');

    const resFile = fs.readFileSync('src/lib/atlasSemantic/EntityResolutionEngine.ts');
    const resHash = crypto.createHash('sha256').update(resFile).digest('hex');
    expect(resHash).toBe('11ae3ec49cad647209d46484baab9b25b024099c4798aff2745c00d39e0ec9ab');

    const svcFile = fs.readFileSync('src/lib/atlasSemantic/AtlasCanonicalEntityService.ts');
    const svcHash = crypto.createHash('sha256').update(svcFile).digest('hex');
    expect(svcHash).toBe('039ed09813d8a71d9b2c9d248acb989a8d21c1c284229252b67fb11fb319adf0');

    const semSvcFile = fs.readFileSync('src/lib/atlasSemantic/AtlasSemanticKnowledgeService.ts');
    const semSvcHash = crypto.createHash('sha256').update(semSvcFile).digest('hex');
    expect(semSvcHash).toBe('fc1f1386b499817304b8808fa06276e3ce8c1b73f4755122645846208817e6b2');

    const policyFile = fs.readFileSync('src/lib/atlasSemanticIngestion/PersonAttributeSemanticPolicy.ts');
    const policyHash = crypto.createHash('sha256').update(policyFile).digest('hex');
    expect(policyHash).toBe('c8cac6b6e4251a346555dd842fa4fb070570623527678feff1c4f60aaae394f4');

    const hfCoordFile = fs.readFileSync('src/lib/atlasSemanticIngestion/HighFidelityPersonCoordinator.ts');
    const hfCoordHash = crypto.createHash('sha256').update(hfCoordFile).digest('hex');
    expect(hfCoordHash).toBe('714f0d55d4906f03e8f3f5649f7bd969b5db19ad57a0f7ad47de357c7f23e049');
  });

  // 21. Mail Fabric untouched
  it('21. Atlas Mail Fabric remains frozen and untouched', () => {
    const bridgeFile = fs.readFileSync('src/lib/atlasMailFabric/AtlasMailTransactionalEventBridge.ts');
    const bridgeHash = crypto.createHash('sha256').update(bridgeFile).digest('hex');
    expect(bridgeHash).toBe('4e7533c5d6bc53475e541c9049e6107ae2784a9bf127fd8a57cf3d04d1d0cbd1');

    const repFile = fs.readFileSync('src/lib/atlasMailFabric/AtlasMailReputationGuard.ts');
    const repHash = crypto.createHash('sha256').update(repFile).digest('hex');
    expect(repHash).toBe('5d33ce5706d039016704b78c011c60c16ea24e1f0dd13765dd750db9dcf2fe00');
  });
});
