/**
 * src/lib/atlas/discovery/motorRegistry.mjs
 * 
 * Atlas Induction Discovery Engine — Tesla Source Wheel Registry
 * Implements:
 * - Source Motor Contract & validation
 * - Strict state transition validation & invariants
 * - Certification statuses and block reasons
 * - Frozen Scoring Models v1.0.0 (Priority Score & Motor Quality Score)
 * - Provider rate limit scoping
 * - Checkpoint durability model
 */

import crypto from 'crypto';

export const MOTOR_STATES = Object.freeze({
  DISCOVERED: 'DISCOVERED',
  PROFILED: 'PROFILED',
  CANARY: 'CANARY',
  CERTIFIED: 'CERTIFIED',
  ACTIVE: 'ACTIVE',
  THROTTLED: 'THROTTLED',
  SLEEPING: 'SLEEPING',
  EXHAUSTED: 'EXHAUSTED',
  FAILED: 'FAILED',
  RETIRED: 'RETIRED',
  POLICY_BLOCKED: 'POLICY_BLOCKED',
  HUMAN_ONLY: 'HUMAN_ONLY',
  NO_PERSON_VALUE: 'NO_PERSON_VALUE'
});

export const TEMPLATE_STATUSES = Object.freeze({
  CERTIFIED: 'CERTIFIED',
  IMPLEMENTED_UNCERTIFIED: 'IMPLEMENTED_UNCERTIFIED',
  LEGACY: 'LEGACY',
  PLANNED: 'PLANNED',
  MISSING: 'MISSING'
});

export const MOTOR_TEMPLATES = Object.freeze({
  CSV_BULK_MOTOR: {
    id: 'CSV_BULK_MOTOR',
    name: 'Certified CSV Bulk Motor',
    status: TEMPLATE_STATUSES.CERTIFIED,
    protocol: 'CSV_STREAM',
    description: 'High-throughput streamed CSV ingestion with identity parser and deduplication.'
  },
  REST_API_MOTOR: {
    id: 'REST_API_MOTOR',
    name: 'Generic REST API Motor',
    status: TEMPLATE_STATUSES.IMPLEMENTED_UNCERTIFIED,
    protocol: 'REST_API',
    description: 'Paged REST API client with backoff and JSON envelope extraction.'
  },
  CKAN_MOTOR: {
    id: 'CKAN_MOTOR',
    name: 'CKAN Open Data Motor',
    status: TEMPLATE_STATUSES.IMPLEMENTED_UNCERTIFIED,
    protocol: 'REST_API',
    description: 'Standard CKAN API v3 datastore search and package catalog extractor.'
  },
  SPARQL_MOTOR: {
    id: 'SPARQL_MOTOR',
    name: 'SPARQL Query Endpoint Motor',
    status: TEMPLATE_STATUSES.IMPLEMENTED_UNCERTIFIED,
    protocol: 'SPARQL',
    description: 'Declarative graph query client for semantic knowledge graphs (Wikidata, etc.).'
  },
  OAI_PMH_MOTOR: {
    id: 'OAI_PMH_MOTOR',
    name: 'OAI-PMH Academic Repository Motor',
    status: TEMPLATE_STATUSES.IMPLEMENTED_UNCERTIFIED,
    protocol: 'OAI_PMH',
    description: 'Standard Dublin Core and metadata prefix harvester for academic archives.'
  },
  HTML_DIRECTORY_MOTOR: {
    id: 'HTML_DIRECTORY_MOTOR',
    name: 'Structured HTML Directory Motor',
    status: TEMPLATE_STATUSES.LEGACY,
    protocol: 'HTML_DIRECTORY',
    description: 'Deterministic DOM parser for public organizational rosters and tables.'
  },
  RSS_MOTOR: {
    id: 'RSS_MOTOR',
    name: 'RSS / News Feed Motor',
    status: TEMPLATE_STATUSES.IMPLEMENTED_UNCERTIFIED,
    protocol: 'RSS_FEED',
    description: 'Syndicated news feed consumer extracting person candidates and evidence.'
  },
  SOCIAL_PUBLIC_MOTOR: {
    id: 'SOCIAL_PUBLIC_MOTOR',
    name: 'Public Social Web Discovery Motor',
    status: TEMPLATE_STATUSES.IMPLEMENTED_UNCERTIFIED,
    protocol: 'PUBLIC_WEB',
    description: 'Structured public profile search without authentication or CAPTCHA bypass.'
  },
  PARQUET_BULK_MOTOR: {
    id: 'PARQUET_BULK_MOTOR',
    name: 'Parquet Columnar Bulk Motor',
    status: TEMPLATE_STATUSES.PLANNED,
    protocol: 'PARQUET_STREAM',
    description: 'Compressed columnar dataset reader for mass data lakes.'
  },
  JSON_DATASET_MOTOR: {
    id: 'JSON_DATASET_MOTOR',
    name: 'JSON Dataset Bulk Motor',
    status: TEMPLATE_STATUSES.IMPLEMENTED_UNCERTIFIED,
    protocol: 'JSON_FEED',
    description: 'Static or streaming JSON arrays of structured entity objects.'
  }
});

