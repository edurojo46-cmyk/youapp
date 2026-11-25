/**
 * ATLAS TEMPORAL GRAPH V1
 * Module: AtlasTemporalObservation.ts
 * Path: src/lib/atlas/temporal/AtlasTemporalObservation.ts
 * 
 * Temporal Observation Model.
 * Answers: WHAT we know + WHEN we saw it.
 * 
 * Invariants:
 * - OBSERVATION != VALIDITY:
 *   observed_at is when the document/evidence was recorded or observed.
 *   valid_from is strictly when the fact became true, ONLY if physically explicit in evidence.
 *   Otherwise valid_from = NULL (Never invent valid_from from observed_at).
 * - Does not duplicate truth assertion facts; references assertion_id.
 */

import crypto from 'crypto';

export type TemporalStatus =
  | 'CURRENT'
  | 'HISTORICAL'
  | 'SUPERSEDED'
  | 'CONFLICTING'
  | 'UNKNOWN_TEMPORAL_RELATION';

export interface TemporalObservation {
  temporal_observation_id: string;
  assertion_id: string;
  evidence_id: string;
  observed_at: string;
  valid_from: string | null;
  valid_to: string | null;
  first_seen: string;
  last_seen: string;
  superseded_at?: string | null;
  status: TemporalStatus;
  environment: 'TEST' | 'PRODUCTION';
  created_at: string;
}

export class AtlasTemporalObservationHelper {
  public static generateObservationId(assertion_id: string, evidence_id: string): string {
    const raw = `${assertion_id}:${evidence_id}`;
    const hash = crypto.createHash('sha256').update(raw).digest('hex').substring(0, 12);
    return `TOBS_${hash}`;
  }

  /**
   * Enforces the critical invariant: Observation != Validity.
   * If explicitValidFrom is null or undefined, returns NULL. Never falls back to observed_at.
   */
  public static sanitizeValidFrom(explicitValidFrom?: string | null): string | null {
    if (!explicitValidFrom || explicitValidFrom.trim().length === 0) {
      return null;
    }
    return explicitValidFrom;
  }

  /**
   * Enforces the critical invariant: Validity end date.
   */
  public static sanitizeValidTo(explicitValidTo?: string | null): string | null {
    if (!explicitValidTo || explicitValidTo.trim().length === 0) {
      return null;
    }
    return explicitValidTo;
  }
}
