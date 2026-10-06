import {
  AtlasBehaviorEvent,
  AtlasInterestState,
  AtlasIntentState,
  AtlasPersonContext,
  AtlasPersonProductFitState,
  AtlasProduct,
  AtlasProductFitLevel,
  AtlasProductFitPolicy,
  AtlasProductOffer
} from './types';

function determineFitLevel(score: number, thresholds: any): AtlasProductFitLevel {
  if (score >= thresholds.VERY_HIGH) return 'VERY_HIGH';
  if (score >= thresholds.HIGH) return 'HIGH';
  if (score >= thresholds.MEDIUM) return 'MEDIUM';
  if (score >= thresholds.LOW) return 'LOW';
  return 'NO_FIT'; // Below LOW threshold
}

function createInputSnapshotHash(
  personId: string,
  interestVersion: string,
  intentVersion: string,
  events: AtlasBehaviorEvent[],
  offerVersion: string,
  contextHash: string,
  policyVersion: string,
  evalTime: string
): string {
  const eventHashes = events.map(e => e.id).sort().join(',');
  const raw = `${personId}|${interestVersion}|${intentVersion}|${eventHashes}|${offerVersion}|${contextHash}|${policyVersion}|${evalTime}`;
  
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const char = raw.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

function createContextHash(context: AtlasPersonContext): string {
  const raw = `loc:${context.location_ref || 'null'}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const char = raw.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

export function calculateProductFit(
  tenant_id: string,
  person_id: string,
  product: AtlasProduct,
  offer: AtlasProductOffer,
  interest: AtlasInterestState | null,
  intent: AtlasIntentState | null,
  events: AtlasBehaviorEvent[],
  context: AtlasPersonContext,
  policy: AtlasProductFitPolicy,
  evaluation_time: string
): AtlasPersonProductFitState {

  const reason_codes: string[] = [];
  const coverage: Record<string, boolean> = {
    price_fit: false,
    location_fit: false
  };

  const evalDate = new Date(evaluation_time).getTime();

  // ==========================================
  // HARD GATES & VETOES
  // ==========================================

  // 1. Temporal Expiry
  if (offer.expires_at) {
    if (new Date(offer.expires_at).getTime() < evalDate) {
      reason_codes.push('VETO_OFFER_EXPIRED');
      return createTerminalState('NO_FIT', 0, reason_codes, coverage, policy.policy_version, events, context, offer, evaluation_time, tenant_id, person_id, product.product_id);
    }
  }

  // 2. Availability Status
  if (offer.availability_status === 'SOLD_OUT' || offer.availability_status === 'UNAVAILABLE' || product.status !== 'ACTIVE') {
    reason_codes.push('VETO_OFFER_UNAVAILABLE');
    return createTerminalState('NO_FIT', 0, reason_codes, coverage, policy.policy_version, events, context, offer, evaluation_time, tenant_id, person_id, product.product_id);
  }

  // 3. Geographic Rules
  let geoScore = 1.0;
  if (offer.geography_mode === 'LOCATION_REQUIRED') {
    if (!context.location_ref) {
      reason_codes.push('UNKNOWN_LOCATION_BUT_REQUIRED');
      return createTerminalState('UNKNOWN', 0, reason_codes, coverage, policy.policy_version, events, context, offer, evaluation_time, tenant_id, person_id, product.product_id);
    }
    if (offer.location_ref && context.location_ref !== offer.location_ref) {
      reason_codes.push('VETO_LOCATION_MISMATCH');
      return createTerminalState('NO_FIT', 0, reason_codes, coverage, policy.policy_version, events, context, offer, evaluation_time, tenant_id, person_id, product.product_id);
    }
    coverage.location_fit = true;
  } else if (offer.geography_mode === 'LOCATION_PREFERRED') {
    if (context.location_ref && offer.location_ref) {
      coverage.location_fit = true;
      if (context.location_ref !== offer.location_ref) {
        reason_codes.push('LOCATION_MISMATCH_PENALTY');
        geoScore = 0.5; // Penalty
      } else {
        reason_codes.push('LOCATION_MATCH');
      }
    }
  }

  // 4. Missing Mandatory Evidence (Interest/Intent)
  if (!interest && !intent) {
    reason_codes.push('INSUFFICIENT_EVIDENCE');
    return createTerminalState('UNKNOWN', 0, reason_codes, coverage, policy.policy_version, events, context, offer, evaluation_time, tenant_id, person_id, product.product_id);
  }

  // ==========================================
  // COMPONENT SCORING
  // ==========================================
  
  let totalScore = 0;
  const compScores: Record<string, number> = {};

  // Affinity (Interest)
  let affinityScore = 0;
  if (interest) {
    if (interest.interest_level === 'HIGH') affinityScore = policy.weights_json.ProductAffinity;
    else if (interest.interest_level === 'MEDIUM') affinityScore = policy.weights_json.ProductAffinity * 0.6;
    else if (interest.interest_level === 'LOW') affinityScore = policy.weights_json.ProductAffinity * 0.2;
    reason_codes.push(`AFFINITY_${interest.interest_level}`);
  }
  compScores['Affinity'] = affinityScore;
  totalScore += affinityScore;

  // Recent Intent
  let intentScore = 0;
  if (intent) {
    if (intent.intent_level === 'HIGH') intentScore = policy.weights_json.RecentIntent;
    else if (intent.intent_level === 'MEDIUM') intentScore = policy.weights_json.RecentIntent * 0.6;
    else if (intent.intent_level === 'LOW') intentScore = policy.weights_json.RecentIntent * 0.2;
    reason_codes.push(`INTENT_${intent.intent_level}`);
  }
  compScores['Intent'] = intentScore;
  totalScore += intentScore;

  // Need Evidence
  // If we have actual events mapped to this specific product_ref
  const productEvents = events.filter(e => e.product_ref === product.product_id);
  let evidenceScore = 0;
  if (productEvents.length > 0) {
    evidenceScore = policy.weights_json.NeedEvidence;
    reason_codes.push('PRODUCT_EVIDENCE_FOUND');
  } else if (events.length > 0) {
    evidenceScore = policy.weights_json.NeedEvidence * 0.5; // Topic level evidence
    reason_codes.push('TOPIC_EVIDENCE_FOUND');
  }
  compScores['Evidence'] = evidenceScore;
  totalScore += evidenceScore;

  // Context Compatibility
  let contextScore = policy.weights_json.ContextCompatibility * geoScore;
  compScores['Context'] = contextScore;
  totalScore += contextScore;

  // Prior Engagement
  let priorScore = 0;
  if (events.length >= 3) {
    priorScore = policy.weights_json.PriorEngagement;
    reason_codes.push('HIGH_PRIOR_ENGAGEMENT');
  } else if (events.length > 0) {
    priorScore = policy.weights_json.PriorEngagement * 0.5;
  }
  compScores['PriorEngagement'] = priorScore;
  totalScore += priorScore;

  // Negative Evidence Penalty
  const negEvents = events.filter(e => e.polarity === 'NEGATIVE');
  if (negEvents.length > 0) {
    const penalty = negEvents.length * 15;
    totalScore -= penalty;
    reason_codes.push('NEGATIVE_EVIDENCE_PENALTY');
  }

  // Freshness
  let freshnessScore = 0;
  if (intent && intent.last_signal_at) {
    const ageDays = (evalDate - new Date(intent.last_signal_at).getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays <= 2) {
      freshnessScore = policy.weights_json.Freshness;
      reason_codes.push('HIGH_FRESHNESS');
    } else if (ageDays <= 7) {
      freshnessScore = policy.weights_json.Freshness * 0.5;
    } else {
      reason_codes.push('STALE_INTENT_PENALTY');
    }
  }
  compScores['Freshness'] = freshnessScore;
  totalScore += freshnessScore;


  // ==========================================
  // FINAL SCORE & SENSITIVE GATES
  // ==========================================
  
  // As explicitly required: We DO NOT infer affordability.
  if (offer.price !== null) {
    coverage.price_fit = false; // We don't have price data on the person yet
    reason_codes.push('PRICE_COMPATIBILITY_UNKNOWN');
  }

  // Verify Sensitive Attributes (simulated by checking if category is sensitive)
  const sensitiveCategories = ['POLITICS', 'RELIGION', 'HEALTH', 'RACE', 'SEXUAL_ORIENTATION'];
  if (sensitiveCategories.includes(product.category.toUpperCase())) {
    return createTerminalState('NO_FIT', 0, ['SENSITIVE_TOPIC_REJECTED'], coverage, policy.policy_version, events, context, offer, evaluation_time, tenant_id, person_id, product.product_id);
  }

  // Calculate Level
  const finalLevel = determineFitLevel(totalScore, policy.thresholds_json);

  const contextHash = createContextHash(context);
  const snapshotHash = createInputSnapshotHash(
    person_id,
    interest?.evidence_snapshot_hash || 'none',
    intent?.evidence_snapshot_hash || 'none',
    events,
    offer.offer_version,
    contextHash,
    policy.policy_version,
    evaluation_time
  );

  return {
    tenant_id,
    person_id,
    product_id: product.product_id,
    offer_id: offer.offer_id,
    context_hash: contextHash,
    fit_score: Number(totalScore.toFixed(2)),
    fit_level: finalLevel,
    component_scores: compScores,
    reason_codes,
    coverage,
    evidence_count: events.length,
    policy_version: policy.policy_version,
    input_snapshot_hash: snapshotHash,
    evidence_snapshot_hash: snapshotHash, // Reused in this context
    calculated_at: evaluation_time,
    expires_at: null // V1 doesn't enforce strict DB TTL, but eval engine checks offer expiry
  };
}

function createTerminalState(
  level: AtlasProductFitLevel,
  score: number,
  reason_codes: string[],
  coverage: Record<string, boolean>,
  policyVersion: string,
  events: AtlasBehaviorEvent[],
  context: AtlasPersonContext,
  offer: AtlasProductOffer,
  evalTime: string,
  tenant_id: string,
  person_id: string,
  product_id: string
): AtlasPersonProductFitState {
  const contextHash = createContextHash(context);
  const snapshotHash = createInputSnapshotHash(
    person_id,
    'none', 'none', events, offer.offer_version, contextHash, policyVersion, evalTime
  );

  return {
    tenant_id,
    person_id,
    product_id,
    offer_id: offer.offer_id,
    context_hash: contextHash,
    fit_score: score,
    fit_level: level,
    component_scores: {},
    reason_codes,
    coverage,
    evidence_count: events.length,
    policy_version: policyVersion,
    input_snapshot_hash: snapshotHash,
    evidence_snapshot_hash: snapshotHash,
    calculated_at: evalTime,
    expires_at: null
  };
}
