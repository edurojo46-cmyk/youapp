/**
 * ATLAS DOMAIN STATIC VALIDATOR V1
 * 
 * Pre-execution static gatekeeper.
 * Validates that an AtlasDomainSpecification conforms strictly to all industrial safety,
 * identity, evidence, and privacy policies before compilation or execution.
 * 
 * Invariants:
 * - DOMAIN_STATIC_VALIDATION = PASS is mandatory before any domain is registered.
 * - Rejects any specification attempting name-only merges or privacy violations.
 */

import type { AtlasDomainSpecification } from '../contracts/AtlasDomainSpecification';

export interface StaticValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  DOMAIN_STATIC_VALIDATION: 'PASS' | 'FAIL';
  checks_performed: {
    schema_integrity: boolean;
    identity_safety: boolean;
    evidence_policy: boolean;
    privacy_compliance: boolean;
    ui_config_validity: boolean;
  };
}

export class AtlasDomainStaticValidator {
  public static validateSpecification(spec: AtlasDomainSpecification): StaticValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Schema Integrity Check
    let schemaPassed = true;
    if (!spec.domain_id || spec.domain_id.trim().length === 0) {
      errors.push('Missing domain_id');
      schemaPassed = false;
    }
    if (!spec.entity_type || spec.entity_type.trim().length === 0) {
      errors.push('Missing entity_type');
      schemaPassed = false;
    }
    if (!spec.fields || spec.fields.length === 0) {
      errors.push('Specification must declare at least one field');
      schemaPassed = false;
    }
    const coreIdentityFields = spec.fields.filter(f => f.classification === 'CORE_IDENTITY');
    if (coreIdentityFields.length === 0) {
      errors.push('Specification must define at least one CORE_IDENTITY field');
      schemaPassed = false;
    }

    // 2. Identity Safety Check (Anti-Merge Invariant)
    let identityPassed = true;
    if (spec.identity_policy.allow_name_only_merge) {
      errors.push('CRITICAL: allow_name_only_merge is strictly forbidden');
      identityPassed = false;
    }
    if (spec.identity_policy.allow_soft_canonical_merge) {
      errors.push('CRITICAL: allow_soft_canonical_merge is strictly forbidden');
      identityPassed = false;
    }
    if (!spec.identity_policy.strong_identifier_fields || spec.identity_policy.strong_identifier_fields.length === 0) {
      errors.push('Identity policy must declare strong identifier fields');
      identityPassed = false;
    }

    // 3. Evidence Policy Check
    let evidencePassed = true;
    if (!spec.evidence_policy.require_source_url) {
      errors.push('Evidence policy must require source_url for factual auditability');
      evidencePassed = false;
    }
    if (spec.evidence_policy.min_confidence_to_persist < 0.80) {
      errors.push(`min_confidence_to_persist must be >= 0.80 (found: ${spec.evidence_policy.min_confidence_to_persist})`);
      evidencePassed = false;
    }

    // 4. Privacy Compliance Check
    let privacyPassed = true;
    if (spec.governance_policy.privacy_gate.allow_private_individuals) {
      errors.push('Private individuals contact harvesting is strictly forbidden');
      privacyPassed = false;
    }
    if (spec.governance_policy.privacy_gate.allow_residential_addresses) {
      errors.push('Residential addresses harvesting is strictly forbidden');
      privacyPassed = false;
    }

    // 5. UI Config Check
    let uiPassed = true;
    if (!spec.ui_config || !spec.ui_config.primary_column || !spec.ui_config.columns) {
      errors.push('Invalid ui_config: missing primary_column or columns');
      uiPassed = false;
    }

    const valid = errors.length === 0;

    return {
      valid,
      errors,
      warnings,
      DOMAIN_STATIC_VALIDATION: valid ? 'PASS' : 'FAIL',
      checks_performed: {
        schema_integrity: schemaPassed,
        identity_safety: identityPassed,
        evidence_policy: evidencePassed,
        privacy_compliance: privacyPassed,
        ui_config_validity: uiPassed
      }
    };
  }
}
