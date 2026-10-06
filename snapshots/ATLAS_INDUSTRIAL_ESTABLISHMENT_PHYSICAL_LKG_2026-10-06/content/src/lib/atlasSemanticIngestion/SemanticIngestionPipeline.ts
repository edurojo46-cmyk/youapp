/**
 * Atlas Semantic Intelligence — Semantic Ingestion Pipeline V1
 * Executes ingestion envelopes through canonical resolution, source observation tracking,
 * fact/relationship assertion with mandatory evidence links, and rule-based inferences.
 * Fully supports live idempotency replays (0 duplicate creations).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { AtlasCanonicalEntityService } from '../atlasSemantic/AtlasCanonicalEntityService';
import { AtlasSemanticKnowledgeService } from '../atlasSemantic/AtlasSemanticKnowledgeService';
import { PredicateRegistry } from '../atlasSemantic/PredicateRegistry';
import type {
  SemanticIngestionEnvelope,
  IngestionResult
} from './types';

export class SemanticIngestionPipeline {
  constructor(
    private supabase: SupabaseClient,
    private canonicalService: AtlasCanonicalEntityService,
    private semanticService: AtlasSemanticKnowledgeService
  ) {}

  /**
   * Processes a single semantic ingestion envelope.
   * If isDryRun is true, validates all steps without writing to the database.
   */
  public async processEnvelope(
    envelope: SemanticIngestionEnvelope,
    isDryRun = false,
    options?: { deriveInferences?: boolean }
  ): Promise<IngestionResult> {
    const result: IngestionResult = {
      source_record_id: envelope.source_record_id,
      tenant_id: envelope.tenant_id,
      status: 'SUCCESS',
      entities_created: 0,
      entities_matched: 0,
      observations_created: 0,
      claims_created: 0,
      facts_created: 0,
      relationships_created: 0,
      inferences_created: 0,
      evidence_links_created: 0
    };

    if (!envelope.tenant_id || envelope.tenant_id.trim() === '') {
      result.status = 'REJECTED';
      result.rejection_reason = 'TENANT_ID_REQUIRED: Cannot ingest records without explicit tenant context.';
      return result;
    }

    try {
      // 1. Resolve Entity Candidates & Track Observations
      const resolvedEntities = new Map<string, {
        canonical_entity_id: string;
        observation_id?: string;
        decision: string;
      }>();

      for (const item of envelope.entity_candidates) {
        if (isDryRun) {
          result.entities_created++;
          result.observations_created++;
          resolvedEntities.set(item.source_entity_key, {
            canonical_entity_id: `dry_entity_${item.source_entity_key}`,
            observation_id: `dry_obs_${item.source_entity_key}`,
            decision: 'AUTO_MATCH'
          });
        } else {
          // Check if an observation already exists for this exact source candidate (Idempotency Replay Guard)
          const { data: existingObs } = await this.supabase
            .from('atlas_entity_source_observations')
            .select('observation_id, canonical_entity_id, resolution_decision')
            .eq('tenant_id', envelope.tenant_id)
            .eq('source_name', item.candidate.source_name)
            .eq('source_record_id', item.candidate.source_record_id)
            .eq('source_entity_key', item.candidate.source_entity_key || 'default')
            .maybeSingle();

          if (existingObs && existingObs.canonical_entity_id) {
            // Already ingested: no duplicate creation
            result.entities_matched++;
            resolvedEntities.set(item.source_entity_key, {
              canonical_entity_id: existingObs.canonical_entity_id,
              observation_id: existingObs.observation_id,
              decision: existingObs.resolution_decision
            });
          } else {
            const res = await this.canonicalService.resolveEntityCandidate(
              item.candidate,
              envelope.tenant_id,
              { record_observation: true }
            );

            if (res.decision === 'AUTO_MATCH') {
              result.entities_matched++;
            } else if (res.decision === 'NO_MATCH') {
              result.entities_created++;
            }

            if (res.observation_id) {
              result.observations_created++;
            }

            if (res.canonical_entity_id) {
              resolvedEntities.set(item.source_entity_key, {
                canonical_entity_id: res.canonical_entity_id,
                observation_id: res.observation_id,
                decision: res.decision
              });
            }
          }
        }
      }

      // 2. Extract and Assert Claims / Facts
      for (const claim of envelope.claim_candidates) {
        const resolved = resolvedEntities.get(claim.source_entity_key);
        if (!resolved) continue;

        if (isDryRun) {
          const pred = PredicateRegistry.getPredicate(claim.predicate_code);
          if (pred && pred.object_kind === 'LITERAL_VALUE') {
            if (claim.validation_method === 'AUTHORITATIVE_SOURCE') {
              result.facts_created++;
            } else {
              result.claims_created++;
            }
            result.evidence_links_created++;
          }
        } else {
          const isAuthoritative = claim.validation_method === 'AUTHORITATIVE_SOURCE' ||
            claim.validation_method === 'MULTI_SOURCE_CORROBORATION';

          const fact = await this.semanticService.assertFact(
            {
              subject_entity_id: resolved.canonical_entity_id,
              predicate_code: claim.predicate_code,
              value_type: claim.value_type,
              object_value: claim.object_value,
              knowledge_type: isAuthoritative ? 'FACT' : 'CLAIM',
              confidence: claim.confidence ?? (isAuthoritative ? 0.95 : 0.85),
              validation_method: isAuthoritative ? claim.validation_method : 'UNVALIDATED_CLAIM',
              observed_at: claim.observed_at || envelope.observed_at,
              valid_from: claim.valid_from,
              valid_to: claim.valid_to,
              evidence: resolved.observation_id
                ? [{ source_observation_id: resolved.observation_id, evidence_role: 'PRIMARY_SOURCE' }]
                : []
            },
            envelope.tenant_id
          );

          if (fact.knowledge_type === 'FACT') {
            result.facts_created++;
          } else {
            result.claims_created++;
          }

          if (fact.evidence && fact.evidence.length > 0) {
            result.evidence_links_created += fact.evidence.length;
          }
        }
      }

      // 3. Extract and Assert Relationships
      for (const rel of envelope.relationship_candidates) {
        const subj = resolvedEntities.get(rel.subject_entity_key);
        const obj = resolvedEntities.get(rel.object_entity_key);
        if (!subj || !obj) continue;

        if (isDryRun) {
          const pred = PredicateRegistry.getPredicate(rel.predicate_code);
          if (pred && pred.object_kind === 'CANONICAL_ENTITY') {
            result.relationships_created++;
            result.evidence_links_created++;
          }
        } else {
          const createdRel = await this.semanticService.assertRelationship(
            {
              subject_entity_id: subj.canonical_entity_id,
              predicate_code: rel.predicate_code,
              object_entity_id: obj.canonical_entity_id,
              knowledge_type: 'CLAIM',
              confidence: rel.confidence ?? 0.9,
              validation_method: 'UNVALIDATED_CLAIM',
              observed_at: rel.observed_at || envelope.observed_at,
              valid_from: rel.valid_from,
              valid_to: rel.valid_to,
              evidence: subj.observation_id
                ? [{ source_observation_id: subj.observation_id, evidence_role: 'PRIMARY_SOURCE' }]
                : []
            },
            envelope.tenant_id
          );

          result.relationships_created++;
          if (createdRel.evidence && createdRel.evidence.length > 0) {
            result.evidence_links_created += createdRel.evidence.length;
          }
        }
      }

      // 4. Derive Rule-Based Inferences
      if (!isDryRun && options?.deriveInferences !== false && (envelope.claim_candidates.length > 0 || envelope.relationship_candidates.length > 0)) {
        const processedRoots = new Set<string>();
        for (const val of resolvedEntities.values()) {
          if (!processedRoots.has(val.canonical_entity_id)) {
            processedRoots.add(val.canonical_entity_id);
            const inferences = await this.semanticService.deriveInferences(
              val.canonical_entity_id,
              envelope.tenant_id
            );
            result.inferences_created += inferences.length;
          }
        }
      }

      return result;
    } catch (err: any) {
      result.status = 'ERROR';
      result.error_details = err.message || String(err);
      return result;
    }
  }
}
