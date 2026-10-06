import {
  AtlasBehaviorEvent,
  AtlasInterestIntentLevel,
  AtlasInterestState,
  AtlasIntentState,
  AtlasScoringPolicy
} from './types';

// Deterministic hashing helper could be added here if needed for evidence_snapshot_hash
function createSnapshotHash(events: AtlasBehaviorEvent[], evalTime: string): string {
  // Simple hash for demonstration. In production, use crypto hash.
  const joined = events.map(e => e.id).sort().join(',') + '|' + evalTime;
  let hash = 0;
  for (let i = 0; i < joined.length; i++) {
    const char = joined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

function calculateDecayFactor(observedAt: string, evaluationTime: string, halfLifeDays: number): number {
  const tObserved = new Date(observedAt).getTime();
  const tEval = new Date(evaluationTime).getTime();
  const ageDays = (tEval - tObserved) / (1000 * 60 * 60 * 24);
  
  if (ageDays <= 0) return 1.0;
  
  // decay_factor = (1/2) ^ (age_days / half_life_days)
  return Math.pow(0.5, ageDays / halfLifeDays);
}

function determineLevel(score: number, thresholds: { LOW: number; MEDIUM: number; HIGH: number }): AtlasInterestIntentLevel {
  if (score >= thresholds.HIGH) return 'HIGH';
  if (score >= thresholds.MEDIUM) return 'MEDIUM';
  if (score >= thresholds.LOW) return 'LOW';
  return 'UNKNOWN';
}

/**
 * Deterministically calculates Interest and Intent state for a given Topic (and Product).
 * All inputs must be explicitly provided. 
 */
export function calculatePersonState(
  tenant_id: string,
  person_id: string,
  topic: string,
  product_ref: string | null,
  events: AtlasBehaviorEvent[],
  policy: AtlasScoringPolicy,
  evaluation_time: string
): { interest: AtlasInterestState; intent: AtlasIntentState } {
  
  // Filter events related to this topic
  const topicEvents = events.filter(e => e.topic === topic);
  
  let interestScore = 0;
  let intentScore = 0;
  
  let lastSignalAt = '';

  // Process events
  for (const event of topicEvents) {
    // 1. Time decay
    const interestDecay = calculateDecayFactor(event.observed_at, evaluation_time, policy.decay_json.half_life_days.INTEREST);
    const intentDecay = calculateDecayFactor(event.observed_at, evaluation_time, policy.decay_json.half_life_days.INTENT);
    
    // 2. Base weight
    const baseInterest = policy.weights_json.INTEREST[event.event_type] || 0;
    const baseIntent = policy.weights_json.INTENT[event.event_type] || 0;
    
    // 3. Polarity modifier
    let polarityModifier = 1.0;
    let intentPolarityModifier = 1.0;
    if (event.polarity === 'NEGATIVE') {
      // Negative polarity reduces or cancels scores
      // Intent takes a harder hit from negative evidence
      polarityModifier = -1.0; 
      intentPolarityModifier = -2.0; 
    } else if (event.polarity === 'NEUTRAL') {
      polarityModifier = 0;
      intentPolarityModifier = 0;
    }

    const eventInterestContribution = baseInterest * interestDecay * polarityModifier * event.confidence;
    const eventIntentContribution = baseIntent * intentDecay * intentPolarityModifier * event.confidence;

    // Apply only if the event applies to the broader topic or specific product
    interestScore += eventInterestContribution;
    
    // For intent, if product_ref is specified in the calculation, only count if it matches or if event is generic topic-level
    if (!product_ref || !event.product_ref || event.product_ref === product_ref) {
      intentScore += eventIntentContribution;
    }

    if (!lastSignalAt || new Date(event.observed_at).getTime() > new Date(lastSignalAt).getTime()) {
      lastSignalAt = event.observed_at;
    }
  }

  // Floor to 0, no negative final scores
  interestScore = Math.max(0, interestScore);
  intentScore = Math.max(0, intentScore);

  const snapshotHash = createSnapshotHash(topicEvents, evaluation_time);

  const interest: AtlasInterestState = {
    tenant_id,
    person_id,
    topic,
    interest_level: determineLevel(interestScore, policy.thresholds_json.INTEREST),
    interest_score: Number(interestScore.toFixed(2)),
    evidence_count: topicEvents.length,
    last_signal_at: lastSignalAt || null,
    policy_version: policy.policy_version,
    evidence_snapshot_hash: snapshotHash,
    calculated_at: evaluation_time
  };

  const intent: AtlasIntentState = {
    tenant_id,
    person_id,
    topic,
    product_ref: product_ref || '*',
    intent_level: determineLevel(intentScore, policy.thresholds_json.INTENT),
    intent_score: Number(intentScore.toFixed(2)),
    evidence_count: topicEvents.length,
    last_signal_at: lastSignalAt || null,
    policy_version: policy.policy_version,
    evidence_snapshot_hash: snapshotHash,
    reason_codes: null,
    calculated_at: evaluation_time
  };

  return { interest, intent };
}
