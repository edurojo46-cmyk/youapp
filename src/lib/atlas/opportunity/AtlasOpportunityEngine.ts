/**
 * ATLAS OPPORTUNITY ENGINE V1
 * Module: AtlasOpportunityEngine.ts
 * Path: src/lib/atlas/opportunity/AtlasOpportunityEngine.ts
 * 
 * Central API Facade for Atlas Opportunity Engine V1.
 * 
 * Architectural Invariants:
 * - TRUTH = qué observamos (Facts).
 * - TEMPORAL = qué cambió (Events / Observations).
 * - OPPORTUNITY = qué podría significar comercialmente (Hypotheses / Inferred).
 * - OPPORTUNITY NEVER WRITES TO TRUTH:
 *   Opportunity Engine strictly reads Truth and Temporal layers; it NEVER modifies Truth Graph.
 *   OPPORTUNITY_TO_TRUTH_WRITES = 0.
 * - FULL TRACEABILITY:
 *   OPPORTUNITY -> SIGNAL -> TEMPORAL EVENT -> ASSERTION -> EVIDENCE -> ROUTE -> SOURCE GENOME.
 * - EXPLAINABILITY:
 *   Separates observed facts from inferred commercial hypothesis.
 */

import { AtlasTruthRepository } from '../truth/AtlasTruthRepository.ts';
import type { TruthAssertion } from '../truth/AtlasTruthAssertion.ts';
import type { TruthEvidence } from '../truth/AtlasTruthEvidence.ts';
import { AtlasTemporalRepository } from '../temporal/AtlasTemporalRepository.ts';
import type { TemporalEvent } from '../temporal/AtlasTemporalEvent.ts';
import type { ITemporalSignalConsumer } from '../temporal/AtlasTemporalGraph.ts';

import {
  AtlasOpportunitySignalHelper,
  type OpportunitySignal,
  type OpportunitySignalType
} from './AtlasOpportunitySignal.ts';
import {
  AtlasOpportunityHypothesisHelper,
  type OpportunityHypothesis,
  type OpportunityType
} from './AtlasOpportunityHypothesis.ts';
import {
  AtlasOpportunityEvidenceHelper,
  type OpportunityEvidenceLink
} from './AtlasOpportunityEvidence.ts';
import { AtlasOpportunityRepository } from './AtlasOpportunityRepository.ts';
import {
  AtlasOpportunityRuleEngine,
  type ProductProfile,
  type ProductFitResult
} from './AtlasOpportunityRuleEngine.ts';

export interface FullOpportunityTrace {
  opportunity: OpportunityHypothesis;
  supporting_signals: OpportunitySignal[];
  evidence_links: Array<{
    link: OpportunityEvidenceLink;
    assertion?: TruthAssertion;
    evidence?: TruthEvidence;
    temporal_event?: TemporalEvent;
    source_id: string;
    route_id?: string;
  }>;
}

export class AtlasOpportunityEngine implements ITemporalSignalConsumer {
  private static instance: AtlasOpportunityEngine;
  public consumerId: string = 'ATLAS_OPPORTUNITY_ENGINE_V1';

  private oppRepo: AtlasOpportunityRepository;
  private truthRepo: AtlasTruthRepository;
  private temporalRepo: AtlasTemporalRepository;
  private truthWritesCount: number = 0; // Strictly tracks any attempted write to Truth (must remain 0)

  public constructor(
    oppRepo?: AtlasOpportunityRepository,
    truthRepo?: AtlasTruthRepository,
    temporalRepo?: AtlasTemporalRepository
  ) {
    this.oppRepo = oppRepo || AtlasOpportunityRepository.getInstance();
    this.truthRepo = truthRepo || AtlasTruthRepository.getInstance();
    this.temporalRepo = temporalRepo || AtlasTemporalRepository.getInstance();
  }

  public static getInstance(
    oppRepo?: AtlasOpportunityRepository,
    truthRepo?: AtlasTruthRepository,
    temporalRepo?: AtlasTemporalRepository
  ): AtlasOpportunityEngine {
    if (!AtlasOpportunityEngine.instance) {
      AtlasOpportunityEngine.instance = new AtlasOpportunityEngine(oppRepo, truthRepo, temporalRepo);
    }
    return AtlasOpportunityEngine.instance;
  }