export const CERTIFICATION_STATUSES = Object.freeze({
  NOT_TESTED: 'NOT_TESTED',
  IN_PROGRESS: 'IN_PROGRESS',
  PASSED: 'PASSED',
  REJECTED: 'REJECTED',
  PENDING: 'PENDING'
});

export const CERTIFICATION_BLOCK_REASONS = Object.freeze({
  NONE: 'NONE',
  POLICY: 'POLICY',
  PROTOCOL: 'PROTOCOL',
  EVIDENCE: 'EVIDENCE',
  QUALITY: 'QUALITY',
  IDENTITY: 'IDENTITY',
  CONNECTIVITY: 'CONNECTIVITY',
  OTHER: 'OTHER'
});

export const POLICY_STATUSES = Object.freeze({
  PENDING_AUDIT: 'PENDING_AUDIT',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  RESTRICTED: 'RESTRICTED'
});

export const DEPTH_EVIDENCE_STATUSES = Object.freeze({
  VERIFIED_ENDPOINT_COUNT: 'VERIFIED_ENDPOINT_COUNT',
  VERIFIED_MANIFEST: 'VERIFIED_MANIFEST',
  SAMPLED_ESTIMATE: 'SAMPLED_ESTIMATE',
  EXTERNAL_DECLARED_ESTIMATE: 'EXTERNAL_DECLARED_ESTIMATE',
  UNKNOWN: 'UNKNOWN'
});

export const SOURCE_FAMILIES = Object.freeze({
  OPENALEX: 'OPENALEX',
  WIKIDATA: 'WIKIDATA',
  OAI_PMH: 'OAI_PMH',
  PUBLIC_OPEN_DATA: 'PUBLIC_OPEN_DATA'
});

export const PROTOCOLS = Object.freeze({
  REST_API: 'REST_API',
  SPARQL: 'SPARQL',
  OAI_PMH: 'OAI_PMH',
  CSV_STREAM: 'CSV_STREAM',
  JSON_FEED: 'JSON_FEED'
});

// ============================================================
// FROZEN SCORING MODEL SPECIFICATION v1.0.0
// ============================================================
export const SCORING_MODEL_VERSION = '1.0.0';

export const SCORING_MODEL_SPEC = {
  version: SCORING_MODEL_VERSION,
  canary_priority_weights: {
    depth_gain: 0.35,
    evidence_quality: 0.20,
    persistent_id: 0.15,
    low_overlap: 0.15,
    protocol_reusability: 0.15
  },
  motor_quality_weights: {
    unique_depth_value: 0.20,
    evidence_quality: 0.15,
    identity_strength: 0.15,
    low_overlap_value: 0.15,
    policy_confidence: 0.15,
    protocol_stability: 0.10,
    checkpoint_quality: 0.05,
    template_reusability: 0.05
  },
  certification_thresholds: {
    min_quality_score: 65.0,
    max_observed_errors: 0,
    require_policy_approved: true,
    require_contract_valid: true,
    require_protocol_valid: true
  }
};

export const SCORING_MODEL_SHA256 = crypto
  .createHash('sha256')
  .update(JSON.stringify(SCORING_MODEL_SPEC))
  .digest('hex');

/**
 * Calculates Motor Canary Priority Score (0 - 100)
 */
