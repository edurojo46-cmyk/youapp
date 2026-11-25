import { createHash } from 'crypto';
import { 
  AtlasOmnichannelRoutingPolicy, 
  AtlasOmnichannelRoutingState, 
  AtlasNBAAction, 
  Atlas10GBusinessDomain 
} from '../atlasBrain/types';

export interface RoutingCandidate {
  action: AtlasNBAAction;
  channel: string | null;
  base_utility: number; // Derived from 10D or basic math
  cost_class: string | null;
}

export interface RoutingContext {
  tenant_id: string;
  nba_id: string;
  business_domain: Atlas10GBusinessDomain | null;
  signals: Record<string, number | string | boolean>;
  candidates: RoutingCandidate[];
  evaluation_time: string;
}

export function generateCandidateSetHash(candidates: RoutingCandidate[]): string {
  const sorted = [...candidates].sort((a, b) => a.action.localeCompare(b.action) || (a.channel || '').localeCompare(b.channel || ''));
  return createHash('sha256').update(JSON.stringify(sorted)).digest('hex');
}

export function generateContextHash(signals: Record<string, any>): string {
  const sorted = JSON.stringify(signals, Object.keys(signals).sort());
  return createHash('sha256').update(sorted).digest('hex');
}

export function calculateDeterministicRouting(
  context: RoutingContext,
  policy: AtlasOmnichannelRoutingPolicy | null
): AtlasOmnichannelRoutingState {
  
  const reason_codes: string[] = [];
  
  if (!context.business_domain) {
      return fallbackRoutingState(context, 'REVIEW_REQUIRED', ['MISSING_BUSINESS_DOMAIN']);
  }
  
  if (!policy) {
      return fallbackRoutingState(context, 'REVIEW_REQUIRED', ['MISSING_OR_INACTIVE_POLICY']);
  }

  const scored_candidates: Array<{ action: AtlasNBAAction, channel: string | null, score: number }> = [];
  
  let hasNoAction = false;
  let hasWait = false;
  
  // 1. Calculate scores
  for (const candidate of context.candidates) {
    if (candidate.action === 'NO_ACTION') hasNoAction = true;
    if (candidate.action === 'WAIT') hasWait = true;
    
    let score = candidate.base_utility;
    
    // Apply signal weights
    if (policy.config_json.signal_weights) {
      for (const [signal, weight] of Object.entries(policy.config_json.signal_weights)) {
        if (context.signals[signal] !== undefined && typeof context.signals[signal] === 'number') {
          score += (context.signals[signal] as number) * weight;
        }
      }
    }
    
    // Apply channel weights
    if (policy.config_json.channel_weights && candidate.channel) {
       score += (policy.config_json.channel_weights[candidate.channel] || 0);
    }
    
    // Apply cost penalties
    if (policy.config_json.cost_penalties && candidate.cost_class) {
       score -= (policy.config_json.cost_penalties[candidate.cost_class] || 0);
    }

    // Fail-closed UNKNOWN
    if (candidate.cost_class === 'UNKNOWN') {
       score -= 999;
       reason_codes.push(`PENALIZED_UNKNOWN_COST_${candidate.action}`);
    }

    scored_candidates.push({
      action: candidate.action,
      channel: candidate.channel,
      score: Number(score.toFixed(4))
    });
  }
  
  // Ensure NO_ACTION is present
  if (!hasNoAction) {
    scored_candidates.push({ action: 'NO_ACTION', channel: null, score: 0.08 }); // Default low baseline
  }

  // 2. Sort candidates descending
  scored_candidates.sort((a, b) => b.score - a.score);
  
  const minScore = policy.config_json.min_action_score ?? 0;
  const reqMargin = policy.config_json.required_margin_over_no_action ?? 0;
  
  let best = scored_candidates[0];
  let noActionScore = scored_candidates.find(c => c.action === 'NO_ACTION')?.score || 0;
  
  // 3. Margin and Threshold checks
  if (best.action !== 'NO_ACTION' && best.action !== 'WAIT') {
     if (best.score < minScore) {
       reason_codes.push('BELOW_MIN_SCORE');
       best = scored_candidates.find(c => c.action === 'NO_ACTION')!;
     } else if ((best.score - noActionScore) < reqMargin) {
       reason_codes.push('INSUFFICIENT_MARGIN');
       best = scored_candidates.find(c => c.action === 'WAIT') || scored_candidates.find(c => c.action === 'NO_ACTION')!;
     }
  }

  reason_codes.push(`SELECTED_${best.action}`);

  let status: 'ROUTED' | 'HOLD' | 'REVIEW_REQUIRED' | 'FAILED' = 'ROUTED';
  if (best.action === 'HUMAN_REVIEW' || best.action === 'REVIEW_REQUIRED') status = 'REVIEW_REQUIRED';
  if (best.action === 'WAIT') status = 'HOLD';
  if (best.action === 'NO_ACTION') status = 'ROUTED';

  return {
    tenant_id: context.tenant_id,
    nba_id: context.nba_id,
    business_domain: context.business_domain,
    policy_id: policy.policy_id!,
    candidate_set_hash: generateCandidateSetHash(context.candidates),
    context_signal_hash: generateContextHash(context.signals),
    selected_action: best.action,
    selected_channel: best.channel,
    selected_score: best.score,
    scored_candidates,
    reason_codes: Array.from(new Set(reason_codes)),
    status,
    evaluated_at: context.evaluation_time
  };
}

function fallbackRoutingState(context: RoutingContext, action: AtlasNBAAction, reason_codes: string[]): AtlasOmnichannelRoutingState {
  return {
    tenant_id: context.tenant_id,
    nba_id: context.nba_id,
    business_domain: context.business_domain || 'OUTREACH', // default just for schema if missing
    policy_id: '00000000-0000-0000-0000-000000000000',
    candidate_set_hash: generateCandidateSetHash(context.candidates),
    context_signal_hash: generateContextHash(context.signals),
    selected_action: action,
    selected_channel: null,
    selected_score: 0,
    scored_candidates: [],
    reason_codes,
    status: action === 'REVIEW_REQUIRED' ? 'REVIEW_REQUIRED' : 'FAILED',
    evaluated_at: context.evaluation_time
  };
}