  /**
   * Consumes a temporal event automatically via ITemporalSignalConsumer.
   * Maps temporal changes into qualified commercial signals.
   */
  public async consumeTemporalEvent(event: TemporalEvent): Promise<void> {
    const timeAnchor = event.time_anchor || event.detected_at;
    const env = event.environment;

    // Fetch the physical assertion backing the event to extract source and route
    const assertion = this.truthRepo.getAssertionById(event.new_assertion_id);
    const evidences = assertion ? this.truthRepo.getEvidenceForAssertion(assertion.assertion_id) : [];
    const sourceId = evidences[0]?.source_id || 'SRC_TEMPORAL_GRAPH';
    const routeId = evidences[0]?.route_id;

    const isRealOrExplicit = event.temporal_semantics === 'REAL_TRANSITION' || event.temporal_semantics === 'EXPLICIT_HISTORICAL_EVENT';
    // Temporal semantics weighting: REAL_TRANSITION has full temporal weight (recency assumed);
    // FIRST_OBSERVED has lower temporal weight and DOES NOT assume recency (first_seen_in_atlas != happened_now_in_world)
    const temporalWeight = isRealOrExplicit ? 1.0 : 0.5;
    const qualityScore = Math.round(Number(event.confidence) * temporalWeight * 100) / 100;

    switch (event.event_type) {
      case 'COMPANY_OPENED':
        await this.emitSignal({
          subject_type: event.subject_type,
          subject_id: event.subject_id,
          signal_type: 'COMPANY_OPENED',
          temporal_semantics: event.temporal_semantics,
          assertion_id: event.new_assertion_id,
          temporal_event_id: event.event_id,
          source_id: sourceId,
          route_id: routeId,
          time_anchor: timeAnchor,
          quality_score: qualityScore,
          payload: { 
            event_type: event.event_type, 
            temporal_semantics: event.temporal_semantics,
            recency_assumed: isRealOrExplicit,
            description: 'Constitución o apertura de empresa documentada con fecha explícita' 
          },
          environment: env
        });
        break;

      case 'ADDRESS_APPEARED':
        await this.emitSignal({
          subject_type: event.subject_type,
          subject_id: event.subject_id,
          signal_type: 'ADDRESS_APPEARED',
          temporal_semantics: 'FIRST_OBSERVED',
          assertion_id: event.new_assertion_id,
          temporal_event_id: event.event_id,
          source_id: sourceId,
          route_id: routeId,
          time_anchor: timeAnchor,
          quality_score: qualityScore,
          payload: { 
            event_type: event.event_type, 
            temporal_semantics: 'FIRST_OBSERVED',
            recency_assumed: false,
            description: 'Dirección o sede observada por primera vez en Atlas (sin recencia asumida)' 
          },
          environment: env
        });
        break;

      case 'ADDRESS_CHANGED': {
        const oldAssertionId = event.old_assertion_id;
        const oldAddr = event.metadata?.old_address;
        const newAddr = event.metadata?.new_address;
        const isRealTransition = event.temporal_semantics === 'REAL_TRANSITION' &&
                                 oldAssertionId != null &&
                                 Boolean(oldAddr && newAddr && oldAddr !== newAddr);

        if (isRealTransition) {
          await this.emitSignal({
            subject_type: event.subject_type,
            subject_id: event.subject_id,
            signal_type: 'ADDRESS_CHANGED',
            temporal_semantics: 'REAL_TRANSITION',
            assertion_id: event.new_assertion_id,
            temporal_event_id: event.event_id,
            source_id: sourceId,
            route_id: routeId,
            time_anchor: timeAnchor,
            quality_score: qualityScore,
            payload: { 
              event_type: event.event_type, 
              temporal_semantics: 'REAL_TRANSITION',
              old_assertion_id: oldAssertionId,
              old_address: oldAddr,
              new_address: newAddr,
              recency_assumed: true,
              description: `Relocalización o cambio verificado de domicilio respecto a estado previo (${oldAddr} -> ${newAddr})` 
            },
            environment: env
          });
        } else {
          // Si Atlas observa una dirección por primera vez: ADDRESS_APPEARED, temporal_semantics = FIRST_OBSERVED. Nunca ADDRESS_CHANGED.
          await this.emitSignal({
            subject_type: event.subject_type,
            subject_id: event.subject_id,
            signal_type: 'ADDRESS_APPEARED',
            temporal_semantics: 'FIRST_OBSERVED',
            assertion_id: event.new_assertion_id,
            temporal_event_id: event.event_id,
            source_id: sourceId,
            route_id: routeId,
            time_anchor: timeAnchor,
            quality_score: qualityScore,
            payload: { 
              event_type: 'ADDRESS_APPEARED', 
              temporal_semantics: 'FIRST_OBSERVED',
              recency_assumed: false,
              description: 'Dirección o sede observada por primera vez en Atlas (sin recencia asumida)' 
            },
            environment: env
          });
        }
        break;
      }

      case 'ROLE_APPEARED':
        await this.emitSignal({
          subject_type: event.subject_type,
          subject_id: event.subject_id,
          signal_type: 'NEW_ROLE',
          temporal_semantics: event.temporal_semantics,
          assertion_id: event.new_assertion_id,
          temporal_event_id: event.event_id,
          source_id: sourceId,
          route_id: routeId,
          time_anchor: timeAnchor,
          quality_score: qualityScore,
          payload: { 
            event_type: event.event_type, 
            temporal_semantics: event.temporal_semantics,
            recency_assumed: isRealOrExplicit,
            description: 'Nuevo cargo o rol profesional verificado' 
          },
          environment: env
        });
        break;

      case 'ORGANIZATION_CHANGED':
        await this.emitSignal({
          subject_type: event.subject_type,
          subject_id: event.subject_id,
          signal_type: 'ORGANIZATION_CHANGED',
          temporal_semantics: 'REAL_TRANSITION',
          assertion_id: event.new_assertion_id,
          temporal_event_id: event.event_id,
          source_id: sourceId,
          route_id: routeId,
          time_anchor: timeAnchor,
          quality_score: qualityScore,
          payload: { 
            event_type: event.event_type, 
            temporal_semantics: 'REAL_TRANSITION',
            recency_assumed: true,
            description: 'Cambio o transición de organización observada respecto a estado previo' 
          },
          environment: env
        });
        break;

      case 'CONTACT_APPEARED':
        await this.emitSignal({
          subject_type: event.subject_type,
          subject_id: event.subject_id,
          signal_type: 'CONTACT_APPEARED',
          temporal_semantics: 'FIRST_OBSERVED',
          assertion_id: event.new_assertion_id,
          temporal_event_id: event.event_id,
          source_id: sourceId,
          route_id: routeId,
          time_anchor: timeAnchor,
          quality_score: qualityScore,
          payload: { 
            event_type: event.event_type, 
            temporal_semantics: 'FIRST_OBSERVED',
            recency_assumed: false,
            description: 'Nuevo canal de contacto verificado' 
          },
          environment: env
        });
        break;

      case 'ACTIVITY_APPEARED':
        await this.emitSignal({
          subject_type: event.subject_type,
          subject_id: event.subject_id,
          signal_type: 'ACTIVITY_APPEARED',
          temporal_semantics: 'FIRST_OBSERVED',
          assertion_id: event.new_assertion_id,
          temporal_event_id: event.event_id,
          source_id: sourceId,
          route_id: routeId,
          time_anchor: timeAnchor,
          quality_score: qualityScore,
          payload: { 
            event_type: event.event_type, 
            temporal_semantics: 'FIRST_OBSERVED',
            recency_assumed: false,
            description: 'Nueva actividad económica o rubro declarado' 
          },
          environment: env
        });
        break;

      default:
        break;
    }
  }

