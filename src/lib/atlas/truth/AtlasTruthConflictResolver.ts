/**
 * ATLAS TRUTH GRAPH V1
 * Module: AtlasTruthConflictResolver.ts
 * Path: src/lib/atlas/truth/AtlasTruthConflictResolver.ts
 * 
 * Non-Destructive Conflict Preservation Engine.
 * When multiple competing facts are observed for the same subject and predicate
 * (e.g. Juan WORKS_AT Empresa A vs Empresa B), never delete previous assertions.
 * 
 * Invariants:
 * - Both assertions are preserved.
 * - Status tracks: ACTIVE | SUPERSEDED | CONFLICTING | UNKNOWN_TEMPORAL_RELATION.
 * - Does not invent temporal causality without verified temporal timestamps.
 */

import crypto from 'crypto';
import type { TruthAssertion, TruthPredicate } from './AtlasTruthAssertion.ts';

export type ConflictStatus =
  | 'CONFLICTING'
  | 'SUPERSEDED'
  | 'UNKNOWN_TEMPORAL_RELATION'
  | 'RESOLVED';

export interface TruthConflictRecord {
  conflict_id: string;
  subject_id: string;
  predicate: TruthPredicate;
  assertion_a_id: string;
  assertion_b_id: string;
  status: ConflictStatus;
  detected_at: string;
  resolution_notes?: string;
  environment?: 'TEST' | 'PRODUCTION';
  created_at: string;
}

export class AtlasTruthConflictResolver {
  /**
   * Evaluates if a new assertion conflicts with existing assertions for the same subject and predicate.
   * If they conflict, creates a conflict record while keeping both assertions alive.
   */
  public static evaluateConflict(
    newAssertion: TruthAssertion,
    existingAssertions: TruthAssertion[]
  ): { hasConflict: boolean; conflictRecord?: TruthConflictRecord } {
    // Look for existing assertions on the same subject and predicate with DIFFERENT values
    const competing = existingAssertions.find(
      a => a.predicate === newAssertion.predicate && a.value_hash !== newAssertion.value_hash
    );

    if (!competing) {
      return { hasConflict: false };
    }

    // Determine status: without timestamp proving one replaced the other, status is UNKNOWN_TEMPORAL_RELATION
    const conflict_id = `CFL_${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
    const now = new Date().toISOString();

    const conflictRecord: TruthConflictRecord = {
      conflict_id,
      subject_id: newAssertion.subject_id,
      predicate: newAssertion.predicate,
      assertion_a_id: competing.assertion_id,
      assertion_b_id: newAssertion.assertion_id,
      status: 'UNKNOWN_TEMPORAL_RELATION',
      detected_at: now,
      resolution_notes: `Competing facts observed: '${competing.value_normalized}' vs '${newAssertion.value_normalized}'. Both preserved non-destructively.`,
      environment: newAssertion.environment || 'PRODUCTION',
      created_at: now
    };

    return {
      hasConflict: true,
      conflictRecord
    };
  }
}
