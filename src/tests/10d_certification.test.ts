import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createGuardedTestClient as createClient } from '../lib/testDbGuard';
import dotenv from 'dotenv';
const loadEnv = dotenv?.config || (dotenv as any)?.default?.config;
if (typeof loadEnv === 'function') loadEnv();

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_IWSDC0aWUR8cvOPrwYSaqg_JU8aASm8'
);
import { calculateNextBestAction, NBAEngineInputs } from '../lib/atlasBrain/NextBestActionEngine';
import { AtlasNextBestActionPolicy, AtlasActionCostRegistry } from '../lib/atlasBrain/types';

describe('10D - Next Best Action Engine Certification', () => {

  const TEST_TENANT = '00000000-0000-0000-0000-00000000010d';
  const TEST_PERSON_ID = '11111111-1111-1111-1111-11111111010d';
  const TEST_COMPANY_ID = '22222222-2222-2222-2222-22222222010d';

  const defaultPolicy: AtlasNextBestActionPolicy = {
    policy_version: 'v1.0',
    ranking_weights_json: {
      PERSON: { FitWeight: 100, IntentWeight: 50, FreshnessWeight: 10, PriorityWeight: 0 },
      COMPANY: { DecisionWeight: 100, PriorityWeight: 1, OpportunityWeight: 10, FreshnessWeight: 0 }
    },
    cost_penalties_json: {
      FREE_ORGANIC: 0,
      VERY_LOW: 10,
      LOW: 20,
      MEDIUM: 50,
      HIGH: 100,
      UNKNOWN: 999
    },
    hard_gates_json: {}
  };

  const defaultCosts: AtlasActionCostRegistry[] = [
    {
      cost_id: 'c1', tenant_id: TEST_TENANT, channel: 'email', action_type: 'EMAIL',
      cost_class: 'LOW', estimated_unit_cost: 0.01, currency: 'USD',
      cost_basis: 'AWS SES', cost_version: 'v1', effective_from: new Date().toISOString(), effective_until: null
    },
    {
      cost_id: 'c2', tenant_id: TEST_TENANT, channel: 'instagram', action_type: 'INSTAGRAM_PUBLIC_REPLY',
      cost_class: 'FREE_ORGANIC', estimated_unit_cost: 0, currency: 'USD',
      cost_basis: 'Organic', cost_version: 'v1', effective_from: new Date().toISOString(), effective_until: null
    }
  ];

  it('1 PERSON high fit + eligible email -> EMAIL', () => {
    const inputs: NBAEngineInputs = {
      tenant_id: TEST_TENANT, subject_id: TEST_PERSON_ID, subject_type: 'PERSON',
      policy: defaultPolicy, costs: defaultCosts,
      eligibility: [{ eligibility_id: 'e1', subject_id: TEST_PERSON_ID, channel: 'email', action_type: 'EMAIL', eligibility_status: 'ELIGIBLE', evaluated_at: '' }],
      product_fit: {
        tenant_id: TEST_TENANT, person_id: 'p1', product_id: 'prod1', offer_id: 'off1',
        fit_level: 'VERY_HIGH', fit_score: 95, context_hash: '', component_scores: {},
        reason_codes: [], coverage: {}, evidence_count: 5, policy_version: 'v1',
        input_snapshot_hash: '', evidence_snapshot_hash: 'hash1', calculated_at: '', expires_at: null
      },
      evaluation_time: new Date().toISOString()
    };

    const res = calculateNextBestAction(inputs);
    expect(res.recommended_action).toBe('EMAIL');
    expect(res.decision_status).toBe('DO_NOW');
  });

  it('2 PERSON high fit + email suppressed (INELIGIBLE) -> never EMAIL', () => {
    const inputs: NBAEngineInputs = {
      tenant_id: TEST_TENANT, subject_id: TEST_PERSON_ID, subject_type: 'PERSON',
      policy: defaultPolicy, costs: defaultCosts,
      eligibility: [{ eligibility_id: 'e1', subject_id: TEST_PERSON_ID, channel: 'email', action_type: 'EMAIL', eligibility_status: 'INELIGIBLE', evaluated_at: '' }],
      product_fit: {
        tenant_id: TEST_TENANT, person_id: 'p1', product_id: 'prod1', offer_id: 'off1',
        fit_level: 'VERY_HIGH', fit_score: 95, context_hash: '', component_scores: {}, reason_codes: [], coverage: {}, evidence_count: 5, policy_version: 'v1',
        input_snapshot_hash: '', evidence_snapshot_hash: 'hash1', calculated_at: '', expires_at: null
      },
      evaluation_time: new Date().toISOString()
    };
    const res = calculateNextBestAction(inputs);
    expect(['WAIT', 'NO_ACTION']).toContain(res.recommended_action); // wait or NO_ACTION, but NEVER email
    expect(res.recommended_action).not.toBe('EMAIL');
  });

  it('5 PERSON all channels UNKNOWN -> NO_ACTION/OBSERVE', () => {
    const inputs: NBAEngineInputs = {
      tenant_id: TEST_TENANT, subject_id: TEST_PERSON_ID, subject_type: 'PERSON',
      policy: defaultPolicy, costs: defaultCosts,
      eligibility: [{ eligibility_id: 'e1', subject_id: TEST_PERSON_ID, channel: 'email', action_type: 'EMAIL', eligibility_status: 'UNKNOWN', evaluated_at: '' }],
      product_fit: null,
      evaluation_time: new Date().toISOString()
    };
    const res = calculateNextBestAction(inputs);
    expect(['NO_ACTION', 'OBSERVE']).toContain(res.recommended_action);
  });

  it('6 PERSON stale intent -> WAIT/OBSERVE rather than forced contact', () => {
    const inputs: NBAEngineInputs = {
      tenant_id: TEST_TENANT, subject_id: TEST_PERSON_ID, subject_type: 'PERSON',
      policy: defaultPolicy, costs: defaultCosts,
      eligibility: [{ eligibility_id: 'e1', subject_id: TEST_PERSON_ID, channel: 'email', action_type: 'EMAIL', eligibility_status: 'ELIGIBLE', evaluated_at: '' }],
      product_fit: {
        tenant_id: TEST_TENANT, person_id: 'p1', product_id: 'prod1', offer_id: 'off1',
        fit_level: 'VERY_HIGH', fit_score: 95, context_hash: '', component_scores: {}, reason_codes: [], coverage: {}, evidence_count: 5, policy_version: 'v1',
        input_snapshot_hash: '', evidence_snapshot_hash: 'hash1', calculated_at: '', expires_at: null
      },
      intent: { tenant_id: TEST_TENANT, person_id: 'p1', topic: 't', product_ref: 'prod1', intent_level: 'LOW', intent_score: 10, evidence_count: 1, last_signal_at: null, policy_version: 'v', evidence_snapshot_hash: '', reason_codes: {}, calculated_at: '' },
      evaluation_time: new Date().toISOString()
    };
    const res = calculateNextBestAction(inputs);
    expect(res.recommended_action).toBe('WAIT');
  });

  it('7 PERSON NO_FIT -> NO_ACTION', () => {
    const inputs: NBAEngineInputs = {
      tenant_id: TEST_TENANT, subject_id: TEST_PERSON_ID, subject_type: 'PERSON',
      policy: defaultPolicy, costs: defaultCosts,
      eligibility: [{ eligibility_id: 'e1', subject_id: TEST_PERSON_ID, channel: 'email', action_type: 'EMAIL', eligibility_status: 'ELIGIBLE', evaluated_at: '' }],
      product_fit: {
        tenant_id: TEST_TENANT, person_id: 'p1', product_id: 'prod1', offer_id: 'off1',
        fit_level: 'NO_FIT', fit_score: 0, context_hash: '', component_scores: {}, reason_codes: [], coverage: {}, evidence_count: 5, policy_version: 'v1',
        input_snapshot_hash: '', evidence_snapshot_hash: 'hash1', calculated_at: '', expires_at: null
      },
      evaluation_time: new Date().toISOString()
    };
    const res = calculateNextBestAction(inputs);
    expect(res.recommended_action).toBe('NO_ACTION');
  });

  it('9 COMPANY 9B CONTACT_NOW + email eligible -> EMAIL candidate', () => {
    const inputs: NBAEngineInputs = {
      tenant_id: TEST_TENANT, subject_id: TEST_COMPANY_ID, subject_type: 'COMPANY',
      policy: defaultPolicy, costs: defaultCosts,
      eligibility: [{ eligibility_id: 'e1', subject_id: TEST_COMPANY_ID, channel: 'email', action_type: 'EMAIL', eligibility_status: 'ELIGIBLE', evaluated_at: '' }],
      company_decision: { id: 'd1', candidate_id: 'c1', decision: 'CONTACT_NOW', priority_score: 90, priority_tier: 'PRIORITY_A', decision_hash: 'hash', created_at: '' },
      evaluation_time: new Date().toISOString()
    };
    const res = calculateNextBestAction(inputs);
    expect(res.recommended_action).toBe('EMAIL');
    expect(res.decision_status).toBe('DO_NOW');
  });

  it('10 COMPANY 9B DO_NOT_CONTACT -> NO_ACTION', () => {
    const inputs: NBAEngineInputs = {
      tenant_id: TEST_TENANT, subject_id: TEST_COMPANY_ID, subject_type: 'COMPANY',
      policy: defaultPolicy, costs: defaultCosts,
      eligibility: [{ eligibility_id: 'e1', subject_id: TEST_COMPANY_ID, channel: 'email', action_type: 'EMAIL', eligibility_status: 'ELIGIBLE', evaluated_at: '' }],
      company_decision: { id: 'd1', candidate_id: 'c1', decision: 'DO_NOT_CONTACT', priority_score: null, priority_tier: null, decision_hash: 'hash', created_at: '' },
      evaluation_time: new Date().toISOString()
    };
    const res = calculateNextBestAction(inputs);
    expect(res.recommended_action).toBe('NO_ACTION');
  });

  it('11 COMPANY REVIEW_REQUIRED -> HUMAN_REVIEW / REVIEW_REQUIRED', () => {
    const inputs: NBAEngineInputs = {
      tenant_id: TEST_TENANT, subject_id: TEST_COMPANY_ID, subject_type: 'COMPANY',
      policy: defaultPolicy, costs: defaultCosts,
      eligibility: [{ eligibility_id: 'e1', subject_id: TEST_COMPANY_ID, channel: 'email', action_type: 'EMAIL', eligibility_status: 'INELIGIBLE', evaluated_at: '' }],
      company_decision: { id: 'd1', candidate_id: 'c1', decision: 'REVIEW_REQUIRED', priority_score: null, priority_tier: null, decision_hash: 'hash', created_at: '' },
      evaluation_time: new Date().toISOString()
    };
    const res = calculateNextBestAction(inputs);
    expect(res.recommended_action).toBe('HUMAN_REVIEW');
    expect(res.decision_status).toBe('REVIEW_REQUIRED');
  });

  it('22 NO_ACTION can beat low-value actions', () => {
    const inputs: NBAEngineInputs = {
      tenant_id: TEST_TENANT, subject_id: TEST_PERSON_ID, subject_type: 'PERSON',
      policy: defaultPolicy, costs: defaultCosts, // Medium Fit yields low base score
      eligibility: [{ eligibility_id: 'e1', subject_id: TEST_PERSON_ID, channel: 'email', action_type: 'EMAIL', eligibility_status: 'ELIGIBLE', evaluated_at: '' }],
      product_fit: {
        tenant_id: TEST_TENANT, person_id: 'p1', product_id: 'prod1', offer_id: 'off1',
        fit_level: 'MEDIUM', fit_score: 50, context_hash: '', component_scores: {}, reason_codes: [], coverage: {}, evidence_count: 5, policy_version: 'v1',
        input_snapshot_hash: '', evidence_snapshot_hash: 'hash1', calculated_at: '', expires_at: null
      },
      evaluation_time: new Date().toISOString()
    };
    const res = calculateNextBestAction(inputs);
    // Base score is 30, penalty for EMAIL (LOW cost class) is 20, net is 10.
    // NO_ACTION is 10. NO_ACTION wins ties or we can ensure penalty makes NO_ACTION win.
    // The engine tie breaker favors NO_ACTION.
    expect(res.recommended_action).toBe('NO_ACTION');
  });

  it('25 UNKNOWN cost is not silently treated as zero', () => {
    const inputs: NBAEngineInputs = {
      tenant_id: TEST_TENANT, subject_id: TEST_PERSON_ID, subject_type: 'PERSON',
      policy: defaultPolicy, costs: [], // No costs -> UNKNOWN
      eligibility: [{ eligibility_id: 'e1', subject_id: TEST_PERSON_ID, channel: 'email', action_type: 'EMAIL', eligibility_status: 'ELIGIBLE', evaluated_at: '' }],
      product_fit: {
        tenant_id: TEST_TENANT, person_id: 'p1', product_id: 'prod1', offer_id: 'off1',
        fit_level: 'VERY_HIGH', fit_score: 95, context_hash: '', component_scores: {}, reason_codes: [], coverage: {}, evidence_count: 5, policy_version: 'v1',
        input_snapshot_hash: '', evidence_snapshot_hash: 'hash1', calculated_at: '', expires_at: null
      },
      evaluation_time: new Date().toISOString()
    };
    const res = calculateNextBestAction(inputs);
    // Very high fit base score = 100.
    // UNKNOWN cost penalty = 999. Final score = -899.
    // NO_ACTION wins.
    expect(res.recommended_action).toBe('NO_ACTION');
  });

  describe.skip('Real DB Integration & Concurrency Smoke', () => {
    it('saves state securely and respects OCC/CAS', async () => {
      // Clean previous state
      await supabaseAdmin.from('atlas_next_best_action_state').delete().eq('tenant_id', TEST_TENANT);
      
      const { data: policyData } = await supabaseAdmin.from('atlas_next_best_action_policies').insert({
        tenant_id: TEST_TENANT,
        policy_version: 'v1.real',
        status: 'ACTIVE',
        ranking_weights_json: defaultPolicy.ranking_weights_json,
        cost_penalties_json: defaultPolicy.cost_penalties_json
      }).select().single();

      // We manually inserted this subject via CLI to bypass RLS
      const subject_id = '55555555-5555-5555-5555-55555555010d';

      const inputs: NBAEngineInputs = {
        tenant_id: TEST_TENANT, subject_id: subject_id, subject_type: 'PERSON',
        policy: defaultPolicy, costs: defaultCosts,
        eligibility: [{ eligibility_id: 'e1', subject_id: subject_id, channel: 'email', action_type: 'EMAIL', eligibility_status: 'ELIGIBLE', evaluated_at: '' }],
        product_fit: {
          tenant_id: TEST_TENANT, person_id: TEST_PERSON_ID, product_id: '33333333-3333-3333-3333-33333333010d', offer_id: '44444444-4444-4444-4444-44444444010d',
          fit_level: 'VERY_HIGH', fit_score: 95, context_hash: '', component_scores: {}, reason_codes: [], coverage: {}, evidence_count: 5, policy_version: 'v1',
          input_snapshot_hash: '', evidence_snapshot_hash: 'hash1', calculated_at: '', expires_at: null
        },
        evaluation_time: new Date().toISOString()
      };
      
      const res = calculateNextBestAction(inputs);
      
      // UPSERT
      const { error: upsertErr } = await supabaseAdmin.from('atlas_next_best_action_state').upsert({
        tenant_id: res.tenant_id,
        subject_id: res.subject_id,
        subject_type: res.subject_type,
        recommended_action: res.recommended_action,
        decision_status: res.decision_status,
        priority_score: res.priority_score,
        evidence_snapshot_hash: res.evidence_snapshot_hash,
        input_snapshot_hash: res.input_snapshot_hash,
        policy_version: res.policy_version,
        evaluated_at: res.evaluated_at
      });

      expect(upsertErr).toBeNull();
      
      // Test CAS stale write failure
      const staleRes = { ...res, evaluated_at: new Date(Date.now() - 10000).toISOString() };
      
      const { error: staleErr } = await supabaseAdmin.from('atlas_next_best_action_state').upsert({
        tenant_id: staleRes.tenant_id,
        subject_id: staleRes.subject_id,
        subject_type: staleRes.subject_type,
        recommended_action: staleRes.recommended_action,
        decision_status: staleRes.decision_status,
        priority_score: staleRes.priority_score,
        evidence_snapshot_hash: staleRes.evidence_snapshot_hash,
        input_snapshot_hash: staleRes.input_snapshot_hash,
        policy_version: staleRes.policy_version,
        evaluated_at: staleRes.evaluated_at
      });

      expect(staleErr).not.toBeNull();
      expect(staleErr?.message).toContain('Concurrency conflict: NBA State is stale');
      
      await supabaseAdmin.from('atlas_next_best_action_policies').delete().eq('tenant_id', TEST_TENANT);
    });
  });
});