  /**
   * Emits and persists a single verified commercial signal.
   */
  public async emitSignal(params: {
    subject_type: 'PERSON' | 'COMPANY' | 'ORGANIZATION';
    subject_id: string;
    signal_type: OpportunitySignalType;
    temporal_semantics?: any;
    assertion_id: string;
    temporal_event_id?: string | null;
    source_id: string;
    route_id?: string | null;
    time_anchor?: string;
    quality_score?: number;
    payload?: Record<string, any>;
    environment?: 'TEST' | 'PRODUCTION';
  }): Promise<OpportunitySignal> {
    const now = new Date().toISOString();
    const timeAnchor = params.time_anchor || now;
    const env = params.environment || 'PRODUCTION';

    let signalType = params.signal_type;
    let temporalSemantics = params.temporal_semantics || 'FIRST_OBSERVED';

    // Invariant: ADDRESS_CHANGED sólo puede existir si old_assertion_id != null AND old_address != new_address AND temporal_semantics = REAL_TRANSITION
    // Si Atlas observa una dirección por primera vez: ADDRESS_APPEARED, temporal_semantics = FIRST_OBSERVED. Nunca ADDRESS_CHANGED.
    if (signalType === 'ADDRESS_CHANGED') {
      const hasOldAssertion = Boolean(params.payload?.old_assertion_id);
      const isReal = temporalSemantics === 'REAL_TRANSITION';
      const addressesDiffer = Boolean(
        params.payload?.old_address &&
        params.payload?.new_address &&
        params.payload.old_address !== params.payload.new_address
      );

      if (!hasOldAssertion || !isReal || !addressesDiffer) {
        signalType = 'ADDRESS_APPEARED';
        temporalSemantics = 'FIRST_OBSERVED';
        if (params.payload) {
          params.payload.event_type = 'ADDRESS_APPEARED';
          params.payload.temporal_semantics = 'FIRST_OBSERVED';
          params.payload.recency_assumed = false;
          params.payload.description = 'Dirección o sede observada por primera vez en Atlas (sin recencia asumida)';
        }
      }
    }

    const signalId = AtlasOpportunitySignalHelper.generateSignalId(
      params.subject_id,
      signalType,
      params.assertion_id,
      timeAnchor
    );

    const signal: OpportunitySignal = {
      signal_id: signalId,
      subject_type: params.subject_type,
      subject_id: params.subject_id,
      signal_type: signalType,
      temporal_semantics: temporalSemantics,
      assertion_id: params.assertion_id,
      temporal_event_id: params.temporal_event_id || null,
      source_id: params.source_id,
      route_id: params.route_id || null,
      detected_at: now,
      time_anchor: timeAnchor,
      quality_score: params.quality_score !== undefined ? params.quality_score : 1.0,
      payload: params.payload || {},
      environment: env,
      created_at: now
    };

    const res = await this.oppRepo.saveSignal(signal);
    return res.signal;
  }

