import { createHash } from 'crypto';
import { 
  AtlasNextBestActionState, 
  AtlasNBAAction, 
  AtlasNBAStatus, 
  AtlasActionCostRegistry, 
  AtlasNextBestActionPolicy,
  AtlasPersonProductFitState,
  AtlasInterestState,
  AtlasIntentState,
  AtlasContactDecision,
  AtlasChannelEligibility
} from './types';

// Deterministic hashing helper
function generateSnapshotHash(components: Record<string, any>): string {
  const sorted = JSON.stringify(components, Object.keys(components).sort());
  return createHash('sha256').update(sorted).digest('hex');
}

export interface NBAEngineInputs {
  tenant_id: string;
  subject_id: string;
  subject_type: 'PERSON' | 'COMPANY';
  
  policy: AtlasNextBestActionPolicy;
  costs: AtlasActionCostRegistry[];
  eligibility: AtlasChannelEligibility[];
  
  // Person specific
  product_fit?: AtlasPersonProductFitState | null;
  interest?: AtlasInterestState | null;
  intent?: AtlasIntentState | null;
  
  // Company specific
  company_decision?: AtlasContactDecision | null;
  
  evaluation_time: string;
}

export function calculateNextBestAction(inputs: NBAEngineInputs): AtlasNextBestActionState {
  const { tenant_id, subject_id, subject_type, policy, costs, eligibility, product_fit, interest, intent, company_decision, evaluation_time } = inputs;
  const reason_codes: string[] = [];

  // 1. HARD GATES (Company)
  if (subject_type === 'COMPANY' && company_decision) {
    if (company_decision.decision === 'DO_NOT_CONTACT') {
      reason_codes.push('COMPANY_VETO_DO_NOT_CONTACT');
      return createNBAState(inputs, 'NO_ACTION', null, 'NO_ACTION', 0, reason_codes, []);
    }
  }

  // 1. HARD GATES (Person)
  if (subject_type === 'PERSON') {
    if (product_fit && product_fit.fit_level === 'NO_FIT') {
      reason_codes.push('PERSON_VETO_NO_FIT');
      return createNBAState(inputs, 'NO_ACTION', null, 'NO_ACTION', 0, reason_codes, []);
    }
    if (product_fit && product_fit.expires_at && new Date(product_fit.expires_at).getTime() < new Date(evaluation_time).getTime()) {
      reason_codes.push('PERSON_VETO_EXPIRED_FIT');
      return createNBAState(inputs, 'NO_ACTION', null, 'NO_ACTION', 0, reason_codes, []);
    }
  }

  // 2. IDENTIFY CANDIDATE ACTIONS
  // Baseline action is NO_ACTION
  const candidates: Array<{ action: AtlasNBAAction, channel: string | null, score: number, cost_class: string | null }> = [];
  
  // Always allow non-contact actions as baseline
  candidates.push({ action: 'NO_ACTION', channel: null, score: 10, cost_class: 'FREE_ORGANIC' });
  candidates.push({ action: 'OBSERVE', channel: null, score: 5, cost_class: 'FREE_ORGANIC' });

  // Add WAIT if intent is stale or product offer starts in future (simplification: if fit is HIGH but intent is LOW)
  if (subject_type === 'PERSON' && product_fit && product_fit.fit_level === 'VERY_HIGH' && intent?.intent_level === 'LOW') {
    candidates.push({ action: 'WAIT', channel: null, score: 100, cost_class: 'FREE_ORGANIC' });
    reason_codes.push('WAIT_RECOMMENDED_STALE_INTENT');
  }

  // Filter 10C eligible actions
  const eligibleChannels = eligibility.filter(e => e.eligibility_status === 'ELIGIBLE');
  
  if (eligibleChannels.length === 0) {
    reason_codes.push('NO_ELIGIBLE_CHANNELS');
    // We only have the non-contact candidates
  } else {
    // 3. RANKING LOGIC
    let baseScore = 0;

    if (subject_type === 'PERSON') {
      // Score based on PERSON rules
      if (product_fit) {
        if (product_fit.fit_level === 'VERY_HIGH') baseScore += policy.ranking_weights_json.PERSON.FitWeight;
        else if (product_fit.fit_level === 'HIGH') baseScore += policy.ranking_weights_json.PERSON.FitWeight * 0.7;
        else if (product_fit.fit_level === 'MEDIUM') baseScore += policy.ranking_weights_json.PERSON.FitWeight * 0.3;
      }
      if (intent) {
        if (intent.intent_level === 'HIGH') baseScore += policy.ranking_weights_json.PERSON.IntentWeight;
        else if (intent.intent_level === 'MEDIUM') baseScore += policy.ranking_weights_json.PERSON.IntentWeight * 0.5;
      }
    } else if (subject_type === 'COMPANY') {
      // Score based on COMPANY rules
      if (company_decision?.decision === 'CONTACT_NOW') {
        baseScore += policy.ranking_weights_json.COMPANY.DecisionWeight;
        if (company_decision.priority_score) {
           baseScore += (company_decision.priority_score * policy.ranking_weights_json.COMPANY.PriorityWeight);
        }
      }
    }

    // Evaluate each eligible action against cost penalties
    for (const ec of eligibleChannels) {
      const costEntry = costs.find(c => c.action_type === ec.action_type && c.channel === ec.channel);
      const costClass = costEntry ? costEntry.cost_class : 'UNKNOWN';
      
      let penalty = 0;
      if (policy.cost_penalties_json[costClass] !== undefined) {
        penalty = policy.cost_penalties_json[costClass];
      } else if (costClass === 'UNKNOWN') {
        // Unknown costs are dangerous, heavily penalize or review
        penalty = 999; 
        reason_codes.push(`UNKNOWN_COST_PENALTY_${ec.action_type}`);
      }

      const finalScore = baseScore - penalty;
      candidates.push({
        action: ec.action_type,
        channel: ec.channel,
        score: finalScore,
        cost_class: costClass
      });
    }
  }

  // Handle REVIEW_REQUIRED from COMPANY
  if (subject_type === 'COMPANY' && company_decision?.decision === 'REVIEW_REQUIRED') {
    // Unless an eligible action outscores the review, push REVIEW_REQUIRED
    candidates.push({ action: 'HUMAN_REVIEW', channel: null, score: 50, cost_class: 'FREE_ORGANIC' });
    reason_codes.push('COMPANY_REVIEW_REQUIRED');
  }

  // 4. SORT CANDIDATES
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Tie breaker: if scores are equal, lower cost wins.
    // For V1, we rely on the penalty having already reduced the score. If score is exactly equal, 
    // it implies the net value is the same. We can tie-break by cost class string or just favor NO_ACTION.
    if (a.action === 'NO_ACTION') return -1;
    if (b.action === 'NO_ACTION') return 1;
    return 0;
  });

  const best = candidates[0];
  let decision_status: AtlasNBAStatus = 'DO_NOW';
  
  if (best.action === 'NO_ACTION') decision_status = 'NO_ACTION';
  else if (best.action === 'WAIT') decision_status = 'WAIT';
  else if (best.action === 'OBSERVE') decision_status = 'OBSERVE';
  else if (best.action === 'HUMAN_REVIEW' || best.action === 'REVIEW_REQUIRED') decision_status = 'REVIEW_REQUIRED';

  if (best.cost_class === 'UNKNOWN') {
    // If unknown cost somehow won (e.g. base score was huge), downgrade to review
    if (decision_status === 'DO_NOW') decision_status = 'REVIEW_REQUIRED';
  }

  const alternative_actions = candidates.slice(1).map(c => ({
    action: c.action,
    channel: c.channel || 'NONE',
    score: c.score
  }));

  reason_codes.push(`SELECTED_${best.action}`);

  return createNBAState(
    inputs, 
    best.action, 
    best.channel, 
    decision_status, 
    Math.max(0, best.score), // priority_score
    reason_codes,
    alternative_actions,
    best.cost_class as any
  );
}

