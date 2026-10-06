import { SupabaseClient } from '@supabase/supabase-js';
import { calculateNextBestAction, NBAEngineInputs } from './NextBestActionEngine';

/**
 * Orchestrates fetching inputs, computing NBA via engine, and saving deterministically.
 */
export async function determineNextBestAction(
  supabase: SupabaseClient,
  tenant_id: string,
  subject_id: string,
  subject_type: 'PERSON' | 'COMPANY',
  product_id?: string
) {
  const maxRetries = 5;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await executeNBACalculation(supabase, tenant_id, subject_id, subject_type, product_id);
    } catch (error: any) {
      if (error.message && error.message.includes('Concurrency conflict')) {
        if (attempt === maxRetries) {
          throw new Error(`Failed to determine NBA after ${maxRetries} attempts due to concurrency conflicts.`);
        }
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, 50 * Math.pow(2, attempt - 1)));
      } else {
        throw error;
      }
    }
  }
}

async function executeNBACalculation(
  supabase: SupabaseClient,
  tenant_id: string,
  subject_id: string,
  subject_type: 'PERSON' | 'COMPANY',
  product_id?: string
) {
  // Fetch active policy
  const { data: policyData, error: policyError } = await supabase
    .from('atlas_next_best_action_policies')
    .select('*')
    .eq('tenant_id', tenant_id)
    .eq('status', 'ACTIVE')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (policyError || !policyData) {
    throw new Error('Active Next Best Action policy not found');
  }

  // Fetch costs
  const { data: costsData } = await supabase
    .from('atlas_action_cost_registry')
    .select('*')
    .eq('tenant_id', tenant_id);

  // Fetch channel eligibility
  const { data: eligibilityData } = await supabase
    .from('atlas_channel_eligibility')
    .select('*')
    .eq('subject_id', subject_id);

  let fitData = null;
  let intentData = null;
  let interestData = null;
  let decisionData = null;

  if (subject_type === 'PERSON') {
    const { data: personData } = await supabase.from('atlas_subject_registry').select('person_id').eq('subject_id', subject_id).single();
    const pid = personData?.person_id;

    if (pid && product_id) {
      const { data: f } = await supabase.from('atlas_person_product_fit_state')
        .select('*')
        .eq('tenant_id', tenant_id)
        .eq('person_id', pid)
        .eq('product_id', product_id)
        .single();
      fitData = f;

      const { data: i } = await supabase.from('atlas_person_intent_state')
        .select('*')
        .eq('tenant_id', tenant_id)
        .eq('person_id', pid)
        .eq('product_ref', product_id)
        .single();
      intentData = i;
    }
  } else if (subject_type === 'COMPANY') {
    const { data: companyData } = await supabase.from('atlas_subject_registry').select('company_id').eq('subject_id', subject_id).single();
    const cid = companyData?.company_id;

    if (cid) {
      const { data: d } = await supabase.from('atlas_contact_decisions')
        .select('*')
        .eq('candidate_id', cid)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      decisionData = d;
    }
  }

  const inputs: NBAEngineInputs = {
    tenant_id,
    subject_id,
    subject_type,
    policy: policyData as any,
    costs: costsData as any || [],
    eligibility: eligibilityData as any || [],
    product_fit: fitData,
    intent: intentData,
    interest: interestData,
    company_decision: decisionData,
    evaluation_time: new Date().toISOString()
  };

  console.log('Engine Inputs:', JSON.stringify(inputs, null, 2));

  const nbaState = calculateNextBestAction(inputs);

  // Attempt atomic UPSERT
  const { error: upsertErr } = await supabase
    .from('atlas_next_best_action_state')
    .upsert({
      tenant_id: nbaState.tenant_id,
      subject_id: nbaState.subject_id,
      subject_type: nbaState.subject_type,
      product_id: nbaState.product_id,
      offer_id: nbaState.offer_id,
      opportunity_id: nbaState.opportunity_id,
      recommended_action: nbaState.recommended_action,
      recommended_channel: nbaState.recommended_channel,
      decision_status: nbaState.decision_status,
      priority_score: nbaState.priority_score,
      expected_value: nbaState.expected_value,
      estimated_action_cost: nbaState.estimated_action_cost,
      expected_net_value: nbaState.expected_net_value,
      reason_codes: nbaState.reason_codes,
      alternative_actions: nbaState.alternative_actions,
      channel_eligibility_snapshot_id: nbaState.channel_eligibility_snapshot_id,
      upstream_decision_ref: nbaState.upstream_decision_ref,
      product_fit_ref: nbaState.product_fit_ref,
      evidence_snapshot_hash: nbaState.evidence_snapshot_hash,
      input_snapshot_hash: nbaState.input_snapshot_hash,
      policy_version: nbaState.policy_version,
      cost_version: nbaState.cost_version,
      evaluated_at: nbaState.evaluated_at,
      expires_at: nbaState.expires_at
    }, {
      onConflict: 'tenant_id, subject_id, product_id, offer_id, opportunity_id'
    });

  if (upsertErr) {
    throw new Error(`Supabase Upsert failed: ${upsertErr.message}`);
  }

  return nbaState;
}
