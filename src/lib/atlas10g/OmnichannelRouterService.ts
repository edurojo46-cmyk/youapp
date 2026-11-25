import { SupabaseClient } from '@supabase/supabase-js';
import { 
  AtlasOmnichannelRoutingPolicy, 
  AtlasOmnichannelRoutingState, 
  Atlas10GBusinessDomain 
} from '../atlasBrain/types';
import { 
  calculateDeterministicRouting, 
  RoutingCandidate, 
  RoutingContext,
  generateContextHash
} from './DeterministicRoutingEngine';

export class OmnichannelRouterService {
  constructor(private supabase: SupabaseClient) {}

  async routeDecision(
    tenant_id: string,
    nba_id: string,
    business_domain: Atlas10GBusinessDomain,
    signals: Record<string, any>
  ): Promise<AtlasOmnichannelRoutingState> {
    
    // 1. Fetch Active Policy for the domain (Fail closed if ambiguous)
    const { data: policyDataList, error: policyError } = await this.supabase
      .from('atlas_omnichannel_routing_policies')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('business_domain', business_domain)
      .eq('status', 'ACTIVE');

    if (policyError) {
      throw new Error(`Failed to fetch routing policy: ${policyError.message}`);
    }

    if (!policyDataList || policyDataList.length === 0) {
      // Missing active policy
      return this.failClosed(tenant_id, nba_id, business_domain, signals, [], '00000000-0000-0000-0000-000000000000', ['MISSING_OR_INACTIVE_POLICY']);
    }

    if (policyDataList.length > 1) {
      // Ambiguous policy authority
      return this.failClosed(tenant_id, nba_id, business_domain, signals, [], '00000000-0000-0000-0000-000000000000', ['AMBIGUOUS_POLICY_AUTHORITY']);
    }

    const policyData = policyDataList[0];

    // 2. Fetch authoritative 10D candidate set
    const { data: candidatesData, error: candidatesError } = await this.supabase
      .from('atlas_next_best_action_candidates')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('nba_id', nba_id);

    if (candidatesError) {
      throw new Error(`Failed to fetch 10D candidates: ${candidatesError.message}`);
    }

    if (!candidatesData || candidatesData.length === 0) {
      return this.failClosed(tenant_id, nba_id, business_domain, signals, [], policyData.policy_id, ['MISSING_10D_CANDIDATE_AUTHORITY']);
    }

    const candidates: RoutingCandidate[] = candidatesData.map(c => ({
      action: c.action,
      channel: c.channel,
      base_utility: Number(c.base_utility),
      cost_class: c.cost_class
    }));

    const context: RoutingContext = {
      tenant_id,
      nba_id,
      business_domain,
      signals,
      candidates,
      evaluation_time: new Date().toISOString()
    };

    // 3. Score and Route deterministically
    const decision = calculateDeterministicRouting(context, policyData as AtlasOmnichannelRoutingPolicy);

    // 4. Idempotency Check & Persist Decision
    // If the exact same decision context exists, return it instead of inserting.
    const { data: existingData } = await this.supabase
      .from('atlas_omnichannel_routing_state')
      .select('*')
      .eq('tenant_id', decision.tenant_id)
      .eq('nba_id', decision.nba_id)
      .eq('policy_id', decision.policy_id)
      .eq('candidate_set_hash', decision.candidate_set_hash)
      .eq('context_signal_hash', decision.context_signal_hash)
      .maybeSingle();

    if (existingData) {
      return existingData as AtlasOmnichannelRoutingState;
    }

    // Insert new immutable decision
    const { data: insertData, error: insertErr } = await this.supabase
      .from('atlas_omnichannel_routing_state')
      .insert({
        tenant_id: decision.tenant_id,
        nba_id: decision.nba_id,
        business_domain: decision.business_domain,
        policy_id: decision.policy_id,
        candidate_set_hash: decision.candidate_set_hash,
        context_signal_hash: decision.context_signal_hash,
        selected_action: decision.selected_action,
        selected_channel: decision.selected_channel,
        selected_score: decision.selected_score,
        scored_candidates: decision.scored_candidates,
        reason_codes: decision.reason_codes,
        status: decision.status,
        evaluated_at: decision.evaluated_at
      })
      .select()
      .single();

    if (insertErr) {
      // Handle race condition: if it was inserted right after our select, fetch it.
      if (insertErr.code === '23505') { // unique violation
        const { data: raceData } = await this.supabase
          .from('atlas_omnichannel_routing_state')
          .select('*')
          .eq('tenant_id', decision.tenant_id)
          .eq('nba_id', decision.nba_id)
          .eq('policy_id', decision.policy_id)
          .eq('candidate_set_hash', decision.candidate_set_hash)
          .eq('context_signal_hash', decision.context_signal_hash)
          .single();
        if (raceData) return raceData as AtlasOmnichannelRoutingState;
      }
      throw new Error(`Failed to persist routing state: ${insertErr.message}`);
    }

    return {
      ...decision,
      routing_id: insertData.routing_id,
      created_at: insertData.created_at
    };
  }

  private failClosed(
    tenant_id: string,
    nba_id: string,
    business_domain: Atlas10GBusinessDomain,
    signals: Record<string, any>,
    candidates: RoutingCandidate[],
    policy_id: string,
    reason_codes: string[]
  ): AtlasOmnichannelRoutingState {
     return {
        tenant_id,
        nba_id,
        business_domain,
        policy_id,
        candidate_set_hash: '0000000000000000000000000000000000000000000000000000000000000000',
        context_signal_hash: generateContextHash(signals),
        selected_action: 'REVIEW_REQUIRED',
        selected_channel: null,
        selected_score: 0,
        scored_candidates: [],
        reason_codes,
        status: 'REVIEW_REQUIRED',
        evaluated_at: new Date().toISOString()
     };
  }
}
