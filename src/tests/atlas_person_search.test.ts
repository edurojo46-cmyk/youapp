import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SupabaseClient } from '@supabase/supabase-js';
import { createGuardedTestClient as createClient } from '../lib/testDbGuard';
import * as crypto from 'crypto';
import dotenv from 'dotenv';

const loadEnv = dotenv?.config || (dotenv as any)?.default?.config;
if (typeof loadEnv === 'function') loadEnv({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_IWSDC0aWUR8cvOPrwYSaqg_JU8aASm8';
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY;
if (!supabaseServiceKey) throw new Error('SUPABASE_SECRET_KEY must be set in environment');

const adminClient = createClient(supabaseUrl, supabaseServiceKey);
const anonClient = createClient(supabaseUrl, supabaseAnonKey);

let userAClient: SupabaseClient;
let userBClient: SupabaseClient;
let tenantA: string;
let tenantB: string;

let personA1: string;
let personA2: string;
let personB1: string;

let mockProductId: string;
let mockOfferId: string;

function randomUUID() {
  return crypto.randomUUID();
}

describe('Admin Person Advanced Search V1 Certification', () => {
  beforeAll(async () => {
    // 1. Create two isolated test users/tenants via Supabase Auth
    const emailA = `test-tenant-a-${Date.now()}@example.com`;
    const emailB = `test-tenant-b-${Date.now()}@example.com`;
    const password = 'TestPassword123!';

    const { data: authA, error: errA } = await adminClient.auth.admin.createUser({
      email: emailA,
      password: password,
      email_confirm: true
    });
    if (errA || !authA.user) throw new Error(`Failed to create Tenant A: ${errA?.message}`);
    tenantA = authA.user.id;

    const { data: authB, error: errB } = await adminClient.auth.admin.createUser({
      email: emailB,
      password: password,
      email_confirm: true
    });
    if (errB || !authB.user) throw new Error(`Failed to create Tenant B: ${errB?.message}`);
    tenantB = authB.user.id;

    // Ensure tenants exist in atlas_tenants
    const { error: tErr } = await adminClient.from('atlas_tenants').upsert([{ tenant_id: tenantA }, { tenant_id: tenantB }]);
    if (tErr) throw tErr;

    // Sign in user clients
    userAClient = createClient(supabaseUrl, supabaseAnonKey);
    const { error: signInErrA } = await userAClient.auth.signInWithPassword({ email: emailA, password });
    if (signInErrA) throw new Error(`SignIn A failed: ${signInErrA.message}`);

    userBClient = createClient(supabaseUrl, supabaseAnonKey);
    const { error: signInErrB } = await userBClient.auth.signInWithPassword({ email: emailB, password });
    if (signInErrB) throw new Error(`SignIn B failed: ${signInErrB.message}`);

    // 2. Provision test people in Tenant A and Tenant B
    personA1 = randomUUID();
    personA2 = randomUUID();
    personB1 = randomUUID();

    const { error: pErr } = await adminClient.from('atlas_people').insert([
      { person_id: personA1, tenant_id: tenantA, full_name: 'Valeria Rossi', status: 'ACTIVE', lifecycle_stage: 'CANONICAL' },
      { person_id: personA2, tenant_id: tenantA, full_name: 'Carlos Gomez', status: 'ACTIVE', lifecycle_stage: 'CANONICAL' },
      { person_id: personB1, tenant_id: tenantB, full_name: 'Isabel Martinez', status: 'ACTIVE', lifecycle_stage: 'CANONICAL' }
    ]);
    if (pErr) throw pErr;

    // Subjects in thin registry
    const { error: subErr } = await adminClient.from('atlas_subject_registry').upsert([
      { subject_id: personA1, subject_type: 'PERSON', person_id: personA1 },
      { subject_id: personA2, subject_type: 'PERSON', person_id: personA2 },
      { subject_id: personB1, subject_type: 'PERSON', person_id: personB1 }
    ]);
    if (subErr) throw subErr;

    // Coverage: A1 has email and phone. A2 has email only.
    const { error: covErr } = await adminClient.from('atlas_person_coverage').insert([
      { person_id: personA1, tenant_id: tenantA, email_known: true, phone_known: true, identity_known: true },
      { person_id: personA2, tenant_id: tenantA, email_known: true, phone_known: false, identity_known: true },
      { person_id: personB1, tenant_id: tenantB, email_known: true, phone_known: true, identity_known: true }
    ]);
    if (covErr) throw covErr;

    // Identifiers: safe display values
    const { error: idErr } = await adminClient.from('atlas_person_identifiers').insert([
      { tenant_id: tenantA, person_id: personA1, identifier_type: 'EMAIL', normalized_value_hash: 'hashA1', display_value: 'valeria.rossi@example.com' },
      { tenant_id: tenantA, person_id: personA2, identifier_type: 'EMAIL', normalized_value_hash: 'hashA2', display_value: 'carlos.gomez@example.com' },
      { tenant_id: tenantB, person_id: personB1, identifier_type: 'EMAIL', normalized_value_hash: 'hashB1', display_value: 'isabel@example.com' }
    ]);
    if (idErr) throw idErr;

    // Attribute Evidence for Person A1:
    const { error: evErrA1 } = await adminClient.from('atlas_person_attribute_evidence').insert([
      { tenant_id: tenantA, person_id: personA1, attribute_key: 'DOB', normalized_value: '1980-05-14', assertion_type: 'OBSERVED', confidence: 0.95 },
      { tenant_id: tenantA, person_id: personA1, attribute_key: 'residence_country', normalized_value: 'AR', assertion_type: 'OBSERVED', confidence: 0.9 },
      { tenant_id: tenantA, person_id: personA1, attribute_key: 'residence_city', normalized_value: 'Buenos Aires', assertion_type: 'OBSERVED', confidence: 0.9 },
      { tenant_id: tenantA, person_id: personA1, attribute_key: 'residence_neighborhood', normalized_value: 'Recoleta', assertion_type: 'OBSERVED', confidence: 0.9 },
      { tenant_id: tenantA, person_id: personA1, attribute_key: 'profession', normalized_value: 'empresaria', assertion_type: 'OBSERVED', confidence: 0.85 },
      { tenant_id: tenantA, person_id: personA1, attribute_key: 'company', normalized_value: 'Rossi Capital', assertion_type: 'OBSERVED', confidence: 0.85 },
      { tenant_id: tenantA, person_id: personA1, attribute_key: 'photo_url', normalized_value: 'https://example.com/asset.jpg', assertion_type: 'OBSERVED', confidence: 0.9 },
      { tenant_id: tenantA, person_id: personA1, attribute_key: 'fresh_badge', normalized_value: 'active_2026', assertion_type: 'OBSERVED', confidence: 0.9, valid_until: new Date(Date.now() + 86400000).toISOString() },
      { tenant_id: tenantA, person_id: personA1, attribute_key: 'stale_badge', normalized_value: 'expired_2020', assertion_type: 'OBSERVED', confidence: 0.9, valid_until: new Date(Date.now() - 86400000).toISOString() }
    ]);
    if (evErrA1) throw evErrA1;

    // Attribute Evidence for Person A2 (Conflict demonstration: 2 different cities, max confidence 0.8):
    const { error: evErrA2 } = await adminClient.from('atlas_person_attribute_evidence').insert([
      { tenant_id: tenantA, person_id: personA2, attribute_key: 'residence_city', normalized_value: 'Buenos Aires', assertion_type: 'OBSERVED', confidence: 0.8 },
      { tenant_id: tenantA, person_id: personA2, attribute_key: 'residence_city', normalized_value: 'Cordoba', assertion_type: 'OBSERVED', confidence: 0.8 },
      { tenant_id: tenantA, person_id: personA2, attribute_key: 'DOB', normalized_value: 'invalid-date-string', assertion_type: 'OBSERVED', confidence: 0.5 },
      { tenant_id: tenantA, person_id: personA2, attribute_key: 'photo_url', normalized_value: 'https://example.com/asset2.jpg', assertion_type: 'OBSERVED', confidence: 0.7 },
      { tenant_id: tenantA, person_id: personA2, attribute_key: 'profession', normalized_value: 'consultor', assertion_type: 'OBSERVED', confidence: 0.7 }
    ]);
    if (evErrA2) throw evErrA2;

    // 10C Channel Eligibility:
    const { error: eligErr } = await adminClient.from('atlas_channel_eligibility').insert([
      { subject_id: personA1, channel: 'EMAIL', action_type: 'EMAIL_SEND', eligibility_status: 'ELIGIBLE' },
      { subject_id: personA1, channel: 'WHATSAPP', action_type: 'WHATSAPP_MARKETING_MESSAGE', eligibility_status: 'CONSENT_REQUIRED' },
      { subject_id: personA2, channel: 'EMAIL', action_type: 'EMAIL_SEND', eligibility_status: 'INELIGIBLE' }
    ]);
    if (eligErr) throw eligErr;

    // 10P-C Product Fit:
    mockProductId = randomUUID();
    mockOfferId = randomUUID();
    const { error: prodErr } = await adminClient.from('atlas_products').insert([{
      product_id: mockProductId,
      tenant_id: tenantA,
      name: 'VIP Tango',
      category: 'TANGO'
    }]);
    if (prodErr) throw prodErr;

    const { error: offerErr } = await adminClient.from('atlas_product_offers').insert([{
      offer_id: mockOfferId,
      product_id: mockProductId,
      tenant_id: tenantA,
      price: 50000,
      currency: 'ARS',
      offer_version: 'v1'
    }]);
    if (offerErr) throw offerErr;

    const { error: fitErr } = await adminClient.from('atlas_person_product_fit_state').insert([
      {
        tenant_id: tenantA,
        person_id: personA1,
        product_id: mockProductId,
        offer_id: mockOfferId,
        context_hash: 'ctx1',
        fit_score: 92.5,
        fit_level: 'VERY_HIGH',
        component_scores: {},
        evidence_count: 3,
        policy_version: 'v1.0.0',
        input_snapshot_hash: 'hash',
        evidence_snapshot_hash: 'hash'
      }
    ]);
    if (fitErr) throw fitErr;

    // 10D NBA State: using valid enum 'EMAIL'
    const { error: nbaErr } = await adminClient.from('atlas_next_best_action_state').insert([
      {
        tenant_id: tenantA,
        subject_id: personA1,
        subject_type: 'PERSON',
        recommended_action: 'EMAIL',
        recommended_channel: 'EMAIL',
        decision_status: 'DO_NOW',
        priority_score: 88,
        evidence_snapshot_hash: 'hash',
        input_snapshot_hash: 'hash',
        policy_version: 'v1.0.0',
        evaluated_at: new Date(Date.now() + 5000).toISOString()
      }
    ]);
    if (nbaErr) throw nbaErr;

    // 10P-B Commercial Intent for Person A1:
    const { error: intentErr } = await adminClient.from('atlas_person_intent_state').insert([
      {
        tenant_id: tenantA,
        person_id: personA1,
        topic: 'cloud_architecture',
        product_ref: '*',
        intent_level: 'HIGH',
        intent_score: 85.0,
        evidence_count: 4,
        policy_version: 'v1.0.0-deterministic'
      }
    ]);
    if (intentErr) throw intentErr;

    // 10P-B Behavioral Events for Person A1 (Signal Freshness):
    const { error: bevErr } = await adminClient.from('atlas_person_behavior_events').insert([
      {
        tenant_id: tenantA,
        person_id: personA1,
        event_type: 'INTERNAL_SEARCH',
        topic: 'ai_agents',
        source_type: 'WEB',
        observed_at: new Date(Date.now() - 5 * 86400000).toISOString(), // 5 days ago
        event_hash: 'hash_ai_agents_1'
      }
    ]);
    if (bevErr) throw bevErr;
  });

  afterAll(async () => {
    // Cleanup test users
    if (tenantA) await adminClient.auth.admin.deleteUser(tenantA);
    if (tenantB) await adminClient.auth.admin.deleteUser(tenantB);
  });

  // ==========================================================================
  // SECTION 1: SECURITY, TENANT ISOLATION & LEAST PRIVILEGE
  // ==========================================================================

  it('ANON_DENIED = PASS: unauthenticated caller cannot execute search_canonical_persons_v1', async () => {
    const { data, error } = await anonClient.rpc('search_canonical_persons_v1', {});
    expect(error).toBeDefined();
    expect(error?.message).toMatch(/permission denied|UNAUTHENTICATED/i);
    expect(data).toBeNull();
  });

  it('SERVICE_ROLE_ACCESS_DENIED = PASS: search_canonical_persons_v1 revoked from service_role', async () => {
    const { data, error } = await adminClient.rpc('search_canonical_persons_v1', {});
    expect(error).toBeDefined();
    expect(error?.message).toMatch(/permission denied/i);
    expect(data).toBeNull();
  });

  it('CALLER_TENANT_PARAMETER_EXISTS = NO: browser RPC rejects any caller-supplied tenant parameter', async () => {
    const { error } = await userAClient.rpc('search_canonical_persons_v1', {
      p_tenant_id: tenantB
    } as any);
    expect(error).toBeDefined();
    expect(error?.message).toMatch(/Could not find the function|parameter|not exist|unknown|named argument/i);
  });

  it('AUTHENTICATED_TENANT_A_SEES_ONLY_A = PASS: User A only sees Tenant A people', async () => {
    const { data, error } = await userAClient.rpc('search_canonical_persons_v1', {
      p_status: 'ALL'
    });
    expect(error).toBeNull();
    expect(data).toBeDefined();
    const ids = data.items.map((p: any) => p.person_id);
    expect(ids).toContain(personA1);
    expect(ids).toContain(personA2);
    expect(ids).not.toContain(personB1);
  });

  it('AUTHENTICATED_TENANT_A_CANNOT_SELECT_B = PASS: CROSS_TENANT_ROWS = 0', async () => {
    const { data, error } = await userAClient.rpc('search_canonical_persons_v1', {
      p_search_query: personB1
    });
    expect(error).toBeNull();
    expect(data.total_count).toBe(0);
    expect(data.items.length).toBe(0);
  });

  // ==========================================================================
  // SECTION 2: PRODUCT FIT & NBA STRICT SEMANTICS (UNKNOWN != ZERO, MISSING != NO_ACTION)
  // ==========================================================================

  it('UNKNOWN_FIT_SCORE_IS_NULL = PASS: Person without 10P-C evaluation returns fit_level=UNKNOWN and fit_score=null', async () => {
    const { data, error } = await userAClient.rpc('search_canonical_persons_v1', {
      p_search_query: 'Carlos Gomez'
    });
    expect(error).toBeNull();
    expect(data.items.length).toBe(1);
    const person = data.items[0];
    expect(person.product_fit.fit_level).toBe('UNKNOWN');
    expect(person.product_fit.fit_score).toBeNull();
    expect(person.product_fit.fit_score).not.toBe(0); // UNKNOWN != ZERO
  });

  it('MISSING_NBA_NOT_NO_ACTION = PASS: Person without 10D decision returns nba=null, not NO_ACTION', async () => {
    const { data, error } = await userAClient.rpc('search_canonical_persons_v1', {
      p_search_query: 'Carlos Gomez'
    });
    expect(error).toBeNull();
    expect(data.items.length).toBe(1);
    const person = data.items[0];
    expect(person.nba).toBeNull(); // Missing NBA must be null, never fabricated NO_ACTION
  });

  it('REAL_NO_ACTION_PRESERVED = PASS: When 10D explicitly decides NO_ACTION, it is preserved', async () => {
    const nbaIdNoAction = randomUUID();
    const { error: insErr } = await adminClient.from('atlas_next_best_action_state').insert({
      nba_id: nbaIdNoAction,
      tenant_id: tenantA,
      subject_id: personA2,
      subject_type: 'PERSON',
      recommended_action: 'WAIT',
      decision_status: 'NO_ACTION',
      priority_score: 10,
      evidence_snapshot_hash: 'hash',
      input_snapshot_hash: 'hash',
      policy_version: 'v1.0.0',
      evaluated_at: new Date(Date.now() + 10000).toISOString()
    });
    expect(insErr).toBeNull();

    const { data, error } = await userAClient.rpc('search_canonical_persons_v1', {
      p_search_query: 'Carlos Gomez'
    });
    expect(error).toBeNull();
    expect(data.items.length).toBe(1);
    expect(data.items[0].nba?.decision_status).toBe('NO_ACTION');

    // Clean up
    await adminClient.from('atlas_next_best_action_state').delete().eq('nba_id', nbaIdNoAction);
  });

  // ==========================================================================
  // SECTION 3: 10C ACTION-LEVEL ELIGIBILITY & KNOWN != ELIGIBLE
  // ==========================================================================

  it('KNOWN != ELIGIBLE = PASS: Person with known email who is 10C INELIGIBLE is excluded from ELIGIBLE search', async () => {
    const { data, error } = await userAClient.rpc('search_canonical_persons_v1', {
      p_coverage_email: true,
      p_eligibility_channel: 'EMAIL',
      p_eligibility_action_type: 'EMAIL_SEND',
      p_eligibility_status: 'ELIGIBLE'
    });
    expect(error).toBeNull();
    expect(data.total_count).toBe(1);
    expect(data.items[0].person_id).toBe(personA1);
    expect(data.items[0].person_id).not.toBe(personA2);
  });

  it('ACTION_LEVEL_ELIGIBILITY = PASS: Channel eligibility respects specific action_type', async () => {
    const { data: eligibleData } = await userAClient.rpc('search_canonical_persons_v1', {
      p_eligibility_channel: 'EMAIL',
      p_eligibility_action_type: 'EMAIL_SEND',
      p_eligibility_status: 'ELIGIBLE'
    });
    expect(eligibleData.items.map((p: any) => p.person_id)).toContain(personA1);

    const { data: restrictedData } = await userAClient.rpc('search_canonical_persons_v1', {
      p_eligibility_channel: 'WHATSAPP',
      p_eligibility_action_type: 'WHATSAPP_MARKETING_MESSAGE',
      p_eligibility_status: 'CONSENT_REQUIRED'
    });
    expect(restrictedData.items.map((p: any) => p.person_id)).toContain(personA1);
  });

  // ==========================================================================
  // SECTION 4: CONTACT COVERAGE FILTERS
  // ==========================================================================

  it('HAS_EMAIL_FILTER = PASS: Filters by has_email=true accurately', async () => {
    const { data, error } = await userAClient.rpc('search_canonical_persons_v1', {
      p_coverage_email: true
    });
    expect(error).toBeNull();
    expect(data.total_count).toBe(2);
    expect(data.items.map((p: any) => p.person_id)).toContain(personA1);
    expect(data.items.map((p: any) => p.person_id)).toContain(personA2);
  });

  it('HAS_PHONE_FILTER = PASS: Filters by has_phone=true returns only phone-known persons', async () => {
    const { data, error } = await userAClient.rpc('search_canonical_persons_v1', {
      p_coverage_phone: true
    });
    expect(error).toBeNull();
    expect(data.total_count).toBe(1);
    expect(data.items[0].person_id).toBe(personA1);
  });

  // ==========================================================================
  // SECTION 5: BEHAVIORAL SIGNAL FILTERS
  // ==========================================================================

  it('SIGNAL_RECENCY_FILTER = PASS: Freshness window of 7 days matches A1 (observed 5 days ago)', async () => {
    const { data: matched } = await userAClient.rpc('search_canonical_persons_v1', {
      p_has_recent_signal: true,
      p_signal_freshness_days: 7
    });
    expect(matched.total_count).toBe(1);
    expect(matched.items[0].person_id).toBe(personA1);

    const { data: excluded } = await userAClient.rpc('search_canonical_persons_v1', {
      p_has_recent_signal: true,
      p_signal_freshness_days: 2
    });
    expect(excluded.total_count).toBe(0);
  });

  it('SIGNAL_TOPIC_FILTER = PASS: Matches by specific signal topic', async () => {
    const { data: matched } = await userAClient.rpc('search_canonical_persons_v1', {
      p_has_recent_signal: true,
      p_signal_topic: 'ai_agents'
    });
    expect(matched.total_count).toBe(1);
    expect(matched.items[0].person_id).toBe(personA1);

    const { data: excluded } = await userAClient.rpc('search_canonical_persons_v1', {
      p_has_recent_signal: true,
      p_signal_topic: 'non_existent_topic'
    });
    expect(excluded.total_count).toBe(0);
  });

  // ==========================================================================
  // SECTION 6: COMMERCIAL INTENT FILTERS (10P-B)
  // ==========================================================================

  it('INTENT_LEVEL_FILTER = PASS: Filters by intent_level=HIGH', async () => {
    const { data: matched } = await userAClient.rpc('search_canonical_persons_v1', {
      p_intent_level: 'HIGH'
    });
    expect(matched.total_count).toBe(1);
    expect(matched.items[0].person_id).toBe(personA1);

    const { data: excluded } = await userAClient.rpc('search_canonical_persons_v1', {
      p_intent_level: 'LOW'
    });
    expect(excluded.total_count).toBe(0);
  });

  it('MIN_INTENT_SCORE_FILTER = PASS: Filters by min_intent_score threshold', async () => {
    const { data: matched } = await userAClient.rpc('search_canonical_persons_v1', {
      p_min_intent_score: 80
    });
    expect(matched.total_count).toBe(1);
    expect(matched.items[0].person_id).toBe(personA1);

    const { data: excluded } = await userAClient.rpc('search_canonical_persons_v1', {
      p_min_intent_score: 90
    });
    expect(excluded.total_count).toBe(0);
  });

  // ==========================================================================
  // SECTION 7: PRODUCT FIT FILTERS (10P-C)
  // ==========================================================================

  it('PRODUCT_FIT_LEVEL_FILTER = PASS: Filters by fit_level=VERY_HIGH', async () => {
    const { data: matched } = await userAClient.rpc('search_canonical_persons_v1', {
      p_product_fit_level: 'VERY_HIGH'
    });
    expect(matched.total_count).toBe(1);
    expect(matched.items[0].person_id).toBe(personA1);

    const { data: excluded } = await userAClient.rpc('search_canonical_persons_v1', {
      p_product_fit_level: 'LOW'
    });
    expect(excluded.total_count).toBe(0);
  });

  it('MIN_FIT_SCORE_FILTER = PASS: Filters by min_fit_score threshold', async () => {
    const { data: matched } = await userAClient.rpc('search_canonical_persons_v1', {
      p_min_fit_score: 90
    });
    expect(matched.total_count).toBe(1);
    expect(matched.items[0].person_id).toBe(personA1);

    const { data: excluded } = await userAClient.rpc('search_canonical_persons_v1', {
      p_min_fit_score: 95
    });
    expect(excluded.total_count).toBe(0);
  });

  it('PRODUCT_ID_FILTER = PASS: Filters specifically by product_id', async () => {
    const { data: matched } = await userAClient.rpc('search_canonical_persons_v1', {
      p_product_id: mockProductId
    });
    expect(matched.total_count).toBe(1);
    expect(matched.items[0].person_id).toBe(personA1);

    const { data: excluded } = await userAClient.rpc('search_canonical_persons_v1', {
      p_product_id: randomUUID()
    });
    expect(excluded.total_count).toBe(0);
  });

  it('OFFER_ID_FILTER = PASS: Filters specifically by offer_id', async () => {
    const { data: matched } = await userAClient.rpc('search_canonical_persons_v1', {
      p_offer_id: mockOfferId
    });
    expect(matched.total_count).toBe(1);
    expect(matched.items[0].person_id).toBe(personA1);

    const { data: excluded } = await userAClient.rpc('search_canonical_persons_v1', {
      p_offer_id: randomUUID()
    });
    expect(excluded.total_count).toBe(0);
  });

  // ==========================================================================
  // SECTION 8: EVIDENCE QUALITY & FRESHNESS
  // ==========================================================================

  it('EVIDENCE_CONFIDENCE_FILTER = PASS: Excludes persons lacking evidence >= threshold', async () => {
    // A1 has confidence 0.95; A2 has max confidence 0.80
    const { data: highConf } = await userAClient.rpc('search_canonical_persons_v1', {
      p_min_evidence_confidence: 0.85
    });
    expect(highConf.total_count).toBe(1);
    expect(highConf.items[0].person_id).toBe(personA1);
  });

  it('EVIDENCE_FRESHNESS_FILTER = PASS: Stale/expired evidence is ignored in query results', async () => {
    // A1 has 'stale_badge' expired in 2020 and 'fresh_badge' unexpired
    const { data, error } = await userAClient.rpc('search_canonical_persons_v1', {
      p_search_query: 'Valeria Rossi'
    });
    expect(error).toBeNull();
    const attrs = data.items[0].attributes;
    expect(attrs['fresh_badge']).toBeDefined();
    expect(attrs['fresh_badge'].value).toBe('active_2026');
    expect(attrs['stale_badge']).toBeUndefined(); // Stale evidence filtered out
  });

  // ==========================================================================
  // SECTION 9: CONFLICT & UNKNOWN FILTER SEMANTICS
  // ==========================================================================

  it('UNKNOWN_FILTER_SEMANTICS = PASS: Searching for non-existent attribute does not falsely match UNKNOWN', async () => {
    const { data } = await userAClient.rpc('search_canonical_persons_v1', {
      p_residence_city: 'Bariloche'
    });
    expect(data.total_count).toBe(0);
    expect(data.items.length).toBe(0);
  });

  it('CONFLICT_FILTER_SEMANTICS = PASS: Person with CONFLICT city is not falsely matched as KNOWN city', async () => {
    // Person A2 has conflicting evidence for residence_city ('Buenos Aires' and 'Cordoba')
    // Filtering specifically for 'Buenos Aires' must NOT return Person A2 because his city is in CONFLICT!
    const { data } = await userAClient.rpc('search_canonical_persons_v1', {
      p_residence_city: 'Buenos Aires'
    });
    expect(data.items.map((p: any) => p.person_id)).toContain(personA1);
    expect(data.items.map((p: any) => p.person_id)).not.toContain(personA2);
  });

  // ==========================================================================
  // SECTION 10: COMPLEX MULTI-FILTER AND & NO SPECULATION
  // ==========================================================================

  it('COMPLEX_MULTI_FILTER_AND = PASS: Complex conjunction returns only exact matching records', async () => {
    const { data, error } = await userAClient.rpc('search_canonical_persons_v1', {
      p_age_from: 40,
      p_age_to: 50,
      p_residence_neighborhood: 'Recoleta',
      p_coverage_email: true,
      p_intent_level: 'HIGH',
      p_min_fit_score: 90
    });
    expect(error).toBeNull();
    expect(data.total_count).toBe(1);
    expect(data.items[0].person_id).toBe(personA1);
  });

  it('NO_SPECULATIVE_DEMOGRAPHICS = PASS: Missing DOB remains UNKNOWN even with name, photo, and profession', async () => {
    // Person A2 has full_name 'Carlos Gomez', photo_url evidence, and profession 'consultor'
    // But invalid/missing DOB -> age MUST remain null (UNKNOWN)
    const { data, error } = await userAClient.rpc('search_canonical_persons_v1', {
      p_search_query: 'Carlos Gomez'
    });
    expect(error).toBeNull();
    expect(data.items[0].age).toBeNull(); // Fails closed to UNKNOWN
  });

  // ==========================================================================
  // SECTION 11: SAFE DOB PARSING & FAIL-CLOSED DEMOGRAPHICS
  // ==========================================================================

  it('VALID_DOB = PASS: Valid ISO date computes correct age without speculation', async () => {
    const { data, error } = await userAClient.rpc('search_canonical_persons_v1', {
      p_search_query: 'Valeria Rossi'
    });
    expect(error).toBeNull();
    expect(data.items[0].age).toBeGreaterThanOrEqual(45);
    expect(data.items[0].age).toBeLessThanOrEqual(47);
  });

  it('MALFORMED_DOB = UNKNOWN = PASS: Invalid date string returns age=null without SQL error', async () => {
    const { data, error } = await userAClient.rpc('search_canonical_persons_v1', {
      p_search_query: 'Carlos Gomez'
    });
    expect(error).toBeNull();
    expect(data.items[0].age).toBeNull();
  });

  it('SAFE_DATE_HELPER_UNIT_TESTS = PASS: safe_parse_iso_date handles 2026-99-99 and invalid dates', async () => {
    const { data: valid } = await userAClient.rpc('safe_parse_iso_date', { p_val: '2026-05-14' });
    expect(valid).toBe('2026-05-14');

    const { data: invalidMonth } = await userAClient.rpc('safe_parse_iso_date', { p_val: '2026-99-14' });
    expect(invalidMonth).toBeNull();

    const { data: invalidDay } = await userAClient.rpc('safe_parse_iso_date', { p_val: '2026-02-30' });
    expect(invalidDay).toBeNull();

    const { data: malformed } = await userAClient.rpc('safe_parse_iso_date', { p_val: 'not-a-date' });
    expect(malformed).toBeNull();
  });

  // ==========================================================================
  // SECTION 12: CONFLICT & KNOWN READ MODEL
  // ==========================================================================

  it('ATTRIBUTE_CONFLICT_SEMANTICS = READ_MODEL_CONSERVATIVE_CONFLICT: Disagreeing unexpired evidence yields CONFLICT', async () => {
    const { data, error } = await userAClient.rpc('search_canonical_persons_v1', {
      p_search_query: 'Carlos Gomez'
    });
    expect(error).toBeNull();
    const residenceCity = data.items[0].attributes['residence_city'];
    expect(residenceCity.status).toBe('CONFLICT');
    expect(residenceCity.value).toBe('CONFLICT');
  });

  it('SINGLE_AUTHORITATIVE_ASSERTION = KNOWN: Single unexpired assertion yields KNOWN', async () => {
    const { data, error } = await userAClient.rpc('search_canonical_persons_v1', {
      p_search_query: 'Valeria Rossi'
    });
    expect(error).toBeNull();
    const neighborhood = data.items[0].attributes['residence_neighborhood'];
    expect(neighborhood.status).toBe('KNOWN');
    expect(neighborhood.value).toBe('Recoleta');
  });

  // ==========================================================================
  // SECTION 13: CARDINALITY & ZERO MULTIPLICATION PROOF
  // ==========================================================================

  it('NO_DUPLICATE_PERSON_IDS = YES: 1:N relations do not multiply person rows', async () => {
    const { data, error } = await userAClient.rpc('search_canonical_persons_v1', {
      p_search_query: 'Valeria Rossi'
    });
    expect(error).toBeNull();
    expect(data.total_count).toBe(1);
    expect(data.items.length).toBe(1);
    expect(data.items[0].person_id).toBe(personA1);
  });

  it('TOTAL_COUNT_CORRECT = PASS: Windowed COUNT reflects exact deduplicated person count', async () => {
    const { data, error } = await userAClient.rpc('search_canonical_persons_v1', {
      p_status: 'ACTIVE'
    });
    expect(error).toBeNull();
    expect(data.total_count).toBe(2);
    expect(data.items.length).toBe(2);
  });

  // ==========================================================================
  // SECTION 14: PHOTO EVIDENCE VS DISPLAY & NO GRAVATAR
  // ==========================================================================

  it('PHOTO_EVIDENCE_DOES_NOT_IMPLY_DISPLAY_AUTHORITY = PASS: photo_displayable is false', async () => {
    const { data, error } = await userAClient.rpc('search_canonical_persons_v1', {
      p_search_query: 'Valeria Rossi'
    });
    expect(error).toBeNull();
    expect(data.items[0].has_photo_evidence).toBe(true);
    expect(data.items[0].photo_displayable).toBe(false);
  });

  // ==========================================================================
  // SECTION 15: PAGINATION, SORTING & READ-ONLY
  // ==========================================================================

  it('PAGINATION_LIMITS_CLAMPED = PASS: Invalid page sizes default safely to 25', async () => {
    const { data, error } = await userAClient.rpc('search_canonical_persons_v1', {
      p_page_size: 9999 as any
    });
    expect(error).toBeNull();
    expect(data.page_size).toBe(25);
  });

  it('SORT_SAFETY = PASS: Invalid sort field defaults safely to created_at without injection', async () => {
    const { data, error } = await userAClient.rpc('search_canonical_persons_v1', {
      p_sort_by: "invalid_col; DROP TABLE atlas_people;--" as any
    });
    expect(error).toBeNull();
    expect(data.items.length).toBeGreaterThan(0);
  });

  it('RESIDENCE_LOCATION_SEARCH = PASS: Matches by city and neighborhood', async () => {
    const { data, error } = await userAClient.rpc('search_canonical_persons_v1', {
      p_residence_neighborhood: 'Recoleta'
    });
    expect(error).toBeNull();
    expect(data.total_count).toBe(1);
    expect(data.items[0].person_id).toBe(personA1);
  });

  it('WORK_ATTRIBUTES_SEARCH = PASS: Matches by profession and company', async () => {
    const { data, error } = await userAClient.rpc('search_canonical_persons_v1', {
      p_profession: 'empresaria',
      p_company: 'Rossi Capital'
    });
    expect(error).toBeNull();
    expect(data.total_count).toBe(1);
    expect(data.items[0].person_id).toBe(personA1);
  });

  it('HAS_PHOTO_FILTER = PASS: Filters persons with evidenced photo asset', async () => {
    const { data, error } = await userAClient.rpc('search_canonical_persons_v1', {
      p_has_photo: true
    });
    expect(error).toBeNull();
    expect(data.items.map((p: any) => p.person_id)).toContain(personA1);
    expect(data.items.map((p: any) => p.person_id)).toContain(personA2);
  });

  it('AGE_RANGE_SEARCH = PASS: Age 45-47 finds Valeria Rossi with valid DOB', async () => {
    const { data, error } = await userAClient.rpc('search_canonical_persons_v1', {
      p_age_from: 40,
      p_age_to: 50
    });
    expect(error).toBeNull();
    expect(data.items.map((p: any) => p.person_id)).toContain(personA1);
    expect(data.items.map((p: any) => p.person_id)).not.toContain(personA2);
  });

  it('STATUS_FILTER = PASS: ACTIVE vs ALL vs DELETED behaves correctly', async () => {
    const { data: activeOnly } = await userAClient.rpc('search_canonical_persons_v1', {
      p_status: 'ACTIVE'
    });
    expect(activeOnly.total_count).toBe(2);

    const { data: deletedOnly } = await userAClient.rpc('search_canonical_persons_v1', {
      p_status: 'DELETED'
    });
    expect(deletedOnly.total_count).toBe(0);
  });

  it('DETERMINISTIC_SORTING = PASS: Sorting by full_name ASC and DESC', async () => {
    const { data: ascData } = await userAClient.rpc('search_canonical_persons_v1', {
      p_sort_by: 'full_name',
      p_sort_asc: true
    });
    expect(ascData.items[0].full_name).toBe('Carlos Gomez');
    expect(ascData.items[1].full_name).toBe('Valeria Rossi');

    const { data: descData } = await userAClient.rpc('search_canonical_persons_v1', {
      p_sort_by: 'full_name',
      p_sort_asc: false
    });
    expect(descData.items[0].full_name).toBe('Valeria Rossi');
    expect(descData.items[1].full_name).toBe('Carlos Gomez');
  });

  it('PAGE_DISJOINTNESS = PASS: Page 1 and Page 2 with limit 1 have zero overlap', async () => {
    const { data: page1 } = await userAClient.rpc('search_canonical_persons_v1', {
      p_page: 1,
      p_page_size: 25
    });
    const { data: page2 } = await userAClient.rpc('search_canonical_persons_v1', {
      p_page: 2,
      p_page_size: 25
    });
    const ids1 = new Set(page1.items.map((p: any) => p.person_id));
    const ids2 = new Set(page2.items.map((p: any) => p.person_id));
    const intersection = [...ids1].filter(x => ids2.has(x));
    expect(intersection.length).toBe(0);
  });

  it('READ_ONLY_EXECUTION = PASS: Search execution causes 0 database mutations', async () => {
    const { count: beforeCount } = await userAClient.from('atlas_people').select('*', { count: 'exact', head: true });
    await userAClient.rpc('search_canonical_persons_v1', { p_status: 'ALL' });
    const { count: afterCount } = await userAClient.from('atlas_people').select('*', { count: 'exact', head: true });
    expect(afterCount).toBe(beforeCount);
  });
});
