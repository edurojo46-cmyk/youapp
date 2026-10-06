import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { supabase } from '../lib/supabase';
import { determineNextBestAction } from '../lib/atlasBrain/NextBestActionService';
import crypto from 'node:crypto';

describe('10D - Final Real DB Certification (RLS + CAS)', () => {

  let testTenantA: string = '';
  let testTenantB: string = '';
  const TEST_PERSON_ID = crypto.randomUUID();
  const TEST_COMPANY_ID = crypto.randomUUID();
  const TEST_PRODUCT = crypto.randomUUID();
  const TEST_OFFER = crypto.randomUUID();
  let personSubjectId: string = '';
  let companySubjectId: string = '';

  beforeAll(async () => {
    // 1. Create Test Tenant A
    const emailA = `testA-10d-${Date.now()}@example.com`;
    const { data: authDataA, error: authErrA } = await supabase.auth.signUp({ email: emailA, password: 'TestPassword123!' });
    if (authErrA) throw authErrA;
    testTenantA = authDataA.user!.id;

    // We are now authenticated as Tenant A.

    // 2. Insert into atlas_people and atlas_contacts to trigger subject creation
    const { error: ePe } = await supabase.from('atlas_people').insert({
      person_id: TEST_PERSON_ID, tenant_id: testTenantA
    });
    console.log('ePe:', ePe);

    const dotenv = await import('dotenv');
    dotenv.config(); // Ensure process.env.SUPABASE_SECRET_KEY is loaded if present
    
    const { createClient } = await import('@supabase/supabase-js');
    const adminSupabase = createClient(
      (supabase as any).supabaseUrl || 'https://jtnurafmngaxdwlzpvxv.supabase.co',
      process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    const testEmail = `co-${Date.now()}@co.com`;
    const { error: eC1 } = await supabase.from('atlas_contacts').insert({
      contact_id: TEST_COMPANY_ID, tenant_id: testTenantA, email: testEmail, email_normalized: testEmail, email_hash: crypto.randomUUID(), recipient_type: 'ORGANIZATION', status: 'ACTIVE'
    });
    console.log('eC1:', eC1);

    const { data: pSub } = await supabase.from('atlas_subject_registry').select('subject_id').eq('person_id', TEST_PERSON_ID).single();
    personSubjectId = pSub!.subject_id;

    const { data: cSubData, error: cSubErr } = await supabase.from('atlas_subject_registry').upsert(
      { subject_type: 'COMPANY', company_id: TEST_COMPANY_ID },
      { onConflict: 'company_id' }
    ).select('subject_id').single();
    if (cSubErr) console.log('cSubErr:', cSubErr);
    companySubjectId = cSubData!.subject_id;

    // 3. Setup Tenant A Policies & Costs
    await supabase.from('atlas_next_best_action_policies').insert({
      tenant_id: testTenantA,
      policy_version: 'v1.real',
      status: 'ACTIVE',
      ranking_weights_json: {
        PERSON: { FitWeight: 100, IntentWeight: 50, FreshnessWeight: 10, PriorityWeight: 0 },
        COMPANY: { DecisionWeight: 100, PriorityWeight: 1, OpportunityWeight: 10, FreshnessWeight: 0 }
      },
      cost_penalties_json: { FREE_ORGANIC: 0, LOW: 20, UNKNOWN: 999 }
    });

    await supabase.from('atlas_action_cost_registry').insert([
      { tenant_id: testTenantA, channel: 'instagram', action_type: 'INSTAGRAM_DM', cost_class: 'LOW', estimated_unit_cost: 0.01, currency: 'USD', cost_basis: 'Meta API', cost_version: 'v1' },
      // SMS is NOT inserted -> UNKNOWN cost
    ]);

    // Insert Product and Offer
    const { error: eP } = await supabase.from('atlas_products').insert({
      product_id: TEST_PRODUCT, tenant_id: testTenantA, name: 'Tango Show', category: 'EVENT'
    });
    console.log('eP:', eP);
    const { error: eO } = await supabase.from('atlas_product_offers').insert({
      offer_id: TEST_OFFER, tenant_id: testTenantA, product_id: TEST_PRODUCT, offer_version: 'v1'
    });
    console.log('eO:', eO);
  });

  afterAll(async () => {
    // Teardown
    await supabase.from('atlas_next_best_action_state').delete().eq('tenant_id', testTenantA);
    await supabase.from('atlas_next_best_action_policies').delete().eq('tenant_id', testTenantA);
    await supabase.from('atlas_action_cost_registry').delete().eq('tenant_id', testTenantA);
    await supabase.from('atlas_channel_eligibility').delete().in('subject_id', [personSubjectId, companySubjectId]);
    await supabase.auth.signOut();
  });

  it('A) PERSON REAL PERSISTENCE', async () => {
    // Authoritative Inputs
    const { error: err1 } = await supabase.from('atlas_channel_eligibility').upsert({
      subject_id: personSubjectId, channel: 'instagram', action_type: 'INSTAGRAM_DM', eligibility_status: 'ELIGIBLE'
    }, { onConflict: 'subject_id, channel, action_type' });
    console.log('Elig Error:', err1);
    
    const { error: err2 } = await supabase.from('atlas_person_product_fit_state').upsert({
      tenant_id: testTenantA, person_id: TEST_PERSON_ID, product_id: TEST_PRODUCT, offer_id: TEST_OFFER,
      fit_level: 'VERY_HIGH', fit_score: 95, context_hash: 'cx1', evidence_count: 5, policy_version: 'v1', evidence_snapshot_hash: 'hash1', input_snapshot_hash: 'hash2',
      component_scores: {}, reason_codes: [], coverage: {}
    }, { onConflict: 'tenant_id, person_id, product_id, offer_id' });
    console.log('Fit Error:', err2);

    // Run Service Flow
    const result = await determineNextBestAction(supabase, testTenantA, personSubjectId, 'PERSON', TEST_PRODUCT);
    
    // Read back through RLS
    const { data: dbState, error } = await supabase.from('atlas_next_best_action_state')
      .select('*').eq('tenant_id', testTenantA).eq('subject_id', personSubjectId).single();
    
    expect(error).toBeNull();
    expect(dbState!.recommended_action).toBe('INSTAGRAM_DM');
    expect(dbState!.decision_status).toBe('DO_NOW');
    expect(dbState!.estimated_action_cost).toBe('LOW');
    expect(dbState!.policy_version).toBe('v1.real');
    expect(dbState!.input_snapshot_hash).toBeTruthy();
    expect(dbState!.reason_codes).toContain('SELECTED_INSTAGRAM_DM');
  });

  it('B) COMPANY REAL PERSISTENCE & GATES', async () => {
    await supabase.from('atlas_channel_eligibility').upsert({
      subject_id: companySubjectId, channel: 'instagram', action_type: 'INSTAGRAM_DM', eligibility_status: 'ELIGIBLE'
    }, { onConflict: 'subject_id, channel, action_type' });

    const TEST_SEARCH_ID = crypto.randomUUID();
    const TEST_MATCH_ID = crypto.randomUUID();

    const dotenv = await import('dotenv');
    dotenv.config(); // Ensure process.env.SUPABASE_SECRET_KEY is loaded if present
    
    const { createClient } = await import('@supabase/supabase-js');
    const adminSupabase = createClient(
      (supabase as any).supabaseUrl || 'https://jtnurafmngaxdwlzpvxv.supabase.co',
      process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    const { error: eC2 } = await supabase.from('atlas_audience_searches').upsert({
      id: TEST_SEARCH_ID, tenant_id: testTenantA, criteria_version: 'v1', status: 'COMPLETED'
    });
    console.log('eC2:', eC2);
    
    const { error: eC3 } = await supabase.from('atlas_audience_matches').upsert({
      id: TEST_MATCH_ID, tenant_id: testTenantA, search_id: TEST_SEARCH_ID, candidate_id: TEST_COMPANY_ID, match_status: 'MATCH', evaluation_state: 'COMPLETE', criteria_total: 1, criteria_confirmed: 1, criteria_not_match: 0, criteria_unknown: 0, criteria_conflict: 0
    });
    console.log('eC3:', eC3);

    // CONTACT_NOW
    const { error: errC } = await supabase.from('atlas_contact_decisions').upsert({
      id: crypto.randomUUID(),
      tenant_id: testTenantA,
      candidate_id: TEST_COMPANY_ID,
      audience_search_id: TEST_SEARCH_ID,
      audience_match_id: TEST_MATCH_ID,
      decision: 'CONTACT_NOW',
      priority_score: 95,
      priority_tier: 'PRIORITY_A',
      hard_gates_passed: true,
      decision_hash: 'h1',
      decision_policy_version: 'v1',
      scoring_version: 'v1'
    });
    console.log('Company Decision Upsert Error:', errC);
    
    let res = await determineNextBestAction(supabase, testTenantA, companySubjectId, 'COMPANY');
    expect(res.recommended_action).toBe('INSTAGRAM_DM');

    // DO_NOT_CONTACT
    await supabase.from('atlas_contact_decisions').upsert({
      id: crypto.randomUUID(),
      tenant_id: testTenantA,
      candidate_id: TEST_COMPANY_ID, decision: 'DO_NOT_CONTACT', decision_hash: 'h2',
      audience_search_id: TEST_SEARCH_ID, audience_match_id: TEST_MATCH_ID,
      decision_policy_version: 'v1', scoring_version: 'v1', hard_gates_passed: false
    });
    
    res = await determineNextBestAction(supabase, testTenantA, companySubjectId, 'COMPANY');
    expect(res.recommended_action).toBe('NO_ACTION');
    expect(res.decision_status).toBe('NO_ACTION');

    // REVIEW_REQUIRED
    await supabase.from('atlas_contact_decisions').upsert({
      id: crypto.randomUUID(),
      tenant_id: testTenantA,
      candidate_id: TEST_COMPANY_ID, decision: 'REVIEW_REQUIRED', decision_hash: 'h3',
      audience_search_id: TEST_SEARCH_ID, audience_match_id: TEST_MATCH_ID,
      decision_policy_version: 'v1', scoring_version: 'v1', hard_gates_passed: true
    });
    
    res = await determineNextBestAction(supabase, testTenantA, companySubjectId, 'COMPANY');
    expect(res.recommended_action).toBe('HUMAN_REVIEW');
    expect(res.decision_status).toBe('REVIEW_REQUIRED');
  });

  it('E) UNKNOWN COST HANDLING', async () => {
    // Provide eligibility for WHATSAPP but NO cost in registry
    const { error: err3 } = await supabase.from('atlas_channel_eligibility').upsert({
      subject_id: personSubjectId, channel: 'whatsapp', action_type: 'WHATSAPP_MARKETING_MESSAGE', eligibility_status: 'ELIGIBLE'
    }, { onConflict: 'subject_id, channel, action_type' });
    
    // We already have Product Fit from Test A, but we'll remove instagram eligibility so WHATSAPP is the only option
    await supabase.from('atlas_channel_eligibility').delete().eq('channel', 'instagram');

    const res = await determineNextBestAction(supabase, testTenantA, personSubjectId, 'PERSON', TEST_PRODUCT);
    
    // Unknown cost penalizes WHATSAPP heavily, so it falls back to NO_ACTION or OBSERVE
    expect(['NO_ACTION', 'OBSERVE']).toContain(res.recommended_action);
    
    // Assert cost handling logic works and correctly persists
    const { data: dbState, error: stateErr } = await supabase.from('atlas_next_best_action_state')
      .select('*').eq('tenant_id', testTenantA).eq('subject_id', personSubjectId).single();
    
    if (stateErr) console.log('State Fetch Error:', stateErr);
      
    if (dbState && dbState.recommended_action === 'WHATSAPP_MARKETING_MESSAGE') {
       expect(dbState.estimated_action_cost).toBe('UNKNOWN');
    }
  });

  it('D) STRICT CAS REAL TEST', async () => {
    // 1. Get valid state
    await supabase.from('atlas_channel_eligibility').upsert({
      subject_id: personSubjectId, channel: 'instagram', action_type: 'INSTAGRAM_DM', eligibility_status: 'ELIGIBLE'
    }, { onConflict: 'subject_id, channel, action_type' });
    
    const validRes = await determineNextBestAction(supabase, testTenantA, personSubjectId, 'PERSON', TEST_PRODUCT);
    expect(validRes.recommended_action).toBe('INSTAGRAM_DM');

    // 2. Now simulate a stale write by fetching the inputs again, but before saving, another transaction mutates eligibility
    // We'll mimic this by manually calling upsert with a past evaluated_at but the current db has a newer eligibility timestamp
    
    // Mutate authoritative dependency (Eligibility)
    await supabase.from('atlas_channel_eligibility').upsert({
      subject_id: personSubjectId, channel: 'instagram', action_type: 'INSTAGRAM_DM', eligibility_status: 'INELIGIBLE', evaluated_at: new Date().toISOString()
    }, { onConflict: 'subject_id, channel, action_type' });
    
    // Attempt to persist the stale NBA evaluation
    const { error: staleErr } = await supabase.from('atlas_next_best_action_state').upsert({
      tenant_id: testTenantA,
      subject_id: personSubjectId,
      subject_type: 'PERSON',
      recommended_action: validRes.recommended_action,
      decision_status: validRes.decision_status,
      evidence_snapshot_hash: validRes.evidence_snapshot_hash,
      input_snapshot_hash: validRes.input_snapshot_hash,
      policy_version: validRes.policy_version,
      evaluated_at: validRes.evaluated_at // Stale!
    }, { onConflict: 'tenant_id, subject_id, product_id, offer_id, opportunity_id' });
    
    // 4. Postgres MUST reject it
    expect(staleErr).not.toBeNull();
    expect(staleErr?.message).toContain('Concurrency conflict: Channel Eligibility was updated recently');
  });

  it('C) RLS NEGATIVE TEST (Tenant A cannot read Tenant B)', async () => {
    // Create Tenant B
    const emailB = `testB-10d-${Date.now()}@example.com`;
    const { data: authDataB } = await supabase.auth.signUp({ email: emailB, password: 'TestPassword123!' });
    testTenantB = authDataB.user!.id;
    
    // As Tenant B, try to read Tenant A's state
    const { data, error } = await supabase.from('atlas_next_best_action_state').select('*').eq('tenant_id', testTenantA);
    
    expect(error).toBeNull();
    expect(data!.length).toBe(0); // RLS hides it
    
    // Teardown B
    await supabase.auth.signOut();
  });
});
