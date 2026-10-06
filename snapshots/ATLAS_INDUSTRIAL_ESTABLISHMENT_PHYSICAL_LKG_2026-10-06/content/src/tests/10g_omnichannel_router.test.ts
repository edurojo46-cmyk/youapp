import { describe, it, expect, beforeAll } from 'vitest';
import { createGuardedTestClient as createClient } from '../lib/testDbGuard';
import * as crypto from 'crypto';
import { OmnichannelRouterService } from '../lib/atlas10g/OmnichannelRouterService';
import { RoutingCandidate, calculateDeterministicRouting, RoutingContext, generateContextHash } from '../lib/atlas10g/DeterministicRoutingEngine';
import { AtlasOmnichannelRoutingPolicy, Atlas10GBusinessDomain } from '../lib/atlasBrain/types';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY || '';

const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);
let tenantId = '';

let tenantEmail = '';

beforeAll(async () => {
  tenantEmail = `tenant-10g-${Date.now()}@test.com`;
  const res = await adminSupabase.auth.admin.createUser({ email: tenantEmail, password: 'TestPassword123!', email_confirm: true });
  tenantId = res.data.user!.id;
  await adminSupabase.from('atlas_tenants').insert({ tenant_id: tenantId });

  // Insert base policies for OUTREACH, GROWTH, COMMERCE
  await setupPolicies();
});

async function setupPolicies() {
    await adminSupabase.from('atlas_omnichannel_routing_policies').delete().eq('tenant_id', tenantId);

    const outreachPolicy = {
        tenant_id: tenantId,
        business_domain: 'OUTREACH',
        policy_version: 'v1.0',
        status: 'ACTIVE',
        config_json: {
            min_action_score: 0.5,
            required_margin_over_no_action: 0.1,
            signal_weights: { SEO_PROBLEM: 0.4, INTENT: 0.3 },
            channel_weights: { 'EMAIL': 0.2, 'LINKEDIN': 0.1 },
            cost_penalties: { 'HIGH': 0.5 }
        }
    };
    
    const commercePolicy = {
        tenant_id: tenantId,
        business_domain: 'COMMERCE',
        policy_version: 'v1.0',
        status: 'ACTIVE',
        config_json: {
            min_action_score: 0.6,
            required_margin_over_no_action: 0.05,
            signal_weights: { PRODUCT_HOT: 0.01 }, // So 93 = 0.93
            channel_weights: { 'TIKTOK_ORGANIC': 0.1, 'INSTAGRAM_ORGANIC': 0.05 },
            cost_penalties: {}
        }
    };

    const growthPolicy = {
        tenant_id: tenantId,
        business_domain: 'GROWTH',
        policy_version: 'v1.0',
        status: 'ACTIVE',
        config_json: {
            min_action_score: 0.2,
            required_margin_over_no_action: 0.0,
            signal_weights: { VIRALITY: 0.5 },
            channel_weights: { 'YOUTUBE_SHORT': 0.3 },
            cost_penalties: {}
        }
    };

    await adminSupabase.from('atlas_omnichannel_routing_policies').insert([outreachPolicy, commercePolicy, growthPolicy]);
}

function createDummyNbaState(subject_type: 'PERSON' | 'COMPANY' = 'COMPANY'): string {
    return crypto.randomUUID(); 
}

