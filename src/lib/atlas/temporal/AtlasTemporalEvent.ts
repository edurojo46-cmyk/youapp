/**
 * ATLAS TEMPORAL GRAPH V1
 * Module: AtlasTemporalEvent.ts
 * Path: src/lib/atlas/temporal/AtlasTemporalEvent.ts
 * 
 * Temporal Event Model.
 * Answers: WHAT changed.
 * 
 * Invariants:
 * - NO CAUSALITY INVENTED:
 *   Does not invent reasons, needs, growth, expansion, or departures without explicit evidence.
 * - IDEMPOTENCY:
 *   Event ID is a deterministic hash of (subject_id + event_type + old_assertion + new_assertion + time_anchor).
 *   Re-evaluating the same evidence generates 0 duplicate events.
 * - EVENT NATURE:
 *   OBSERVED_CHANGE (explicit in evidence) vs DERIVED_CHANGE (structural difference observed).
 *   Never emits INFERRED_OPPORTUNITY (reserved for future Opportunity Engine).
 */

import crypto from 'crypto';

export type TemporalEventType =
  | 'ROLE_APPEARED'
  | 'ROLE_DISAPPEARED'
  | 'ORGANIZATION_CHANGED'
  | 'ADDRESS_APPEARED'
  | 'ADDRESS_CHANGED'
  | 'ACTIVITY_APPEARED'
  | 'CONTACT_APPEARED'
  | 'CONTACT_DISAPPEARED'
  | 'GEO_CHANGED'
  | 'COMPANY_OPENED'
  | 'COMPANY_STATUS_CHANGED'
  | 'NEW_RELATION_OBSERVED';

export type EventNature = 'OBSERVED_CHANGE' | 'DERIVED_CHANGE';

export type TemporalSemantics =
  | 'FIRST_OBSERVED'
  | 'REAL_TRANSITION'
  | 'EXPLICIT_HISTORICAL_EVENT'
  | 'REOBSERVATION';

export interface TemporalEvent {
  event_id: string;
  subject_type: 'PERSON' | 'COMPANY' | 'ORGANIZATION';
  subject_id: string;
  event_type: TemporalEventType;
  temporal_semantics: TemporalSemantics;
  old_assertion_id: string | null;
  new_assertion_id: string;
  detected_at: string;
  event_nature: EventNature;
  confidence: number;
  time_anchor: string;
  environment: 'TEST' | 'PRODUCTION';
  metadata?: Record<string, any>;
  created_at: string;
}

export class AtlasTemporalEventHelper {
  /**
   * Generates a stable deterministic event ID for idempotent event processing.
   */
  public static generateEventId(
    subject_id: string,
    event_type: TemporalEventType,
    old_assertion_id: string | null,
    new_assertion_id: string,
    time_anchor: string
  ): string {
    const raw = `${subject_id}:${event_type}:${old_assertion_id || 'NULL'}:${new_assertion_id}:${time_anchor}`;
    const hash = crypto.createHash('sha256').update(raw).digest('hex').substring(0, 16);
    return `EVT_${event_type}_${hash}`;
  }
}