export function calculateCanaryPriorityScore(motor) {
  const w = SCORING_MODEL_SPEC.canary_priority_weights;
  
  // 1. Depth gain: normalized to 50k
  const depthGain = Math.min(100, (Number(motor.estimated_person_depth || 0) / 50000) * 100);
  
  // 2. Evidence quality:
  let evidenceQuality = 70;
  if (motor.source_family === SOURCE_FAMILIES.OPENALEX) evidenceQuality = 90;
  if (motor.source_family === SOURCE_FAMILIES.WIKIDATA) evidenceQuality = 85;
  if (motor.source_family === SOURCE_FAMILIES.OAI_PMH) evidenceQuality = 80;
  if (motor.source_family === SOURCE_FAMILIES.PUBLIC_OPEN_DATA) evidenceQuality = 60;

  // 3. Persistent ID support:
  let persistentId = 50;
  if (motor.protocol === PROTOCOLS.REST_API || motor.protocol === PROTOCOLS.SPARQL) persistentId = 95;
  if (motor.protocol === PROTOCOLS.OAI_PMH) persistentId = 70;

  // 4. Low overlap value:
  const assumedOverlap = Number(motor.overlap_assumed || 0.15);
  const lowOverlap = Math.max(0, (1 - assumedOverlap) * 100);

  // 5. Protocol reusability:
  let protocolReusability = 60;
  if ([PROTOCOLS.REST_API, PROTOCOLS.SPARQL, PROTOCOLS.OAI_PMH].includes(motor.protocol)) {
    protocolReusability = 95;
  }

  let rawScore = (
    w.depth_gain * depthGain +
    w.evidence_quality * evidenceQuality +
    w.persistent_id * persistentId +
    w.low_overlap * lowOverlap +
    w.protocol_reusability * protocolReusability
  );

  // Policy & template penalties
  if (motor.policy_status !== POLICY_STATUSES.APPROVED) rawScore -= 40;
  if (!motor.motor_template_available) rawScore -= 25;

  return Math.round(Math.max(0, Math.min(100, rawScore)) * 100) / 100;
}

/**
 * Calculates Motor Quality Score (0 - 100) post-canary
 */
export function calculateMotorQualityScore(metrics) {
  const w = SCORING_MODEL_SPEC.motor_quality_weights;

  // 1. Unique depth value: normalized to 30k
  const depthScore = Math.min(100, (Number(metrics.canary_supported_unique_depth || 0) / 30000) * 100);

  // 2. Evidence quality (works, dates, affiliations)
  const evidenceScore = Number(metrics.evidence_quality_score || 80);

  // 3. Identity strength (persistent ID rate %)
  const identityScore = Number(metrics.persistent_id_percent || 75);

  // 4. Low overlap value: (1 - overlap) * 100
  const overlap = Number(metrics.overlap_rate || 0.10);
  const lowOverlapScore = Math.max(0, (1 - overlap) * 100);

  // 5. Policy confidence: 100 if APPROVED, 0 otherwise
  const policyScore = metrics.policy_status === POLICY_STATUSES.APPROVED ? 100 : 0;

  // 6. Protocol stability: (1 - error_rate)*100, with backoff penalty
  let stabilityScore = Math.max(0, (1 - Number(metrics.error_rate || 0)) * 100);
  if (metrics.backoff_triggered) stabilityScore -= 15;

  // 7. Checkpoint quality:
  const checkpointScore = metrics.checkpoint_resume_valid ? 100 : 50;

  // 8. Template reusability:
  const reusabilityScore = metrics.template_available ? 100 : 40;

  const rawScore = (
    w.unique_depth_value * depthScore +
    w.evidence_quality * evidenceScore +
    w.identity_strength * identityScore +
    w.low_overlap_value * lowOverlapScore +
    w.policy_confidence * policyScore +
    w.protocol_stability * stabilityScore +
    w.checkpoint_quality * checkpointScore +
    w.template_reusability * reusabilityScore
  );

  return Math.round(Math.max(0, Math.min(100, rawScore)) * 100) / 100;
}

/**
 * Validates state transition according to Atlas Source Motor Invariants
 */
