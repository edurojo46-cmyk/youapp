/**
 * ATLAS TEMPORAL GRAPH V1
 * Module: AtlasTemporalGraph.ts
 * Path: src/lib/atlas/temporal/AtlasTemporalGraph.ts
 * 
 * Central API Facade for Atlas Temporal Graph V1.
 * 
 * Answers:
 * - QUÉ sabemos (Truth Assertion)
 * - CUÁNDO lo vimos (Temporal Observation: observed_at, first_seen, last_seen, valid_from, valid_to)
 * - QUÉ cambió (Temporal Event: detected_at, event_type, old_assertion, new_assertion)
 * 
 * Strict Invariants:
 * - NO DUPLICAR TRUTH: Truth Graph is the authority on facts; Temporal Graph references assertion_id.
 * - OBSERVATION != VALIDITY: valid_from is null unless explicit in physical evidence.
 * - NO CAUSALITY INVENTED: Does not invent departures, growth, or expansions.
 * - IDEMPOTENCY: Re-processing identical evidence creates 0 duplicate events.
 * - FULL SOURCE TRACEABILITY: Event -> Assertion -> Evidence -> Route -> Source Genome.
 * - PREPARED CONSUMER: ITemporalSignalConsumer for future Opportunity Engine.
 */

import { AtlasTruthRepository } from '../truth/AtlasTruthRepository.ts';
import type { TruthAssertion } from '../truth/AtlasTruthAssertion.ts';
import type { TruthEvidence } from '../truth/AtlasTruthEvidence.ts';
import { AtlasTemporalRepository } from './AtlasTemporalRepository.ts';
import {
  AtlasTemporalCompiler,
  type TemporalCompilationOptions
} from './AtlasTemporalCompiler.ts';
import { AtlasChangeDetector } from './AtlasChangeDetector.ts';
import type { TemporalObservation, TemporalStatus } from './AtlasTemporalObservation.ts';
import type { TemporalEvent, TemporalEventType } from './AtlasTemporalEvent.ts';

export interface ITemporalSignalConsumer {
  consumerId: string;
  consumeTemporalEvent(event: TemporalEvent): Promise<void> | void;
}

export interface IngestionResult {
  observation: TemporalObservation;
  isNewObservation: boolean;
  events: TemporalEvent[];
  duplicateEventsCount: number;
}

export interface EventTraceabilityChain {
  event: TemporalEvent;
  assertion: TruthAssertion;
  evidence: TruthEvidence;
  source_id: string;
  route_id?: string;
  source_url?: string;
}

export class AtlasTemporalGraph {
  private static instance: AtlasTemporalGraph;
  private temporalRepo: AtlasTemporalRepository;
  private truthRepo: AtlasTruthRepository;
  private consumers: Map<string, ITemporalSignalConsumer> = new Map();

  public constructor(
    temporalRepo?: AtlasTemporalRepository,
    truthRepo?: AtlasTruthRepository
  ) {
    this.temporalRepo = temporalRepo || AtlasTemporalRepository.getInstance();
    this.truthRepo = truthRepo || AtlasTruthRepository.getInstance();
  }

  public static getInstance(
    temporalRepo?: AtlasTemporalRepository,
    truthRepo?: AtlasTruthRepository
  ): AtlasTemporalGraph {
    if (!AtlasTemporalGraph.instance) {
      AtlasTemporalGraph.instance = new AtlasTemporalGraph(temporalRepo, truthRepo);
    }
    return AtlasTemporalGraph.instance;
  }

  public registerSignalConsumer(consumer: ITemporalSignalConsumer): void {
    this.consumers.set(consumer.consumerId, consumer);
  }

