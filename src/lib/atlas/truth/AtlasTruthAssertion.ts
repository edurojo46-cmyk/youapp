/**
 * ATLAS TRUTH GRAPH V1
 * Module: AtlasTruthAssertion.ts
 * Path: src/lib/atlas/truth/AtlasTruthAssertion.ts
 * 
 * Truth Assertion Model.
 * Represents an atomic, verified or observed statement about an entity.
 * 
 * Invariants:
 * - OBSERVED != DERIVED != INFERRED.
 * - Never promote DERIVED -> OBSERVED or INFERRED -> OBSERVED automatically.
 * - Same assertion observed multiple times = 1 ASSERTION, multiple EVIDENCES.
 */

import crypto from 'crypto';

export type TruthPredicate =
  | 'PERSON_NAME'
  | 'COMPANY_NAME'
  | 'HAS_EMAIL'
  | 'HAS_PHONE'
  | 'HAS_LINKEDIN'
  | 'HAS_INSTAGRAM'
  | 'HAS_FACEBOOK'
  | 'HAS_PROFESSION'
  | 'HAS_ROLE'
  | 'WORKS_AT'
  | 'HAS_GEO_RESIDENCE'
  | 'HAS_GEO_WORK'
  | 'HAS_GEO_ACTIVITY'
  | 'COMPANY_ADDRESS'
  | 'COMPANY_ACTIVITY';

export type TruthNature = 'OBSERVED' | 'DERIVED' | 'INFERRED';

export type AssertionStatus =
  | 'ACTIVE'
  | 'SUPERSEDED'
  | 'CONFLICTING'
  | 'UNKNOWN_TEMPORAL_RELATION';

export interface TruthAssertion {
  assertion_id: string;
  subject_type: 'PERSON' | 'COMPANY' | 'ORGANIZATION';
  subject_id: string;
  predicate: TruthPredicate;
  value_normalized: string;
  value_hash: string;
  truth_nature: TruthNature;
  confidence: number;
  status: AssertionStatus;
  first_seen: string;
  last_seen: string;
  created_at: string;
  environment?: 'TEST' | 'PRODUCTION';
  metadata?: Record<string, any>;
}

export class AtlasTruthAssertionHelper {
  public static normalizeValue(predicate: TruthPredicate, value: any): string {
    if (value === null || value === undefined) return '';
    const str = String(value).trim();
    if (predicate === 'HAS_EMAIL') {
      return str.toLowerCase();
    }
    if (predicate === 'HAS_PHONE') {
      return str.replace(/[\s\-\(\)\.]+/g, '');
    }
    if (predicate === 'HAS_LINKEDIN' || predicate === 'HAS_INSTAGRAM' || predicate === 'HAS_FACEBOOK') {
      return str.toLowerCase().replace(/\/+$/, '');
    }
    return str;
  }

  public static computeValueHash(predicate: TruthPredicate, normalizedValue: string): string {
    return crypto.createHash('sha256').update(`${predicate}:${normalizedValue}`).digest('hex').substring(0, 16);
  }

  public static generateAssertionId(subject_id: string, predicate: TruthPredicate, value_hash: string): string {
    const raw = `${subject_id}:${predicate}:${value_hash}`;
    const hash = crypto.createHash('sha256').update(raw).digest('hex').substring(0, 12);
    return `AST_${subject_id}_${predicate}_${hash}`;
  }
}