function createNBAState(
  inputs: NBAEngineInputs,
  action: AtlasNBAAction,
  channel: string | null,
  status: AtlasNBAStatus,
  priority_score: number,
  reason_codes: string[],
  alternatives: any[],
  estimated_action_cost: any = null
): AtlasNextBestActionState {
  
  // Combine all authoritative hashes
  const input_snapshot_hash = generateSnapshotHash({
    policy_version: inputs.policy.policy_version,
    subject_id: inputs.subject_id,
    fit_hash: inputs.product_fit?.evidence_snapshot_hash || null,
    intent_hash: inputs.intent?.evidence_snapshot_hash || null,
    interest_hash: inputs.interest?.evidence_snapshot_hash || null,
    eligibility_count: inputs.eligibility.length,
    decision_hash: inputs.company_decision?.decision_hash || null,
    evaluation_time: inputs.evaluation_time
  });

  return {
    tenant_id: inputs.tenant_id,
    subject_id: inputs.subject_id,
    subject_type: inputs.subject_type,
    product_id: inputs.product_fit?.product_id || null,
    offer_id: inputs.product_fit?.offer_id || null,
    opportunity_id: null,
    
    recommended_action: action,
    recommended_channel: channel,
    decision_status: status,
    
    priority_score,
    expected_value: null, // V1 explicitly null
    estimated_action_cost: estimated_action_cost,
    expected_net_value: null, // V1 explicitly null
    
    reason_codes: Array.from(new Set(reason_codes)),
    alternative_actions: alternatives,
    
    channel_eligibility_snapshot_id: null, // Could be derived if 10C generates snapshot IDs
    upstream_decision_ref: inputs.company_decision?.id || null,
    product_fit_ref: inputs.product_fit?.id || null,
    evidence_snapshot_hash: input_snapshot_hash, // the aggregated evidence
    input_snapshot_hash,
    
    policy_version: inputs.policy.policy_version,
    cost_version: inputs.costs[0]?.cost_version || null,
    evaluated_at: inputs.evaluation_time,
    expires_at: null
  };
}