  /**
   * Main Temporal Ingestion Flow:
   * TRUTH ASSERTION + EVIDENCE
   *       ↓
   * TEMPORAL OBSERVATION
   *       ↓
   * CHANGE DETECTOR
   *       ↓
   * TEMPORAL EVENT
   */
  public async ingestAssertion(params: {
    assertion: TruthAssertion;
    evidence: TruthEvidence;
    valid_from?: string | null;
    valid_to?: string | null;
    is_termination?: boolean;
    superseded_at?: string | null;
    status_override?: TemporalStatus;
    environment?: 'TEST' | 'PRODUCTION';
  }): Promise<IngestionResult> {
    const env = params.environment || params.assertion.environment || 'PRODUCTION';

    // 1. Get existing temporal context for the subject (from cache or DB)
    let existingAssertions = this.truthRepo.getAssertionsBySubject(params.assertion.subject_id, env);
    if (existingAssertions.length === 0) {
      existingAssertions = await this.truthRepo.getAssertionsBySubjectFromDb(params.assertion.subject_id, env);
    }
    const existingObservations: TemporalObservation[] = [];
    for (const ast of existingAssertions) {
      let obsList = this.temporalRepo.getObservationsForAssertion(ast.assertion_id, env);
      if (obsList.length === 0) {
        obsList = await this.temporalRepo.getObservationsForAssertionFromDb(ast.assertion_id, env);
      }
      existingObservations.push(...obsList);
    }

    // 2. Compile Temporal Observation (enforcing Observation != Validity)
    const compilationOpts: TemporalCompilationOptions = {
      valid_from: params.valid_from,
      valid_to: params.valid_to,
      is_termination: params.is_termination,
      superseded_at: params.superseded_at,
      status_override: params.status_override,
      environment: env
    };

    const newObservation = AtlasTemporalCompiler.compileObservation(
      params.assertion,
      params.evidence,
      compilationOpts
    );

    // 3. Persist Observation
    const obsRecord = await this.temporalRepo.recordObservation(newObservation);

    // 4. Change Detection
    const detectedEvents = AtlasChangeDetector.detectChanges({
      newObservation: obsRecord.observation,
      newAssertion: params.assertion,
      evidence: params.evidence,
      existingObservations,
      existingAssertions,
      isExplicitTermination: params.is_termination
    });

    // 5. If new relation observed without explicit exit date, preserve old relation as UNKNOWN_TEMPORAL_RELATION
    if (params.assertion.predicate === 'WORKS_AT' || params.assertion.predicate === 'HAS_ROLE') {
      const priorCompeting = existingAssertions.filter(
        a => a.predicate === params.assertion.predicate && a.value_hash !== params.assertion.value_hash
      );
      for (const comp of priorCompeting) {
        const priorObs = this.temporalRepo.getObservationsForAssertion(comp.assertion_id, env);
        for (const o of priorObs) {
          if (o.status === 'CURRENT' && !o.valid_to) {
            await this.temporalRepo.updateObservationStatus(o.temporal_observation_id, 'UNKNOWN_TEMPORAL_RELATION');
          }
        }
      }
    }

    // 6. Record events idempotently
    const savedEvents: TemporalEvent[] = [];
    let duplicateEventsCount = 0;

    for (const evt of detectedEvents) {
      const res = await this.temporalRepo.recordEvent(evt);
      if (res.isNew) {
        savedEvents.push(res.event);
        // Dispatch to registered signal consumers (prepared for Opportunity Engine)
        for (const consumer of this.consumers.values()) {
          try {
            await consumer.consumeTemporalEvent(res.event);
          } catch (err: any) {
            console.warn(`[AtlasTemporalGraph] Consumer ${consumer.consumerId} error:`, err.message);
          }
        }
      } else {
        duplicateEventsCount++;
      }
    }

    return {
      observation: obsRecord.observation,
      isNewObservation: obsRecord.isNew,
      events: savedEvents,
      duplicateEventsCount
    };
  }

  /**
   * Returns complete timeline of observations for an entity, sorted chronologically.
   */
  public getTimelineForSubject(
    subject_id: string,
    environment?: 'TEST' | 'PRODUCTION'
  ): { assertion: TruthAssertion; observation: TemporalObservation; evidence: TruthEvidence }[] {
    const assertions = this.truthRepo.getAssertionsBySubject(subject_id, environment);
    const timeline: { assertion: TruthAssertion; observation: TemporalObservation; evidence: TruthEvidence }[] = [];

    for (const ast of assertions) {
      const obsList = this.temporalRepo.getObservationsForAssertion(ast.assertion_id, environment);
      const evList = this.truthRepo.getEvidenceForAssertion(ast.assertion_id);

      for (const obs of obsList) {
        const matchingEv = evList.find(e => e.evidence_id === obs.evidence_id) || evList[0];
        if (matchingEv) {
          timeline.push({
            assertion: ast,
            observation: obs,
            evidence: matchingEv
          });
        }
      }
    }

    // Sort by observed_at ASC
    timeline.sort((a, b) => new Date(a.observation.observed_at).getTime() - new Date(b.observation.observed_at).getTime());
    return timeline;
  }

  /**
   * Returns all temporal change events for an entity.
   */
  public getEventsForSubject(
    subject_id: string,
    environment?: 'TEST' | 'PRODUCTION'
  ): TemporalEvent[] {
    return this.temporalRepo.getEventsForSubject(subject_id, environment);
  }

  /**
   * Navigates complete traceability chain:
   * TEMPORAL EVENT -> ASSERTION -> EVIDENCE -> ROUTE -> SOURCE GENOME
   */
  public getTraceabilityChain(event_id: string): EventTraceabilityChain | null {
    const allEvents = this.temporalRepo.getAllEvents();
    const event = allEvents.find(e => e.event_id === event_id);
    if (!event) return null;

    const assertion = this.truthRepo.getAssertionById(event.new_assertion_id);
    if (!assertion) return null;

    const evidences = this.truthRepo.getEvidenceForAssertion(assertion.assertion_id);
    const evidence = evidences[0];
    if (!evidence) return null;

    return {
      event,
      assertion,
      evidence,
      source_id: evidence.source_id,
      route_id: evidence.route_id,
      source_url: evidence.source_url
    };
  }

  public getTemporalRepository(): AtlasTemporalRepository {
    return this.temporalRepo;
  }

  public getTruthRepository(): AtlasTruthRepository {
    return this.truthRepo;
  }
}
