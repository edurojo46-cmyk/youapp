/**
 * Atlas Semantic Intelligence — Semantic Backfill Audit V1 (Quality Corrected)
 * Extracts and formats human review audit samples from ingested entities, facts, and relationships.
 * Respects status = 'ACTIVE' and is_active = TRUE filters and provides full explainability.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { TransformationAuditSample } from './types';

export class SemanticBackfillAudit {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Samples up to limit (default 20) transformations from the ingested knowledge for human explainability review.
   */
  public async getHumanReviewSample(
    tenantId: string,
    limit = 20
  ): Promise<TransformationAuditSample[]> {
    const samples: TransformationAuditSample[] = [];

    // 1. Fetch active facts with evidence
    const { data: facts } = await this.supabase
      .from('atlas_semantic_facts')
      .select('fact_id, predicate_code, value_type, object_value, knowledge_type, status, subject_entity_id')
      .eq('tenant_id', tenantId)
      .eq('status', 'ACTIVE')
      .limit(limit);

    if (facts && facts.length > 0) {
      for (const f of facts) {
        // Fetch entity
        const { data: entity } = await this.supabase
          .from('atlas_canonical_entities')
          .select('canonical_name, entity_type')
          .eq('canonical_entity_id', f.subject_entity_id)
          .maybeSingle();

        // Fetch evidence
        const { data: evList } = await this.supabase
          .from('atlas_semantic_fact_evidence')
          .select('source_observation_id')
          .eq('fact_id', f.fact_id)
          .limit(1);

        let sourceName = 'INGESTED_SOURCE';
        let sourceRecordId = 'rec_unknown';
        const obsId = evList?.[0]?.source_observation_id;

        if (obsId) {
          const { data: obs } = await this.supabase
            .from('atlas_entity_source_observations')
            .select('source_name, source_record_id')
            .eq('observation_id', obsId)
            .maybeSingle();
          if (obs) {
            sourceName = obs.source_name;
            sourceRecordId = obs.source_record_id;
          }
        }

        samples.push({
          source_name: sourceName,
          source_record_id: sourceRecordId,
          entity_canonical_name: entity?.canonical_name || 'Unknown Entity',
          entity_type: entity?.entity_type || 'PERSON',
          knowledge_type: f.knowledge_type,
          predicate_code: f.predicate_code,
          object_summary: typeof f.object_value === 'string' ? f.object_value : JSON.stringify(f.object_value),
          evidence_observation_id: obsId || 'none',
          reason: `Extracted ${f.knowledge_type} fact '${f.predicate_code}' from verified source record.`
        });

        if (samples.length >= limit) break;
      }
    }

    // 2. Fetch active relationships if more samples needed
    if (samples.length < limit) {
      const { data: rels } = await this.supabase
        .from('atlas_semantic_relationships')
        .select('relationship_id, predicate_code, knowledge_type, is_active, subject_entity_id, object_entity_id')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .limit(limit - samples.length);

      if (rels && rels.length > 0) {
        for (const r of rels) {
          const { data: subj } = await this.supabase
            .from('atlas_canonical_entities')
            .select('canonical_name, entity_type')
            .eq('canonical_entity_id', r.subject_entity_id)
            .maybeSingle();

          const { data: obj } = await this.supabase
            .from('atlas_canonical_entities')
            .select('canonical_name, entity_type')
            .eq('canonical_entity_id', r.object_entity_id)
            .maybeSingle();

          const { data: evList } = await this.supabase
            .from('atlas_semantic_relationship_evidence')
            .select('source_observation_id')
            .eq('relationship_id', r.relationship_id)
            .limit(1);

          let sourceName = 'INGESTED_SOURCE';
          let sourceRecordId = 'rec_unknown';
          const obsId = evList?.[0]?.source_observation_id;

          if (obsId) {
            const { data: obs } = await this.supabase
              .from('atlas_entity_source_observations')
              .select('source_name, source_record_id')
              .eq('observation_id', obsId)
              .maybeSingle();
            if (obs) {
              sourceName = obs.source_name;
              sourceRecordId = obs.source_record_id;
            }
          }

          samples.push({
            source_name: sourceName,
            source_record_id: sourceRecordId,
            entity_canonical_name: subj?.canonical_name || 'Unknown Subject',
            entity_type: subj?.entity_type || 'ORGANIZATION',
            knowledge_type: r.knowledge_type,
            predicate_code: r.predicate_code,
            object_summary: `-> [${obj?.entity_type || 'ENTITY'}] ${obj?.canonical_name || 'Unknown Object'}`,
            evidence_observation_id: obsId || 'none',
            reason: `Extracted ${r.knowledge_type} relationship '${r.predicate_code}' linking subject to object entity.`
          });

          if (samples.length >= limit) break;
        }
      }
    }

    // 3. If more samples needed, sample canonical entity source observations
    if (samples.length < limit) {
      const { data: observations } = await this.supabase
        .from('atlas_entity_source_observations')
        .select('observation_id, source_name, source_record_id, source_entity_key, raw_name, normalized_name, entity_type, canonical_entity_id')
        .eq('tenant_id', tenantId)
        .limit(limit - samples.length);

      if (observations && observations.length > 0) {
        for (const obs of observations) {
          let canonicalName = obs.raw_name;
          if (obs.canonical_entity_id) {
            const { data: entity } = await this.supabase
              .from('atlas_canonical_entities')
              .select('canonical_name')
              .eq('canonical_entity_id', obs.canonical_entity_id)
              .maybeSingle();
            if (entity?.canonical_name) canonicalName = entity.canonical_name;
          }

          samples.push({
            source_name: obs.source_name,
            source_record_id: obs.source_record_id,
            entity_canonical_name: canonicalName || obs.raw_name || 'Unknown Entity',
            entity_type: obs.entity_type || 'PERSON',
            knowledge_type: 'RAW_OBSERVATION',
            predicate_code: 'ENTITY_IDENTITY',
            object_summary: `[${obs.source_entity_key}] ${obs.raw_name}`,
            evidence_observation_id: obs.observation_id,
            reason: `Normalized entity identity candidate from source record.`
          });

          if (samples.length >= limit) break;
        }
      }
    }

    return samples;
  }
}
