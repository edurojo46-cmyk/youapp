/**
 * src/lib/atlas/discovery/ai/AtlasPeopleAIRecommendationSchema.mjs
 * 
 * Atlas People AI Source Advisor — Recommendation Contract & Schema
 * 
 * STRICT INVARIANTS:
 * - ATLAS PEOPLE != ATLAS VIDEO
 * - ZERO RAW PII (no DNI, CUIL, emails, phones, or secret hashes)
 * - TRUTH HIERARCHY: PHYSICAL EVIDENCE > CERTIFIED SOURCE INTELLIGENCE > DERIVED MODEL > AI HYPOTHESIS
 */

export const RECOMMENDATION_SCHEMA_VERSION = 'v1.0.0';

export const EVIDENCE_LABELS = Object.freeze({
  OBSERVED: 'OBSERVED',
  CERTIFIED: 'CERTIFIED',
  DERIVED: 'DERIVED',
  MODELED: 'MODELED',
  AI_HYPOTHESIS: 'AI_HYPOTHESIS',
  UNKNOWN: 'UNKNOWN'
});

export const RECOMMENDATION_TYPES = Object.freeze({
  VALIDATE_NEW_SOURCE: 'VALIDATE_NEW_SOURCE',
  PRIORITIZE_KNOWN_SOURCE: 'PRIORITIZE_KNOWN_SOURCE',
  AVOID_SOURCE: 'AVOID_SOURCE',
  EVIDENCE_ENRICHMENT: 'EVIDENCE_ENRICHMENT'
});

export const KNOWN_PEOPLE_DOMAINS = Object.freeze({
  ACADEMIA: 'ACADEMIA',
  GOVERNMENT: 'GOVERNMENT',
  HEALTH: 'HEALTH',
  LEGAL: 'LEGAL',
  BUSINESS: 'BUSINESS',
  ORGANIZATIONS: 'ORGANIZATIONS',
  CULTURE_CIVIC: 'CULTURE_CIVIC'
});

export const GEOGRAPHIC_SCOPES = Object.freeze({
  AR_NATIONAL: 'AR_NATIONAL',
  CABA: 'CABA',
  PBA: 'PBA',
  CORDOBA: 'CORDOBA',
  SANTA_FE: 'SANTA_FE',
  MENDOZA: 'MENDOZA',
  TUCUMAN: 'TUCUMAN',
  ENTRE_RIOS: 'ENTRE_RIOS',
  OTHER_PROVINCE: 'OTHER_PROVINCE'
});

export const CERTIFIED_MOTOR_TEMPLATES = Object.freeze({
  REST_API_MOTOR: 'REST_API_MOTOR',
  CSV_BULK_MOTOR: 'CSV_BULK_MOTOR',
  JSON_DATASET_MOTOR: 'JSON_DATASET_MOTOR',
  OAI_PMH_MOTOR: 'OAI_PMH_MOTOR',
  SPARQL_MOTOR: 'SPARQL_MOTOR',
  PARQUET_BULK_MOTOR: 'PARQUET_BULK_MOTOR',
  HTML_DIRECTORY_MOTOR: 'HTML_DIRECTORY_MOTOR',
  SITEMAP_MOTOR: 'SITEMAP_MOTOR'
});

export const CONFIDENCE_LEVELS = Object.freeze({
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
  VERY_LOW: 'VERY_LOW'
});

export const POLICY_STATUSES = Object.freeze({
  APPROVED: 'APPROVED',
  PENDING_AUDIT: 'PENDING_AUDIT',
  RESTRICTED: 'RESTRICTED',
  REJECTED: 'REJECTED',
  UNKNOWN: 'UNKNOWN'
});

/**
 * Creates an empty structured recommendation template conforming to the v1.0.0 contract
 */
export function createEmptyRecommendation(recommendationId) {
  return {
    recommendation_id: recommendationId,
    recommendation_type: RECOMMENDATION_TYPES.VALIDATE_NEW_SOURCE,
    schema_version: RECOMMENDATION_SCHEMA_VERSION,
    target_population: '',
    domain: KNOWN_PEOPLE_DOMAINS.GOVERNMENT,
    geography: GEOGRAPHIC_SCOPES.AR_NATIONAL,
    coverage_gap_reason: '',
    source_hypothesis: '',
    known_source_id: null,
    candidate_url: null,
    source_class: '',
    preferred_access_mode: '',
    preferred_motor_template: CERTIFIED_MOTOR_TEMPLATES.CSV_BULK_MOTOR,
    motor_template_gap: false,

    // Prediction intervals
    expected_person_yield: { low: 0, base: 0, high: 0 },
    expected_net_new_yield: { low: 0, base: 0, high: 0 },
    expected_marginal_unique_depth: { low: 0, base: 0, high: 0 },
    expected_30m_supply: { low: 0, base: 0, high: 0 },
    expected_overlap: { low: 0, base: 0, high: 0 },

    // Confidence and signals
    confidence: CONFIDENCE_LEVELS.MEDIUM,
    identity_signal_expectation: [],
    policy_status: POLICY_STATUSES.UNKNOWN,
    evidence_status: EVIDENCE_LABELS.AI_HYPOTHESIS,

    // Execution eligibility & supply contribution
    execution_eligible: false,
    certified_supply_contribution: 0,
    non_certified_projected_supply: 0,

    // Provenance & analogs
    prediction_basis: '',
    analog_sources: [],
    context_evidence_refs: [],

    // Deterministic scoring (populated by AtlasPeopleAIRecommendationScorer)
    scoring_factors: null,
    deterministic_score: 0,
    score_version: null,

    // Explainability factors
    explainability: {
      WHY_THIS_POPULATION: '',
      WHY_THIS_SOURCE_CLASS: '',
      WHY_THIS_GEOGRAPHY: '',
      WHY_EXPECT_LOW_OVERLAP: '',
      WHY_EXPECT_NET_NEW_VALUE: '',
      WHY_THIS_MOTOR: '',
      WHAT_MUST_BE_VERIFIED: ''
    },

    required_validation_steps: [],
    recommended_canary: '',
    reasoning_summary: '',
    blocking_risks: []
  };
}