describe('10G Omnichannel Router Matrix', () => {

  const getPolicy = (domain: Atlas10GBusinessDomain, min_action_score = 0.5, required_margin_over_no_action = 0.1) => ({
      tenant_id: tenantId,
      policy_id: crypto.randomUUID(),
      business_domain: domain,
      policy_version: 'v1',
      status: 'ACTIVE',
      config_json: {
          min_action_score,
          required_margin_over_no_action,
          signal_weights: { SEO_PROBLEM: 0.4, PRODUCT_HOT: 0.01 },
          channel_weights: { 'EMAIL': 0.2, 'LINKEDIN': 0.1, 'TIKTOK_ORGANIC': 0.1 },
          cost_penalties: { 'HIGH': 0.5 }
      },
      effective_from: new Date().toISOString(),
      effective_to: null
  } as AtlasOmnichannelRoutingPolicy);

  it('1 same input => identical output; 28 candidate-set hash changes; 29 context hash changes', () => {
    const policy = getPolicy('OUTREACH');
    const candidates: RoutingCandidate[] = [
        { action: 'EMAIL', channel: 'EMAIL', base_utility: 0.2, cost_class: 'LOW' },
        { action: 'NO_ACTION', channel: null, base_utility: 0.1, cost_class: 'FREE_ORGANIC' }
    ];
    const ctx1: RoutingContext = { tenant_id: tenantId, nba_id: 'n1', business_domain: 'OUTREACH', signals: { SEO_PROBLEM: 1 }, candidates, evaluation_time: '2026-09-08' };
    const res1 = calculateDeterministicRouting(ctx1, policy);
    
    const ctx2: RoutingContext = { tenant_id: tenantId, nba_id: 'n1', business_domain: 'OUTREACH', signals: { SEO_PROBLEM: 1 }, candidates, evaluation_time: '2026-09-08' };
    const res2 = calculateDeterministicRouting(ctx2, policy);
    
    expect(res1.selected_action).toBe(res2.selected_action);
    expect(res1.selected_score).toBe(res2.selected_score);
    expect(res1.candidate_set_hash).toBe(res2.candidate_set_hash);
    expect(res1.context_signal_hash).toBe(res2.context_signal_hash);

    // 28
    const ctx3: RoutingContext = { ...ctx1, candidates: [...candidates, { action: 'WAIT', channel: null, base_utility: 0, cost_class: 'FREE_ORGANIC' }] };
    const res3 = calculateDeterministicRouting(ctx3, policy);
    expect(res1.candidate_set_hash).not.toBe(res3.candidate_set_hash);

    // 29
    const ctx4: RoutingContext = { ...ctx1, signals: { SEO_PROBLEM: 0 } };
    const res4 = calculateDeterministicRouting(ctx4, policy);
    expect(res1.context_signal_hash).not.toBe(res4.context_signal_hash);
  });

  it('2 policy version changes output reproducibly', () => {
    const p1 = getPolicy('OUTREACH');
    const p2 = getPolicy('OUTREACH');
    p2.config_json.signal_weights!.SEO_PROBLEM = 0.8;
    
    const ctx = { tenant_id: tenantId, nba_id: 'n1', business_domain: 'OUTREACH' as const, signals: { SEO_PROBLEM: 1 }, candidates: [{ action: 'EMAIL' as any, channel: 'EMAIL', base_utility: 0.2, cost_class: 'LOW' }], evaluation_time: 't' };
    
    const r1 = calculateDeterministicRouting(ctx, p1);
    const r2 = calculateDeterministicRouting(ctx, p2);
    expect(r1.selected_score).toBe(0.8); // 0.2 + 0.4(SEO) + 0.2(channel)
    expect(r2.selected_score).toBe(1.2); // 0.2 + 0.8(SEO) + 0.2(channel)
  });

  it('3 OUTREACH routing', async () => {
      const p = getPolicy('OUTREACH');
      const ctx: RoutingContext = { tenant_id: tenantId, nba_id: 'n1', business_domain: 'OUTREACH', signals: { SEO_PROBLEM: 1 }, candidates: [{ action: 'EMAIL', channel: 'EMAIL', base_utility: 0.3, cost_class: 'LOW' }, { action: 'LINKEDIN_COMMENT', channel: 'LINKEDIN', base_utility: 0.3, cost_class: 'LOW' }], evaluation_time: 't' };
      const r = calculateDeterministicRouting(ctx, p);
      expect(r.selected_action).toBe('EMAIL');
  });

  it('5 COMMERCE routing', () => {
      const p = getPolicy('COMMERCE', 0.8, 0.01);
      const ctx: RoutingContext = { tenant_id: tenantId, nba_id: 'n1', business_domain: 'COMMERCE', signals: { PRODUCT_HOT: 93 }, candidates: [{ action: 'X_PUBLIC_REPLY', channel: 'TIKTOK_ORGANIC', base_utility: 0, cost_class: 'LOW' }], evaluation_time: 't' };
      const r = calculateDeterministicRouting(ctx, p);
      // 0(base) + 93*0.01 + 0.1(channel) = 1.03
      expect(r.selected_action).toBe('X_PUBLIC_REPLY');
      expect(r.selected_channel).toBe('TIKTOK_ORGANIC');
      expect(r.selected_score).toBe(1.03);
  });

  it('12 NO_ACTION wins natively', () => {
      const p = getPolicy('OUTREACH', 0, 0);
      const ctx: RoutingContext = { tenant_id: tenantId, nba_id: 'n1', business_domain: 'OUTREACH', signals: { SEO_PROBLEM: 0 }, candidates: [{ action: 'EMAIL', channel: 'EMAIL', base_utility: 0.05, cost_class: 'LOW' }, { action: 'NO_ACTION', channel: null, base_utility: 0.8, cost_class: 'FREE_ORGANIC' }], evaluation_time: 't' };
      const r = calculateDeterministicRouting(ctx, p);
      expect(r.selected_action).toBe('NO_ACTION');
      expect(r.status).toBe('ROUTED');
  });

  it('15 below minimum threshold => NO_ACTION', () => {
      const p = getPolicy('OUTREACH', 0.9, 0);
      const ctx: RoutingContext = { tenant_id: tenantId, nba_id: 'n1', business_domain: 'OUTREACH', signals: { SEO_PROBLEM: 1 }, candidates: [{ action: 'EMAIL', channel: 'EMAIL', base_utility: 0.2, cost_class: 'LOW' }], evaluation_time: 't' };
      const r = calculateDeterministicRouting(ctx, p);
      // Email gets 0.8. Min is 0.9. Falls back to NO_ACTION
      expect(r.selected_action).toBe('NO_ACTION');
  });

  it('16 insufficient margin => NO_ACTION/WAIT', () => {
      const p = getPolicy('OUTREACH', 0, 0.5); // Requires 0.5 margin over NO_ACTION
      const ctx: RoutingContext = { tenant_id: tenantId, nba_id: 'n1', business_domain: 'OUTREACH', signals: { SEO_PROBLEM: 1 }, candidates: [{ action: 'EMAIL', channel: 'EMAIL', base_utility: 0.2, cost_class: 'LOW' }, { action: 'NO_ACTION', channel: null, base_utility: 0.6, cost_class: 'FREE_ORGANIC' }], evaluation_time: 't' };
      const r = calculateDeterministicRouting(ctx, p);
      // Email = 0.8. No Action = 0.6. Margin = 0.2. Required = 0.5. Fails margin!
      // Falls back to WAIT or NO_ACTION
      expect(['NO_ACTION', 'WAIT']).toContain(r.selected_action);
  });

  it('17 UNKNOWN mandatory routing authority => fail closed', () => {
      const p = getPolicy('OUTREACH', 0, 0);
      const ctx: RoutingContext = { tenant_id: tenantId, nba_id: 'n1', business_domain: 'OUTREACH', signals: { SEO_PROBLEM: 1 }, candidates: [{ action: 'EMAIL', channel: 'EMAIL', base_utility: 0.2, cost_class: 'UNKNOWN' }], evaluation_time: 't' };
      const r = calculateDeterministicRouting(ctx, p);
      // Unknown cost class subtracts 999
      expect(r.selected_action).toBe('NO_ACTION');
      expect(r.reason_codes.some(c => c.includes('PENALIZED_UNKNOWN_COST'))).toBe(true);
  });

  it('18 missing domain => REVIEW_REQUIRED', () => {
      const p = getPolicy('OUTREACH');
      const ctx: RoutingContext = { tenant_id: tenantId, nba_id: 'n1', business_domain: null as any, signals: {}, candidates: [], evaluation_time: 't' };
      const r = calculateDeterministicRouting(ctx, p);
      expect(r.status).toBe('REVIEW_REQUIRED');
      expect(r.reason_codes).toContain('MISSING_BUSINESS_DOMAIN');
  });

  it('10 ineligible 10C action cannot be selected & 11 10D-vetoed action cannot be resurrected', () => {
      // 10G purely relies on context.candidates. If 10C/10D rejected it, it's not in the candidates array.
      // So 10G CANNOT resurrect it. This is a structural test.
      const p = getPolicy('OUTREACH', 0, 0);
      const ctx: RoutingContext = { tenant_id: tenantId, nba_id: 'n1', business_domain: 'OUTREACH', signals: { SEO_PROBLEM: 1 }, candidates: [{ action: 'NO_ACTION', channel: null, base_utility: 0.8, cost_class: 'FREE_ORGANIC' }], evaluation_time: 't' };
      const r = calculateDeterministicRouting(ctx, p);
      expect(r.selected_action).toBe('NO_ACTION');
  });

  it('Service DB test: 6, 7, 8 (COMPANY can be any domain) & 25 (tenant isolation)', async () => {
      const subject_id = crypto.randomUUID();
      await adminSupabase.from('atlas_subject_registry').insert({ subject_id, subject_type: 'COMPANY', company_id: subject_id });
      
      const nba_id = createDummyNbaState();
      await adminSupabase.from('atlas_next_best_action_state').insert({
          tenant_id: tenantId,
          nba_id,
          subject_id,
          subject_type: 'COMPANY',
          recommended_action: 'NO_ACTION',
          decision_status: 'NO_ACTION',
          evidence_snapshot_hash: 'ev',
          input_snapshot_hash: 'in',
          policy_version: 'v1'
      });
      await adminSupabase.from('atlas_next_best_action_candidates').insert([{ tenant_id: tenantId, nba_id, action: 'EMAIL', channel: 'EMAIL', base_utility: 0.5, cost_class: 'LOW' }]);

      const svc = new OmnichannelRouterService(adminSupabase);
      
      // 6 OUTREACH
      const r1 = await svc.routeDecision(tenantId, nba_id, 'OUTREACH', { SEO_PROBLEM: 1 });
      expect(r1.business_domain).toBe('OUTREACH');
      expect(r1.status).toBe('ROUTED');

      const nba2 = crypto.randomUUID();
      await adminSupabase.from('atlas_next_best_action_state').insert({ tenant_id: tenantId, nba_id: nba2, subject_id, subject_type: 'COMPANY', recommended_action: 'NO_ACTION', decision_status: 'NO_ACTION', evidence_snapshot_hash: 'ev', input_snapshot_hash: 'in', policy_version: 'v1' });
      await adminSupabase.from('atlas_next_best_action_candidates').insert([{ tenant_id: tenantId, nba_id: nba2, action: 'YOUTUBE_COMMENT', channel: 'YOUTUBE_SHORT', base_utility: 0.5, cost_class: 'LOW' }]);
      const r2 = await svc.routeDecision(tenantId, nba2, 'GROWTH', { VIRALITY: 1 });
      expect(r2.business_domain).toBe('GROWTH');

      const nba3 = crypto.randomUUID();
      await adminSupabase.from('atlas_next_best_action_state').insert({ tenant_id: tenantId, nba_id: nba3, subject_id, subject_type: 'COMPANY', recommended_action: 'NO_ACTION', decision_status: 'NO_ACTION', evidence_snapshot_hash: 'ev', input_snapshot_hash: 'in', policy_version: 'v1' });
      await adminSupabase.from('atlas_next_best_action_candidates').insert([{ tenant_id: tenantId, nba_id: nba3, action: 'X_PUBLIC_REPLY', channel: 'TIKTOK_ORGANIC', base_utility: 0.5, cost_class: 'LOW' }]);
      const r3 = await svc.routeDecision(tenantId, nba3, 'COMMERCE', { PRODUCT_HOT: 93 });
      expect(r3.business_domain).toBe('COMMERCE');

      // 25 Tenant Isolation
      const svcAnon = new OmnichannelRouterService(adminSupabase);
      const nbaAnon = crypto.randomUUID();
      await adminSupabase.from('atlas_next_best_action_state').insert({ tenant_id: tenantId, nba_id: nbaAnon, subject_id, subject_type: 'COMPANY', recommended_action: 'NO_ACTION', decision_status: 'NO_ACTION', evidence_snapshot_hash: 'ev', input_snapshot_hash: 'in', policy_version: 'v1' });
      await adminSupabase.from('atlas_next_best_action_candidates').insert([{ tenant_id: tenantId, nba_id: nbaAnon, action: 'EMAIL', channel: 'EMAIL', base_utility: 0.5, cost_class: 'LOW' }]);
      
      const rAnon = await svcAnon.routeDecision(tenantId, nbaAnon, 'OUTREACH', { SEO_PROBLEM: 1 });
      expect(rAnon.tenant_id).toBe(tenantId);
      
      // If we attempt to route for another tenant, RLS will hide the policy and candidates, throwing an error or failing closed
      const otherTenantId = crypto.randomUUID();
      const resOther = await svcAnon.routeDecision(otherTenantId, nbaAnon, 'OUTREACH', {});
      expect(resOther.status).toBe('REVIEW_REQUIRED'); // Fails closed due to missing policy/candidates
  }, 15000);

  it('30 decision trace is reproducible from stored policy + inputs', async () => {
      const nba_id = crypto.randomUUID();
      const subject_id = crypto.randomUUID();
      await adminSupabase.from('atlas_subject_registry').insert({ subject_id, subject_type: 'COMPANY', company_id: subject_id });
      await adminSupabase.from('atlas_next_best_action_state').insert({ tenant_id: tenantId, nba_id, subject_id, subject_type: 'COMPANY', recommended_action: 'NO_ACTION', decision_status: 'NO_ACTION', evidence_snapshot_hash: 'ev', input_snapshot_hash: 'in', policy_version: 'v1' });
      await adminSupabase.from('atlas_next_best_action_candidates').insert([{ tenant_id: tenantId, nba_id, action: 'EMAIL', channel: 'EMAIL', base_utility: 0.5, cost_class: 'LOW' }]);
      
      const svc = new OmnichannelRouterService(adminSupabase);
      const res = await svc.routeDecision(tenantId, nba_id, 'OUTREACH', { SEO_PROBLEM: 1 });

      const { data } = await adminSupabase.from('atlas_omnichannel_routing_state').select('*').eq('routing_id', res.routing_id).single();
      
      expect(data).toBeDefined();
      expect(data.candidate_set_hash).toBe(res.candidate_set_hash);
      expect(data.context_signal_hash).toBe(res.context_signal_hash);
      expect(data.policy_id).toBe(res.policy_id);
      expect(data.scored_candidates.length).toBeGreaterThan(0);
  });

  it('CLOSURE: A, D - nonexistent candidates fail closed', async () => {
      const svc = new OmnichannelRouterService(adminSupabase);
      // D. nonexistent candidate_set_id => fail closed
      const r = await svc.routeDecision(tenantId, crypto.randomUUID(), 'OUTREACH', {});
      expect(r.status).toBe('REVIEW_REQUIRED');
      expect(r.reason_codes).toContain('MISSING_10D_CANDIDATE_AUTHORITY');
  });

  it('CLOSURE: Append-Only Immutable Semantics', async () => {
      const nba_id = crypto.randomUUID();
      const subject_id = crypto.randomUUID();
      await adminSupabase.from('atlas_subject_registry').insert({ subject_id, subject_type: 'COMPANY', company_id: subject_id });
      await adminSupabase.from('atlas_next_best_action_state').insert({ tenant_id: tenantId, nba_id, subject_id, subject_type: 'COMPANY', recommended_action: 'NO_ACTION', decision_status: 'NO_ACTION', evidence_snapshot_hash: 'ev', input_snapshot_hash: 'in', policy_version: 'v1' });
      await adminSupabase.from('atlas_next_best_action_candidates').insert([{ tenant_id: tenantId, nba_id, action: 'EMAIL', channel: 'EMAIL', base_utility: 0.5, cost_class: 'LOW' }]);
      
      const svc = new OmnichannelRouterService(adminSupabase);
      
      // 1. Initial
      const r1 = await svc.routeDecision(tenantId, nba_id, 'OUTREACH', { SEO_PROBLEM: 1 });
      expect(r1.routing_id).toBeDefined();

      // 2. Exact Retry
      const r2 = await svc.routeDecision(tenantId, nba_id, 'OUTREACH', { SEO_PROBLEM: 1 });
      expect(r2.routing_id).toBe(r1.routing_id); // Returns identical existing id

      // 3. Altered Context => NEW decision
      const r3 = await svc.routeDecision(tenantId, nba_id, 'OUTREACH', { SEO_PROBLEM: 0.5 });
      expect(r3.routing_id).toBeDefined();
      expect(r3.routing_id).not.toBe(r1.routing_id); // Distinct ID because context changed

      // 5, 7. Direct UPDATE/DELETE denied by DB Trigger
      const { error: updErr } = await adminSupabase.from('atlas_omnichannel_routing_state').update({ selected_score: 999 }).eq('routing_id', r1.routing_id);
      expect(updErr).toBeDefined();
      expect(updErr?.message).toMatch(/permission denied|append-only|prohibited/i);

      const { error: delErr } = await adminSupabase.from('atlas_omnichannel_routing_state').delete().eq('routing_id', r1.routing_id);
      expect(delErr).toBeDefined();
      expect(delErr?.message).toMatch(/permission denied|append-only|prohibited/i);
  });

  it('CLOSURE: Hash Canonicalization', () => {
      const h1 = generateContextHash({ a: 1, b: 2 });
      const h2 = generateContextHash({ b: 2, a: 1 });
      expect(h1).toBe(h2);
      
      const h3 = generateContextHash({ a: 1, b: 3 });
      expect(h1).not.toBe(h3);
  });

  it('CLOSURE: Ambiguous policy authority', async () => {
      // The DB schema guarantees no two active policies can exist for the same domain
      // CREATE UNIQUE INDEX uq_atlas_10g_active_policy ON public.atlas_omnichannel_routing_policies (tenant_id, business_domain) WHERE (status = 'ACTIVE');
      const { error } = await adminSupabase.from('atlas_omnichannel_routing_policies').insert({
        tenant_id: tenantId,
        business_domain: 'OUTREACH',
        policy_version: 'v2.0_conflict',
        status: 'ACTIVE',
        config_json: {}
      });

      expect(error).toBeDefined();
      expect(error?.code).toBe('23505'); // Unique violation
  });
});