  /**
   * Evaluates and synthesizes commercial opportunities for an entity.
   */
  public async evaluateOpportunities(
    subject_id: string,
    environment: 'TEST' | 'PRODUCTION' = 'PRODUCTION'
  ): Promise<OpportunityHypothesis[]> {
    const signals = this.oppRepo.getSignalsForSubject(subject_id, environment);
    if (signals.length === 0) return [];

    const subjectType = signals[0].subject_type;
    const synthesized = AtlasOpportunityRuleEngine.synthesizeOpportunities(
      subjectType,
      subject_id,
      signals,
      environment
    );

    const results: OpportunityHypothesis[] = [];

    for (const opp of synthesized) {
      // 1. Save or update opportunity
      const oppRecord = await this.oppRepo.saveOpportunity(opp);
      results.push(oppRecord.opportunity);

      // 2. Link supporting evidence
      const supportingSignals = signals.filter(s => opp.supporting_signals.includes(s.signal_id));
      for (const sig of supportingSignals) {
        const linkId = AtlasOpportunityEvidenceHelper.generateLinkId(
          oppRecord.opportunity.opportunity_id,
          sig.signal_id,
          sig.assertion_id
        );

        const link: OpportunityEvidenceLink = {
          opportunity_evidence_id: linkId,
          opportunity_id: oppRecord.opportunity.opportunity_id,
          signal_id: sig.signal_id,
          assertion_id: sig.assertion_id,
          temporal_event_id: sig.temporal_event_id || null,
          source_id: sig.source_id,
          route_id: sig.route_id || null,
          observed_at: sig.time_anchor,
          role_in_hypothesis: `Indicador de apoyo: ${sig.signal_type}`,
          weight: sig.quality_score,
          environment,
          created_at: new Date().toISOString()
        };

        await this.oppRepo.saveEvidenceLink(link);
      }
    }

    return results;
  }

  /**
   * Evaluates product fit deterministically without LLM hallucination.
   */
  public evaluateProductFit(
    opportunity: OpportunityHypothesis,
    product: ProductProfile,
    entityContext?: any
  ): ProductFitResult {
    return AtlasOpportunityRuleEngine.evaluateProductFit(opportunity, product, entityContext);
  }

  /**
   * Navigates complete traceability:
   * OPPORTUNITY -> SIGNAL -> TEMPORAL EVENT -> ASSERTION -> EVIDENCE -> ROUTE -> SOURCE
   */
  public getFullTraceability(opportunity_id: string): FullOpportunityTrace | null {
    const opps = this.oppRepo.getAllOpportunities();
    const opportunity = opps.find(o => o.opportunity_id === opportunity_id);
    if (!opportunity) return null;

    const links = this.oppRepo.getEvidenceLinksForOpportunity(opportunity_id);
    const allSignals = this.oppRepo.getAllSignals();
    const supportingSignals = allSignals.filter(s => opportunity.supporting_signals.includes(s.signal_id));

    const evidenceLinksWithData = links.map(link => {
      const assertion = this.truthRepo.getAssertionById(link.assertion_id);
      const evidences = assertion ? this.truthRepo.getEvidenceForAssertion(assertion.assertion_id) : [];
      const physicalEvidence = evidences.find(e => e.source_id === link.source_id) || evidences[0];

      let temporalEvent: TemporalEvent | undefined;
      if (link.temporal_event_id) {
        temporalEvent = this.temporalRepo.getAllEvents().find(e => e.event_id === link.temporal_event_id);
      }

      return {
        link,
        assertion,
        evidence: physicalEvidence,
        temporal_event: temporalEvent,
        source_id: link.source_id,
        route_id: link.route_id || physicalEvidence?.route_id
      };
    });

    return {
      opportunity,
      supporting_signals: supportingSignals,
      evidence_links: evidenceLinksWithData
    };
  }

  /**
   * Invariant: Opportunity Engine NEVER writes to Truth Graph.
   */
  public getOpportunityToTruthWrites(): number {
    return this.truthWritesCount;
  }

  public getRepository(): AtlasOpportunityRepository {
    return this.oppRepo;
  }
}
