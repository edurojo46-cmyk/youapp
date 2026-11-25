/**
 * ATLAS TEMPORAL GRAPH V1
 * Module: AtlasChangeDetector.ts
 * Path: src/lib/atlas/temporal/AtlasChangeDetector.ts
 * 
 * Non-Causal Change Detection Engine.
 * 
 * Detects state transitions between Truth Assertions and Temporal Observations:
 * - ROLE_APPEARED / ROLE_DISAPPEARED
 * - ORGANIZATION_CHANGED
 * - ADDRESS_APPEARED / ADDRESS_CHANGED
 * - ACTIVITY_APPEARED
 * - CONTACT_APPEARED / CONTACT_DISAPPEARED
 * - GEO_CHANGED
 * - COMPANY_OPENED / COMPANY_STATUS_CHANGED
 * - NEW_RELATION_OBSERVED
 * 
 * Strict Invariants:
 * - NO CAUSALITY INVENTED:
 *   If Juan works at Empresa A and later Empresa B is observed without an explicit exit date,
 *   we emit NEW_RELATION_OBSERVED / ROLE_APPEARED and classify Empresa A as UNKNOWN_TEMPORAL_RELATION.
 *   WE NEVER AFFIRM "Juan left Empresa A" (ROLE_DISAPPEARED) without explicit evidence!
 * - RE-OBSERVING SAME VALUE = 0 CHANGE EVENTS.
 * - IDEMPOTENCY: Same event evaluated twice generates 0 duplicates.
 */

import type { TruthAssertion } from '../truth/AtlasTruthAssertion.ts';
import type { TruthEvidence } from '../truth/AtlasTruthEvidence.ts';
import type { TemporalObservation } from './AtlasTemporalObservation.ts';
import {
  AtlasTemporalEventHelper,
  type TemporalEvent,
  type TemporalEventType,
  type EventNature
} from './AtlasTemporalEvent.ts';

export interface ChangeDetectionInput {
  newObservation: TemporalObservation;
  newAssertion: TruthAssertion;
  evidence: TruthEvidence;
  existingObservations: TemporalObservation[];
  existingAssertions: TruthAssertion[];
  isExplicitTermination?: boolean;
}

