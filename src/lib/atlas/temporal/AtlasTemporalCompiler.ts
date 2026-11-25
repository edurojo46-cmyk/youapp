/**
 * ATLAS TEMPORAL GRAPH V1
 * Module: AtlasTemporalCompiler.ts
 * Path: src/lib/atlas/temporal/AtlasTemporalCompiler.ts
 * 
 * Compiles Truth Assertions and Evidences into Temporal Observations.
 * 
 * Strict Invariants:
 * - OBSERVATION != VALIDITY:
 *   If valid_from is not explicitly indicated in physical evidence, it remains NULL.
 *   Never fabricate valid_from from observed_at!
 * - Temporal status tracks CURRENT, HISTORICAL, SUPERSEDED, CONFLICTING, UNKNOWN_TEMPORAL_RELATION.
 */

import type { TruthAssertion } from '../truth/AtlasTruthAssertion.ts';
import type { TruthEvidence } from '../truth/AtlasTruthEvidence.ts';
import {
  AtlasTemporalObservationHelper,
  type TemporalObservation,
  type TemporalStatus
} from './AtlasTemporalObservation.ts';

export interface TemporalCompilationOptions {
  valid_from?: string | null;
  valid_to?: string | null;
  is_termination?: boolean;
  superseded_at?: string | null;
  status_override?: TemporalStatus;
  environment?: 'TEST' | 'PRODUCTION';
}

export class AtlasTemporalCompiler {
  /**
   * Compiles an assertion and its evidence into a Temporal Observation.
   */
  public static compileObservation(
    assertion: TruthAssertion,
    evidence: TruthEvidence,
    options?: TemporalCompilationOptions
  ): TemporalObservation {
    const now = new Date().toISOString();
    const observed_at = evidence.observed_at || now;

    // Strict invariant: valid_from must be explicitly provided in physical evidence or remains null
    const valid_from = AtlasTemporalObservationHelper.sanitizeValidFrom(options?.valid_from);
    const valid_to = AtlasTemporalObservationHelper.sanitizeValidTo(options?.valid_to);

    let status: TemporalStatus = options?.status_override || 'CURRENT';
    if (!options?.status_override) {
      if (options?.is_termination || valid_to) {
        status = 'HISTORICAL';
      } else if (assertion.status === 'CONFLICTING') {
        status = 'CONFLICTING';
      } else if (assertion.status === 'UNKNOWN_TEMPORAL_RELATION') {
        status = 'UNKNOWN_TEMPORAL_RELATION';
      } else {
        status = 'CURRENT';
      }
    }

    const observation_id = AtlasTemporalObservationHelper.generateObservationId(
      assertion.assertion_id,
      evidence.evidence_id
    );

    const env = options?.environment || assertion.environment || evidence.environment || 'PRODUCTION';

    return {
      temporal_observation_id: observation_id,
      assertion_id: assertion.assertion_id,
      evidence_id: evidence.evidence_id,
      observed_at,
      valid_from,
      valid_to,
      first_seen: assertion.first_seen || observed_at,
      last_seen: assertion.last_seen || observed_at,
      superseded_at: options?.superseded_at || null,
      status,
      environment: env,
      created_at: now
    };
  }
}
