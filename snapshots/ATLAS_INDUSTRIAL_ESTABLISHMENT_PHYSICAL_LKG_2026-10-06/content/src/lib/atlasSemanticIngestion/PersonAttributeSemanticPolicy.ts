/**
 * Atlas Semantic Intelligence — Person Attribute Semantic Policy V1
 * Strict allowlist policy governing high-fidelity person attribute transformation.
 * Enforces Zero-PII guards, epistemic claim defaults, and typed predicate mappings.
 */

import type { LiteralValueType, KnowledgeType } from '../atlasSemantic/semanticTypes';

export type PersonAttributeValueCategory =
  | 'ROLE_LITERAL'
  | 'COMPANY_RELATIONSHIP'
  | 'LOCATION_LITERAL'
  | 'SKILL_LITERAL'
  | 'AVATAR_URL'
  | 'PROHIBITED_PII'
  | 'UNSUPPORTED_METADATA'
  | 'UNKNOWN';

export interface AttributeEvaluationResult {
  allowed: boolean;
  attribute_key: string;
  category: PersonAttributeValueCategory;
  predicate_code?: string;
  knowledge_type: KnowledgeType; // Default is always CLAIM for evidence assertions
  literal_value?: string;
  rejection_reason?: string;
}

export class PersonAttributeSemanticPolicy {
  /**
   * Prohibited PII attributes that must never be ingested into semantic facts or knowledge graph.
   */
  private static readonly PROHIBITED_PII_KEYS: Set<string> = new Set([
    'dob',
    'date_of_birth',
    'ssn',
    'national_id',
    'passport',
    'credit_card',
    'bank_account',
    'password',
    'secret',
    'token'
  ]);

  /**
   * Non-semantic or testing metadata that should be quietly skipped.
   */
  private static readonly UNSUPPORTED_METADATA_KEYS: Set<string> = new Set([
    'fresh_badge',
    'stale_badge',
    'a',
    'b',
    'test_flag',
    'dummy'
  ]);

  /**
   * Evaluates an attribute_key and normalized_value against strict semantic policy.
   */
  public static evaluate(
    attributeKey: string,
    normalizedValue: any,
    assertionType?: string,
    confidence?: number | null
  ): AttributeEvaluationResult {
    if (!attributeKey || typeof attributeKey !== 'string') {
      return {
        allowed: false,
        attribute_key: '',
        category: 'UNKNOWN',
        knowledge_type: 'CLAIM',
        rejection_reason: 'EMPTY_ATTRIBUTE_KEY'
      };
    }

    const key = attributeKey.trim().toLowerCase();

    // 1. Prohibited PII Guard
    if (this.PROHIBITED_PII_KEYS.has(key)) {
      return {
        allowed: false,
        attribute_key: attributeKey,
        category: 'PROHIBITED_PII',
        knowledge_type: 'CLAIM',
        rejection_reason: 'PROHIBITED_PII_ATTRIBUTE'
      };
    }

    // 2. Unsupported Metadata Filter
    if (this.UNSUPPORTED_METADATA_KEYS.has(key)) {
      return {
        allowed: false,
        attribute_key: attributeKey,
        category: 'UNSUPPORTED_METADATA',
        knowledge_type: 'CLAIM',
        rejection_reason: 'UNSUPPORTED_TEST_OR_SYSTEM_METADATA'
      };
    }

    // 3. Null / Empty Value Guard
    if (normalizedValue === null || normalizedValue === undefined || normalizedValue === '') {
      return {
        allowed: false,
        attribute_key: attributeKey,
        category: 'UNKNOWN',
        knowledge_type: 'CLAIM',
        rejection_reason: 'EMPTY_NORMALIZED_VALUE'
      };
    }

    const valStr = typeof normalizedValue === 'object'
      ? JSON.stringify(normalizedValue)
      : String(normalizedValue).trim();

    if (valStr.length === 0) {
      return {
        allowed: false,
        attribute_key: attributeKey,
        category: 'UNKNOWN',
        knowledge_type: 'CLAIM',
        rejection_reason: 'EMPTY_NORMALIZED_VALUE'
      };
    }

    // 4. ROLE / JOB_TITLE / PROFESSION
    if (key === 'title' || key === 'job_title' || key === 'profession' || key === 'role') {
      return {
        allowed: true,
        attribute_key: attributeKey,
        category: 'ROLE_LITERAL',
        predicate_code: 'HAS_ROLE',
        knowledge_type: 'CLAIM', // Epistemic status defaults to CLAIM even if confidence is 0.99
        literal_value: valStr
      };
    }

    // 5. EMPLOYER / COMPANY
    if (key === 'company' || key === 'employer' || key === 'organization') {
      return {
        allowed: true,
        attribute_key: attributeKey,
        category: 'COMPANY_RELATIONSHIP',
        predicate_code: 'WORKS_AT',
        knowledge_type: 'CLAIM',
        literal_value: valStr
      };
    }

    // 6. LOCATION / RESIDENCE / GEO
    if (
      key === 'location' ||
      key === 'residence_city' ||
      key === 'residence_neighborhood' ||
      key === 'residence_country' ||
      key === 'geo' ||
      key === 'city'
    ) {
      return {
        allowed: true,
        attribute_key: attributeKey,
        category: 'LOCATION_LITERAL',
        predicate_code: 'LOCATED_IN',
        knowledge_type: 'CLAIM',
        literal_value: valStr
      };
    }

    // 7. SKILL / DOMAIN / EXPERTISE
    if (key === 'skill' || key === 'domain' || key === 'expertise') {
      return {
        allowed: true,
        attribute_key: attributeKey,
        category: 'SKILL_LITERAL',
        predicate_code: 'HAS_SKILL',
        knowledge_type: 'CLAIM',
        literal_value: valStr
      };
    }

    // 8. AVATAR / PHOTO_URL
    if (key === 'photo_url' || key === 'avatar_url') {
      return {
        allowed: true,
        attribute_key: attributeKey,
        category: 'AVATAR_URL',
        predicate_code: 'HAS_AVATAR',
        knowledge_type: 'CLAIM',
        literal_value: valStr
      };
    }

    // 9. Unknown / Unsupported Key
    return {
      allowed: false,
      attribute_key: attributeKey,
      category: 'UNKNOWN',
      knowledge_type: 'CLAIM',
      rejection_reason: `UNKNOWN_OR_UNALLOWLISTED_ATTRIBUTE_KEY: ${attributeKey}`
    };
  }
}