export class AtlasChangeDetector {
  /**
   * Evaluates state transitions and returns emitted temporal events.
   */
  public static detectChanges(input: ChangeDetectionInput): TemporalEvent[] {
    const {
      newObservation,
      newAssertion,
      evidence,
      existingObservations,
      existingAssertions,
      isExplicitTermination
    } = input;

    const events: TemporalEvent[] = [];
    const timeAnchor = newObservation.observed_at;
    const env = newObservation.environment;
    const now = new Date().toISOString();

    // 1. Check if this exact fact was already known (same predicate and same normalized value)
    const existingSameAssertion = existingAssertions.find(
      a => a.assertion_id === newAssertion.assertion_id ||
           (a.predicate === newAssertion.predicate && a.value_hash === newAssertion.value_hash)
    );

    // If this assertion already has prior observations, it is a RE-OBSERVATION of the same fact.
    // Invariant: Re-observing the same fact produces ZERO change events.
    const priorObservationsForSameAssertion = existingObservations.filter(
      o => (existingSameAssertion && o.assertion_id === existingSameAssertion.assertion_id) &&
           o.temporal_observation_id !== newObservation.temporal_observation_id
    );

    if (existingSameAssertion && priorObservationsForSameAssertion.length > 0 && !isExplicitTermination && !newObservation.valid_to) {
      // Corroboration / re-observation without change -> 0 change events
      return [];
    }

    // 2. Explicit Termination Handling (e.g. Document explicitly states cargo ended)
    if (isExplicitTermination || (newObservation.valid_to && newObservation.status === 'HISTORICAL')) {
      if (newAssertion.predicate === 'WORKS_AT' || newAssertion.predicate === 'HAS_ROLE') {
        const eventId = AtlasTemporalEventHelper.generateEventId(
          newAssertion.subject_id,
          'ROLE_DISAPPEARED',
          newAssertion.assertion_id,
          newAssertion.assertion_id,
          timeAnchor
        );
        events.push({
          event_id: eventId,
          subject_type: newAssertion.subject_type,
          subject_id: newAssertion.subject_id,
          event_type: 'ROLE_DISAPPEARED',
          temporal_semantics: 'EXPLICIT_HISTORICAL_EVENT',
          old_assertion_id: newAssertion.assertion_id,
          new_assertion_id: newAssertion.assertion_id,
          detected_at: now,
          event_nature: 'OBSERVED_CHANGE',
          confidence: 1.0,
          time_anchor: timeAnchor,
          environment: env,
          metadata: {
            valid_to: newObservation.valid_to,
            reason: 'Explicit termination date stated in physical evidence'
          },
          created_at: now
        });
        return events;
      }
    }

    // 3. Find competing prior assertions on the same predicate
    const priorCompetingAssertions = existingAssertions.filter(
      a => a.predicate === newAssertion.predicate && a.value_hash !== newAssertion.value_hash
    );

    // 4. Predicate-specific change classification
    switch (newAssertion.predicate) {
      case 'HAS_PHONE':
      case 'HAS_EMAIL':
      case 'HAS_LINKEDIN':
      case 'HAS_INSTAGRAM':
      case 'HAS_FACEBOOK': {
        // Contact appeared
        const eventId = AtlasTemporalEventHelper.generateEventId(
          newAssertion.subject_id,
          'CONTACT_APPEARED',
          null,
          newAssertion.assertion_id,
          timeAnchor
        );
        events.push({
          event_id: eventId,
          subject_type: newAssertion.subject_type,
          subject_id: newAssertion.subject_id,
          event_type: 'CONTACT_APPEARED',
          temporal_semantics: 'FIRST_OBSERVED',
          old_assertion_id: null,
          new_assertion_id: newAssertion.assertion_id,
          detected_at: now,
          event_nature: 'OBSERVED_CHANGE',
          confidence: newAssertion.confidence,
          time_anchor: timeAnchor,
          environment: env,
          metadata: {
            channel: newAssertion.predicate,
            value: newAssertion.value_normalized
          },
          created_at: now
        });
        break;
      }

      case 'WORKS_AT':
      case 'HAS_ROLE': {
        // A new role / employment relation is observed
        const appearedEventId = AtlasTemporalEventHelper.generateEventId(
          newAssertion.subject_id,
          'ROLE_APPEARED',
          null,
          newAssertion.assertion_id,
          timeAnchor
        );
        events.push({
          event_id: appearedEventId,
          subject_type: newAssertion.subject_type,
          subject_id: newAssertion.subject_id,
          event_type: 'ROLE_APPEARED',
          temporal_semantics: 'FIRST_OBSERVED',
          old_assertion_id: null,
          new_assertion_id: newAssertion.assertion_id,
          detected_at: now,
          event_nature: 'OBSERVED_CHANGE',
          confidence: newAssertion.confidence,
          time_anchor: timeAnchor,
          environment: env,
          metadata: {
            relation: `${newAssertion.predicate} -> ${newAssertion.value_normalized}`,
            valid_from: newObservation.valid_from
          },
          created_at: now
        });

        // Also emit NEW_RELATION_OBSERVED for explicit relation tracking
        const newRelEventId = AtlasTemporalEventHelper.generateEventId(
          newAssertion.subject_id,
          'NEW_RELATION_OBSERVED',
          null,
          newAssertion.assertion_id,
          timeAnchor
        );
        events.push({
          event_id: newRelEventId,
          subject_type: newAssertion.subject_type,
          subject_id: newAssertion.subject_id,
          event_type: 'NEW_RELATION_OBSERVED',
          temporal_semantics: 'FIRST_OBSERVED',
          old_assertion_id: null,
          new_assertion_id: newAssertion.assertion_id,
          detected_at: now,
          event_nature: 'OBSERVED_CHANGE',
          confidence: newAssertion.confidence,
          time_anchor: timeAnchor,
          environment: env,
          metadata: {
            relation: `${newAssertion.predicate} -> ${newAssertion.value_normalized}`
          },
          created_at: now
        });

        // If there were existing relations:
        // INVARIANT: DO NOT AFFIRM "Juan left previous company"!
        // Emit ORGANIZATION_CHANGED as DERIVED_CHANGE with note that older relation is preserved as UNKNOWN_TEMPORAL_RELATION.
        if (priorCompetingAssertions.length > 0) {
          const prior = priorCompetingAssertions[priorCompetingAssertions.length - 1];
          const orgEventId = AtlasTemporalEventHelper.generateEventId(
            newAssertion.subject_id,
            'ORGANIZATION_CHANGED',
            prior.assertion_id,
            newAssertion.assertion_id,
            timeAnchor
          );
          events.push({
            event_id: orgEventId,
            subject_type: newAssertion.subject_type,
            subject_id: newAssertion.subject_id,
            event_type: 'ORGANIZATION_CHANGED',
            temporal_semantics: 'REAL_TRANSITION',
            old_assertion_id: prior.assertion_id,
            new_assertion_id: newAssertion.assertion_id,
            detected_at: now,
            event_nature: 'DERIVED_CHANGE',
            confidence: 0.9,
            time_anchor: timeAnchor,
            environment: env,
            metadata: {
              previous_organization: prior.value_normalized,
              new_organization: newAssertion.value_normalized,
              relation_status_old: 'UNKNOWN_TEMPORAL_RELATION',
              invariance_note: 'Older relation preserved non-destructively. No departure causality invented.'
            },
            created_at: now
          });
        }
        break;
      }

      case 'COMPANY_ADDRESS':
      case 'HAS_GEO_RESIDENCE':
      case 'HAS_GEO_WORK': {
        const prior = priorCompetingAssertions.length > 0 ? priorCompetingAssertions[priorCompetingAssertions.length - 1] : null;
        const oldAddress = prior?.value_normalized;
        const newAddress = newAssertion.value_normalized;

        // Invariant: ADDRESS_CHANGED only exists if old_assertion_id != null AND old_address != new_address AND temporal_semantics = REAL_TRANSITION
        if (prior && prior.assertion_id && oldAddress && newAddress && oldAddress !== newAddress) {
          const eventId = AtlasTemporalEventHelper.generateEventId(
            newAssertion.subject_id,
            'ADDRESS_CHANGED',
            prior.assertion_id,
            newAssertion.assertion_id,
            timeAnchor
          );
          events.push({
            event_id: eventId,
            subject_type: newAssertion.subject_type,
            subject_id: newAssertion.subject_id,
            event_type: 'ADDRESS_CHANGED',
            temporal_semantics: 'REAL_TRANSITION',
            old_assertion_id: prior.assertion_id,
            new_assertion_id: newAssertion.assertion_id,
            detected_at: now,
            event_nature: 'OBSERVED_CHANGE',
            confidence: newAssertion.confidence,
            time_anchor: timeAnchor,
            environment: env,
            metadata: {
              old_address: oldAddress,
              new_address: newAddress
            },
            created_at: now
          });
        } else {
          // If first time observed in Atlas or no valid distinct prior address: ADDRESS_APPEARED, FIRST_OBSERVED. Nunca ADDRESS_CHANGED.
          const eventId = AtlasTemporalEventHelper.generateEventId(
            newAssertion.subject_id,
            'ADDRESS_APPEARED',
            null,
            newAssertion.assertion_id,
            timeAnchor
          );
          events.push({
            event_id: eventId,
            subject_type: newAssertion.subject_type,
            subject_id: newAssertion.subject_id,
            event_type: 'ADDRESS_APPEARED',
            temporal_semantics: 'FIRST_OBSERVED',
            old_assertion_id: null,
            new_assertion_id: newAssertion.assertion_id,
            detected_at: now,
            event_nature: 'OBSERVED_CHANGE',
            confidence: newAssertion.confidence,
            time_anchor: timeAnchor,
            environment: env,
            metadata: { address: newAssertion.value_normalized },
            created_at: now
          });
        }
        break;
      }

      case 'COMPANY_ACTIVITY':
      case 'HAS_GEO_ACTIVITY': {
        const eventId = AtlasTemporalEventHelper.generateEventId(
          newAssertion.subject_id,
          'ACTIVITY_APPEARED',
          null,
          newAssertion.assertion_id,
          timeAnchor
        );
        events.push({
          event_id: eventId,
          subject_type: newAssertion.subject_type,
          subject_id: newAssertion.subject_id,
          event_type: 'ACTIVITY_APPEARED',
          temporal_semantics: 'FIRST_OBSERVED',
          old_assertion_id: null,
          new_assertion_id: newAssertion.assertion_id,
          detected_at: now,
          event_nature: 'OBSERVED_CHANGE',
          confidence: newAssertion.confidence,
          time_anchor: timeAnchor,
          environment: env,
          metadata: { activity: newAssertion.value_normalized },
          created_at: now
        });
        break;
      }

      case 'COMPANY_NAME': {
        // A company name is an entity identifier.
        // It must NOT emit COMPANY_OPENED unless there is explicit opening date / constitution evidence in physical data.
        const hasExplicitOpening = Boolean(
          newObservation.valid_from || 
          evidence.evidence_metadata?.has_explicit_opening || 
          evidence.evidence_metadata?.opening_date ||
          evidence.evidence_metadata?.start_date ||
          evidence.evidence_metadata?.fecha_constitucion ||
          evidence.evidence_metadata?.is_opening
        );

        if (priorCompetingAssertions.length === 0) {
          if (hasExplicitOpening) {
            const eventId = AtlasTemporalEventHelper.generateEventId(
              newAssertion.subject_id,
              'COMPANY_OPENED',
              null,
              newAssertion.assertion_id,
              timeAnchor
            );
            events.push({
              event_id: eventId,
              subject_type: newAssertion.subject_type,
              subject_id: newAssertion.subject_id,
              event_type: 'COMPANY_OPENED',
              temporal_semantics: 'EXPLICIT_HISTORICAL_EVENT',
              old_assertion_id: null,
              new_assertion_id: newAssertion.assertion_id,
              detected_at: now,
              event_nature: 'OBSERVED_CHANGE',
              confidence: newAssertion.confidence,
              time_anchor: timeAnchor,
              environment: env,
              metadata: { company_name: newAssertion.value_normalized, reason: 'Explicit opening date in physical evidence' },
              created_at: now
            });
          }
          // Initial observation of company name without explicit opening date -> 0 change events!
        } else {
          const prior = priorCompetingAssertions[priorCompetingAssertions.length - 1];
          const eventId = AtlasTemporalEventHelper.generateEventId(
            newAssertion.subject_id,
            'COMPANY_STATUS_CHANGED',
            prior.assertion_id,
            newAssertion.assertion_id,
            timeAnchor
          );
          events.push({
            event_id: eventId,
            subject_type: newAssertion.subject_type,
            subject_id: newAssertion.subject_id,
            event_type: 'COMPANY_STATUS_CHANGED',
            temporal_semantics: 'REAL_TRANSITION',
            old_assertion_id: prior.assertion_id,
            new_assertion_id: newAssertion.assertion_id,
            detected_at: now,
            event_nature: 'DERIVED_CHANGE',
            confidence: newAssertion.confidence,
            time_anchor: timeAnchor,
            environment: env,
            metadata: {
              old_name: prior.value_normalized,
              new_name: newAssertion.value_normalized
            },
            created_at: now
          });
        }
        break;
      }

      default:
        // No event for general unclassified predicates
        break;
    }

    return events;
  }
}
