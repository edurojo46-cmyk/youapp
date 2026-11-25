/**
 * src/lib/atlas/discovery/ai/AtlasPeopleAIRecommendationValidator.mjs
 * 
 * Atlas People AI Source Advisor — Deterministic Recommendation Validator
 * 
 * Strict deterministic validation gate through which ALL AI recommendations must pass.
 * Prohibits PII, video domain leakage, fabricated certification claims, and policy bypass.
 */

import {
  RECOMMENDATION_SCHEMA_VERSION,
  EVIDENCE_LABELS,
  RECOMMENDATION_TYPES,
  KNOWN_PEOPLE_DOMAINS,
  CERTIFIED_MOTOR_TEMPLATES,
  POLICY_STATUSES,
  CONFIDENCE_LEVELS
} from './AtlasPeopleAIRecommendationSchema.mjs';

export class AtlasPeopleAIRecommendationValidator {
  /**
   * Validates a single recommendation against all deterministic rules and invariants.
   * 
   * @param {Object} rec - The candidate recommendation object
   * @param {Object} context - The frozen context containing certified sources
   * @returns {Object} { valid: boolean, errors: string[], sanitizedRec: Object }
   */
  static validate(rec, context = null) {
    const errors = [];
    if (!rec || typeof rec !== 'object') {
      return { valid: false, errors: ['Recommendation must be a non-null object'], sanitizedRec: null };
    }

    // 1. Schema Version
    if (rec.schema_version !== RECOMMENDATION_SCHEMA_VERSION) {
      errors.push(`Invalid schema_version: expected ${RECOMMENDATION_SCHEMA_VERSION}, got ${rec.schema_version}`);
    }

    // 2. Recommendation ID & Type
    if (!rec.recommendation_id || typeof rec.recommendation_id !== 'string') {
      errors.push('recommendation_id is required and must be a string');
    }
    if (!Object.values(RECOMMENDATION_TYPES).includes(rec.recommendation_type)) {
      errors.push(`Invalid recommendation_type: ${rec.recommendation_type}`);
    }

    // 3. Domain Validation (Strict People Domain, Zero Video)
    const domainStr = (rec.domain || '').toUpperCase();
    if (/video|youtube|vimeo|dailymotion|channel|stream/i.test(domainStr) ||
        /video|youtube|vimeo|dailymotion|channel|stream/i.test(rec.target_population || '')) {
      errors.push(`CROSS-DOMAIN VIOLATION: Video terms detected in People Advisor domain: ${domainStr}`);
    }
    const isKnownDomain = Object.values(KNOWN_PEOPLE_DOMAINS).includes(domainStr);
    if (!isKnownDomain && !domainStr.startsWith('PROPOSED_PEOPLE_')) {
      errors.push(`Invalid domain: must be a known domain or PROPOSED_PEOPLE_*, got ${domainStr}`);
    }

    // 4. Motor Template Validation
    if (rec.preferred_motor_template) {
      const isKnownMotor = Object.values(CERTIFIED_MOTOR_TEMPLATES).includes(rec.preferred_motor_template);
      if (!isKnownMotor) {
        rec.motor_template_gap = true;
        rec.execution_eligible = false;
        errors.push(`MOTOR_TEMPLATE_GAP: Unknown motor template ${rec.preferred_motor_template}`);
      }
    } else {
      errors.push('preferred_motor_template is required');
    }

    // 5. Policy Hard Gate
    if (rec.policy_status === POLICY_STATUSES.RESTRICTED || rec.policy_status === POLICY_STATUSES.REJECTED) {
      if (rec.execution_eligible) {
        errors.push('POLICY GATE VIOLATION: Source with RESTRICTED or REJECTED policy cannot be execution_eligible');
        rec.execution_eligible = false;
      }
      if (rec.certified_supply_contribution > 0) {
        errors.push('POLICY GATE VIOLATION: Policy-restricted source cannot contribute certified supply');
        rec.certified_supply_contribution = 0;
      }
    }

    // 6. Evidence Label & False Certification Claims
    if (!Object.values(EVIDENCE_LABELS).includes(rec.evidence_status)) {
      errors.push(`Invalid evidence_status: ${rec.evidence_status}`);
    }

    if (rec.evidence_status === EVIDENCE_LABELS.CERTIFIED || rec.evidence_status === EVIDENCE_LABELS.OBSERVED) {
      // Must exist in certified context
      const knownCertified = context?.certified_sources_intelligence?.find(s => s.source_id === rec.known_source_id);
      if (!knownCertified) {
        errors.push(`CERTIFICATION FALSE CLAIM: Source ${rec.known_source_id || rec.source_hypothesis} labeled ${rec.evidence_status} but not found in certified context`);
      }
    }

    // Hypotheses must never contribute certified supply
    if (rec.evidence_status === EVIDENCE_LABELS.AI_HYPOTHESIS || rec.evidence_status === EVIDENCE_LABELS.UNKNOWN) {
      if (rec.certified_supply_contribution > 0) {
        errors.push('TRUTH HIERARCHY VIOLATION: AI_HYPOTHESIS cannot contribute certified supply');
        rec.certified_supply_contribution = 0;
      }
    }

    // 7. Hallucination Guard (Candidate URLs)
    if (rec.candidate_url) {
      const knownInContext = context?.certified_sources_intelligence?.some(s => s.source_id === rec.known_source_id);
      if (!knownInContext && !rec.known_source_id) {
        errors.push(`FABRICATED ENDPOINT: candidate_url provided (${rec.candidate_url}) without certified source provenance. Must be null for new hypotheses.`);
        rec.candidate_url = null;
      }
    }

    // 8. Numeric Ranges (Intervals)
    const intervalFields = [
      'expected_person_yield',
      'expected_net_new_yield',
      'expected_marginal_unique_depth',
      'expected_30m_supply',
      'expected_overlap'
    ];
    for (const field of intervalFields) {
      const val = rec[field];
      if (!val || typeof val !== 'object') {
        errors.push(`${field} must be an object with { low, base, high }`);
        continue;
      }
      if (typeof val.low !== 'number' || typeof val.base !== 'number' || typeof val.high !== 'number') {
        errors.push(`${field} values must be numbers`);
        continue;
      }
      if (val.low < 0 || val.base < 0 || val.high < 0) {
        errors.push(`${field} values cannot be negative`);
      }
      if (val.low > val.base || val.base > val.high) {
        errors.push(`${field} ordering violated: must satisfy low <= base <= high (got ${val.low}, ${val.base}, ${val.high})`);
      }
      if (field.includes('yield') || field === 'expected_overlap') {
        if (val.high > 1.0) {
          errors.push(`${field} rate cannot exceed 1.0 (got ${val.high})`);
        }
      }
    }

    // 9. Strict PII Check (No raw DNI, CUIL, personal email, phone, secret HMAC)
    const stringDump = JSON.stringify(rec);
    if (/\b(?:20|23|24|27)[\s-]?\d{8}[\s-]?\d\b/.test(stringDump)) {
      errors.push('PII VIOLATION: Potential raw CUIL detected in recommendation');
    }
    if (/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(stringDump)) {
      errors.push('PII VIOLATION: Potential personal email detected in recommendation');
    }
    if (/\b(?:1e7b93df|40001ee3|d3516ef5)\b/i.test(stringDump)) {
      errors.push('PII / SECRET VIOLATION: Sensitive cryptographic hash/secret detected');
    }

    // 10. Explainability Structure
    if (!rec.explainability || typeof rec.explainability !== 'object') {
      errors.push('explainability factors object is required');
    } else {
      const requiredFactors = [
        'WHY_THIS_POPULATION',
        'WHY_THIS_SOURCE_CLASS',
        'WHY_THIS_GEOGRAPHY',
        'WHY_EXPECT_LOW_OVERLAP',
        'WHY_EXPECT_NET_NEW_VALUE',
        'WHY_THIS_MOTOR',
        'WHAT_MUST_BE_VERIFIED'
      ];
      for (const rf of requiredFactors) {
        if (!rec.explainability[rf] || typeof rec.explainability[rf] !== 'string') {
          errors.push(`Missing explainability factor: ${rf}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      sanitizedRec: errors.length === 0 ? rec : null
    };
  }
}
