/**
 * ATLAS TRUTH GRAPH V1
 * Module: AtlasTruthGraph.ts
 * Path: src/lib/atlas/truth/AtlasTruthGraph.ts
 * 
 * Central API Facade for Atlas Truth Graph V1.
 * Represents:
 * ENTITY -> ASSERTION -> VALUE -> EVIDENCE -> SOURCE -> OBSERVED_AT.
 * 
 * Architectural Invariants:
 * - IDENTITY AUTHORITY = SSOT (canonical 5,300,992 persons).
 * - ATTRIBUTE TRUTH AUTHORITY = TRUTH GRAPH.
 * - Truth Graph does NOT replace gates; it receives facts that passed gates/tesla.
 * - OBSERVED != DERIVED != INFERRED.
 * - Multi-source evidence accumulates onto 1 assertion without duplication.
 * - Non-destructive conflict preservation.
 */

import { AtlasTruthRepository } from './AtlasTruthRepository.ts';
import {
  AtlasTruthAssertionHelper,
  type TruthAssertion,
  type TruthPredicate,
  type TruthNature
} from './AtlasTruthAssertion.ts';
import {
  AtlasTruthEvidenceHelper,
  type TruthEvidence,
  type EvidenceMethod
} from './AtlasTruthEvidence.ts';
import {
  AtlasTruthGraphCompiler,
  type EntityObservationBundle,
  type CompiledAssertionBundle
} from './AtlasTruthGraphCompiler.ts';

export interface ProvenanceChainStep {
  assertion: TruthAssertion;
  evidences: TruthEvidence[];
}

/**
 * Future Stubs (Prepared; not fully executed in V1)
 */
export interface ITemporalGraph {
  trackStateTransition(entityId: string, predicate: string, fromValue: any, toValue: any, timestamp: string): void;
  getHistoricalObservation(entityId: string, timestamp: string): any;
}

export interface IOpportunityEngine {
  evaluateCommercialIntent(entityId: string, assertions: TruthAssertion[]): { opportunityScore: number; reason: string };
}

export class AtlasTruthGraph {
  private static instance: AtlasTruthGraph;
  private repository: AtlasTruthRepository;

  public constructor(repo?: AtlasTruthRepository) {
    this.repository = repo || AtlasTruthRepository.getInstance();
  }

  public static getInstance(repo?: AtlasTruthRepository): AtlasTruthGraph {
    if (!AtlasTruthGraph.instance) {
      AtlasTruthGraph.instance = new AtlasTruthGraph(repo);
    }
    return AtlasTruthGraph.instance;
  }

  /**
   * Records a single atomic fact.
   */
  public async recordFact(params: {
    subject_type: 'PERSON' | 'COMPANY' | 'ORGANIZATION';
    subject_id: string;
    predicate: TruthPredicate;
    value: any;
    source_id?: string;
    route_id?: string;
    source_url?: string;
    method?: EvidenceMethod;
    fragment?: string;
    truth_nature?: TruthNature;
    confidence?: number;
    environment?: 'TEST' | 'PRODUCTION';
    metadata?: Record<string, any>;
  }): Promise<{ assertion: TruthAssertion; isNew: boolean; evidenceAdded: boolean }> {
    const bundle: EntityObservationBundle = {
      subject_type: params.subject_type,
      subject_id: params.subject_id,
      environment: params.environment || 'PRODUCTION',
      attributes: [
        {
          predicate: params.predicate,
          value: params.value,
          truth_nature: params.truth_nature,
          confidence: params.confidence,
          evidence: params.source_id ? {
            source_id: params.source_id,
            route_id: params.route_id,
            source_url: params.source_url,
            method: params.method,
            fragment: params.fragment,
            metadata: params.metadata
          } : undefined
        }
      ]
    };

    const compiled = AtlasTruthGraphCompiler.compileBundle(bundle);
    if (compiled.length === 0) {
      throw new Error(`Invalid fact: value is empty for predicate ${params.predicate}`);
    }

    const { assertion, evidence } = compiled[0];
    return this.repository.recordAssertion(assertion, evidence);
  }

  /**
   * Ingests a multi-attribute observation bundle with separated attribute-level provenance.
   */
  public async ingestBundle(bundle: EntityObservationBundle): Promise<CompiledAssertionBundle[]> {
    const compiled = AtlasTruthGraphCompiler.compileBundle(bundle);
    for (const item of compiled) {
      await this.repository.recordAssertion(item.assertion, item.evidence);
    }
    return compiled;
  }

  /**
   * Queries all verified facts for an entity.
   */
  public getAssertionsForSubject(subject_id: string, environment: 'PRODUCTION' | 'TEST' = 'PRODUCTION'): TruthAssertion[] {
    return this.repository.getAssertionsBySubject(subject_id, environment);
  }

  /**
   * Queries all physical evidences backing a specific assertion.
   */
  public getEvidenceForAssertion(assertion_id: string): TruthEvidence[] {
    return this.repository.getEvidenceForAssertion(assertion_id);
  }

  /**
   * Returns complete provenance chain: ENTITY -> ASSERTION -> EVIDENCE -> SOURCE.
   */
  public getProvenanceChain(assertion_id: string): ProvenanceChainStep | null {
    const assertion = this.repository.getAssertionById(assertion_id);
    if (!assertion) return null;
    const evidences = this.repository.getEvidenceForAssertion(assertion_id);
    return { assertion, evidences };
  }

  /**
   * Navigates: SOURCE -> qué hechos produjo.
   */
  public getFactsProducedBySource(source_id: string, route_id?: string): TruthEvidence[] {
    const allEvidence = this.repository.getAllEvidence();
    return allEvidence.filter(e => {
      if (e.source_id !== source_id) return false;
      if (route_id && e.route_id !== route_id) return false;
      return true;
    });
  }

  public getRepository(): AtlasTruthRepository {
    return this.repository;
  }
}
