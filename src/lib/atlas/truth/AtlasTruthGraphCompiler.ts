/**
 * ATLAS TRUTH GRAPH V1
 * Module: AtlasTruthGraphCompiler.ts
 * Path: src/lib/atlas/truth/AtlasTruthGraphCompiler.ts
 * 
 * Compiles disparate extraction signals into separate, strictly provenanced Truth Assertions.
 * Invariant: ATTRIBUTE_PROVENANCE_SEPARATED.
 * Never conflates entity identity provenance with email or professional provenance.
 */

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

export interface AttributeObservationPayload {
  predicate: TruthPredicate;
  value: any;
  truth_nature?: TruthNature;
  confidence?: number;
  evidence?: {
    source_id: string;
    route_id?: string;
    source_url?: string;
    observed_at?: string;
    method?: EvidenceMethod;
    fragment?: string;
    metadata?: Record<string, any>;
  };
}

export interface EntityObservationBundle {
  subject_type: 'PERSON' | 'COMPANY' | 'ORGANIZATION';
  subject_id: string;
  attributes: AttributeObservationPayload[];
  environment?: 'TEST' | 'PRODUCTION';
}

export interface CompiledAssertionBundle {
  assertion: TruthAssertion;
  evidence?: TruthEvidence;
}

export class AtlasTruthGraphCompiler {
  /**
   * Compiles an entity observation bundle into distinct assertion + evidence pairs.
   * Guarantees strict provenance separation per attribute.
   */
  public static compileBundle(bundle: EntityObservationBundle): CompiledAssertionBundle[] {
    const results: CompiledAssertionBundle[] = [];
    const now = new Date().toISOString();
    const env = bundle.environment || 'PRODUCTION';

    for (const attr of bundle.attributes) {
      if (attr.value === undefined || attr.value === null || String(attr.value).trim().length === 0) {
        continue;
      }

      const normalized = AtlasTruthAssertionHelper.normalizeValue(attr.predicate, attr.value);
      const valHash = AtlasTruthAssertionHelper.computeValueHash(attr.predicate, normalized);
      const assertion_id = AtlasTruthAssertionHelper.generateAssertionId(bundle.subject_id, attr.predicate, valHash);

      // Rule: If no physical source evidence provided, nature CANNOT be OBSERVED; it must be INFERRED!
      const hasPhysicalSource = Boolean(attr.evidence?.source_id);
      let truthNature: TruthNature = attr.truth_nature || (hasPhysicalSource ? 'OBSERVED' : 'INFERRED');
      if (!hasPhysicalSource && truthNature === 'OBSERVED') {
        truthNature = 'INFERRED'; // Enforce truth invariant
      }

      const assertion: TruthAssertion = {
        assertion_id,
        subject_type: bundle.subject_type,
        subject_id: bundle.subject_id,
        predicate: attr.predicate,
        value_normalized: normalized,
        value_hash: valHash,
        truth_nature: truthNature,
        confidence: attr.confidence !== undefined ? attr.confidence : (truthNature === 'OBSERVED' ? 1.0 : 0.6),
        status: 'ACTIVE',
        first_seen: attr.evidence?.observed_at || now,
        last_seen: attr.evidence?.observed_at || now,
        created_at: now,
        environment: env
      };

      let evidence: TruthEvidence | undefined;
      if (hasPhysicalSource && attr.evidence) {
        const frag = attr.evidence.fragment || `${attr.predicate}=${normalized}`;
        const fragHash = AtlasTruthEvidenceHelper.computeFragmentHash(frag);
        const evidence_id = AtlasTruthEvidenceHelper.generateEvidenceId(assertion_id, attr.evidence.source_id, fragHash);

        evidence = {
          evidence_id,
          assertion_id,
          source_id: attr.evidence.source_id,
          route_id: attr.evidence.route_id,
          source_url: attr.evidence.source_url,
          observed_at: attr.evidence.observed_at || now,
          method: attr.evidence.method || 'DIRECT_EXTRACT',
          evidence_fragment: frag,
          evidence_fragment_hash: fragHash,
          evidence_metadata: attr.evidence.metadata,
          environment: env,
          created_at: now
        };
      }

      results.push({ assertion, evidence });
    }

    return results;
  }
}