export function validateStateTransition(currentState, nextState, policyStatus) {
  if (!currentState) {
    if (nextState === MOTOR_STATES.ACTIVE) {
      throw new Error(`INVARIANT_VIOLATION: New motor cannot be directly registered as ACTIVE. Must start at DISCOVERED or PROFILED.`);
    }
    return true;
  }

  if (currentState === nextState) return true;

  if ([MOTOR_STATES.CANARY, MOTOR_STATES.ACTIVE].includes(nextState) && policyStatus !== POLICY_STATUSES.APPROVED) {
    throw new Error(`INVARIANT_VIOLATION: Cannot transition to ${nextState} with policy_status '${policyStatus}'. Must be APPROVED.`);
  }

  const validTransitions = {
    [MOTOR_STATES.DISCOVERED]: [MOTOR_STATES.PROFILED, MOTOR_STATES.FAILED, MOTOR_STATES.RETIRED],
    [MOTOR_STATES.PROFILED]: [MOTOR_STATES.CANARY, MOTOR_STATES.FAILED, MOTOR_STATES.RETIRED, MOTOR_STATES.DISCOVERED],
    [MOTOR_STATES.CANARY]: [MOTOR_STATES.CERTIFIED, MOTOR_STATES.FAILED, MOTOR_STATES.RETIRED, MOTOR_STATES.PROFILED],
    [MOTOR_STATES.CERTIFIED]: [MOTOR_STATES.ACTIVE, MOTOR_STATES.RETIRED, MOTOR_STATES.CANARY],
    [MOTOR_STATES.ACTIVE]: [MOTOR_STATES.THROTTLED, MOTOR_STATES.SLEEPING, MOTOR_STATES.EXHAUSTED, MOTOR_STATES.FAILED, MOTOR_STATES.RETIRED],
    [MOTOR_STATES.THROTTLED]: [MOTOR_STATES.ACTIVE, MOTOR_STATES.EXHAUSTED, MOTOR_STATES.FAILED, MOTOR_STATES.RETIRED],
    [MOTOR_STATES.SLEEPING]: [MOTOR_STATES.ACTIVE, MOTOR_STATES.FAILED, MOTOR_STATES.RETIRED],
    [MOTOR_STATES.EXHAUSTED]: [MOTOR_STATES.RETIRED, MOTOR_STATES.ACTIVE],
    [MOTOR_STATES.FAILED]: [MOTOR_STATES.PROFILED, MOTOR_STATES.RETIRED],
    [MOTOR_STATES.RETIRED]: []
  };

  const allowed = validTransitions[currentState] || [];
  if (!allowed.includes(nextState)) {
    throw new Error(`INVALID_TRANSITION: Cannot transition motor from '${currentState}' to '${nextState}'. Allowed: [${allowed.join(', ')}]`);
  }
  return true;
}

/**
 * Validates a candidate emitted by a Source Motor against the Canonical Contract
 */
export function validateSourceMotorContract(record) {
  if (!record || typeof record !== 'object') {
    throw new Error('CONTRACT_VIOLATION: Candidate record must be an object.');
  }
  const { candidate, evidence, provenance, source_record_id } = record;

  if (!candidate || typeof candidate.name !== 'string' || candidate.name.trim().length === 0) {
    throw new Error('CONTRACT_VIOLATION: candidate.name is required and non-empty.');
  }
  if (candidate.entity_type !== 'PERSON') {
    throw new Error(`CONTRACT_VIOLATION: candidate.entity_type must be 'PERSON', got '${candidate.entity_type}'.`);
  }
  if (!evidence || typeof evidence !== 'object') {
    throw new Error('CONTRACT_VIOLATION: evidence object is required.');
  }
  if (!provenance || !provenance.source_id || !provenance.source_family || !provenance.endpoint_url) {
    throw new Error('CONTRACT_VIOLATION: provenance must contain source_id, source_family, and endpoint_url.');
  }
  if (!source_record_id || typeof source_record_id !== 'string') {
    throw new Error('CONTRACT_VIOLATION: source_record_id string is required.');
  }
  return true;
}

/**
 * Normalizes checkpoint for durability across protocols
 */
export function formatCheckpoint(protocol, details) {
  return {
    protocol,
    cursor: details.cursor || null,
    offset: Number.isInteger(details.offset) ? details.offset : null,
    resumption_token: details.resumption_token || null,
    partition_cursor: details.partition_cursor || null,
    last_record_id: details.last_record_id || null,
    last_checkpoint_at: new Date().toISOString()
  };
}
