/**
 * Atlas Semantic Intelligence — Canonical Entity Service V1
 * Public API for entity candidate resolution, non-destructive merges, cycle protection,
 * alias management, and immutable source observation tracking.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import * as crypto from 'crypto';
import { EntityNormalizationEngine } from './EntityNormalizationEngine';
import { EntityResolutionEngine } from './EntityResolutionEngine';
import type {
  EntityCandidate,
  CanonicalEntity,
  SourceObservation,
  EntityAlias,
  EntityMergeRecord,
  ResolutionExplanation,
  ResolutionOptions,
  CanonicalEntityType
} from './types';

export class AtlasCanonicalEntityService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Resolves a source candidate against the canonical entity repository.
   * Performs normalization, multi-signal scoring, decision branching, and immutable observation logging.
   */
  public async resolveEntityCandidate(
    candidate: EntityCandidate,
    tenantId: string,
    options?: ResolutionOptions
  ): Promise<{
    decision: SourceObservation['resolution_decision'];
    canonical_entity_id: string | null;
    explanation: ResolutionExplanation;
    observation_id?: string;
  }> {
    if (!tenantId) throw new Error('TENANT_ID_REQUIRED: Tenant ID must be provided.');
    if (!candidate.raw_name || candidate.raw_name.trim().length === 0) {
      throw new Error('INVALID_CANDIDATE: Candidate raw_name cannot be empty.');
    }

    // 0. Idempotency fast-path: Check if this exact compound observation already exists
    const { data: existingObs } = await this.supabase
      .from('atlas_entity_source_observations')
      .select('canonical_entity_id, original_canonical_entity_id, observation_id, resolution_decision, resolution_explanation')
      .eq('tenant_id', tenantId)
      .eq('source_name', candidate.source_name)
      .eq('source_record_id', candidate.source_record_id)
      .eq('source_entity_key', candidate.source_entity_key || 'default')
      .maybeSingle();

    if (existingObs && existingObs.canonical_entity_id) {
      return {
        decision: existingObs.resolution_decision === 'NO_MATCH' ? 'AUTO_MATCH' : existingObs.resolution_decision,
        canonical_entity_id: existingObs.canonical_entity_id,
        explanation: existingObs.resolution_explanation as ResolutionExplanation,
        observation_id: existingObs.observation_id,
        is_existing_observation: true
      };
    }

    const autoCreate = options?.auto_create_if_no_match !== false;
    const normName = EntityNormalizationEngine.normalizeName(candidate.raw_name, candidate.entity_type);
    const rawNormDomain = EntityNormalizationEngine.normalizeDomain(candidate.domain);
    const normDomain = EntityNormalizationEngine.isSharedPlatformDomain(rawNormDomain) ? undefined : rawNormDomain;

    // 1. Query potential candidate matches from DB
    let query = this.supabase
      .from('atlas_canonical_entities')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('entity_type', candidate.entity_type)
      .eq('status', 'ACTIVE');

    // Build matching candidate filters with proper PostgREST quoting
    const orFilters: string[] = [];
    if (normName) orFilters.push(`normalized_name.eq."${normName.replace(/"/g, '')}"`);
    if (normDomain) orFilters.push(`primary_domain.eq."${normDomain.replace(/"/g, '')}"`);
    if (candidate.email_hash) orFilters.push(`metadata->>email_hash.eq."${candidate.email_hash}"`);
    if (candidate.phone_hash) orFilters.push(`metadata->>phone_hash.eq."${candidate.phone_hash}"`);

    if (orFilters.length > 0) {
      query = query.or(orFilters.join(','));
    }

    const { data: matchedEntities, error } = await query;
    if (error) {
      console.error('AtlasCanonicalEntityService query error:', error);
    }

    let bestMatch: CanonicalEntity | null = null;
    let bestExplanation: ResolutionExplanation | null = null;

    if (matchedEntities && matchedEntities.length > 0) {
      for (const target of matchedEntities) {
        const expl = EntityResolutionEngine.evaluateCandidateMatch(
          candidate,
          {
            canonical_entity_id: target.canonical_entity_id,
            canonical_name: target.canonical_name,
            entity_type: target.entity_type,
            primary_domain: target.primary_domain,
            metadata: target.metadata
          },
          options?.thresholds
        );

        if (!bestExplanation || expl.match_confidence > bestExplanation.match_confidence) {
          bestExplanation = expl;
          bestMatch = target;
        }
      }
    }

    // Fallback explanation if no target matched in DB
    if (!bestExplanation) {
      bestExplanation = EntityResolutionEngine.evaluateCandidateMatch(
        candidate,
        {
          canonical_name: '',
          entity_type: candidate.entity_type
        },
        options?.thresholds
      );
    }

    let targetCanonicalId: string | null = null;

    if (bestMatch && bestExplanation.decision === 'AUTO_MATCH') {
      targetCanonicalId = bestMatch.canonical_entity_id;

      // Register alias if raw name differs from canonical name
      if (candidate.raw_name.trim().toLowerCase() !== bestMatch.canonical_name.toLowerCase()) {
        await this.registerAlias(
          targetCanonicalId,
          tenantId,
          candidate.raw_name,
          candidate.source_name,
          bestExplanation.match_confidence
        );
      }
    } else if (bestExplanation.decision === 'NO_MATCH' && autoCreate) {
      // Create new Canonical Entity
      const entityMetadata: Record<string, any> = {
        first_source: candidate.source_name,
        first_observed_at: candidate.observed_at || new Date().toISOString()
      };
      if (candidate.email_hash) entityMetadata.email_hash = candidate.email_hash;
      if (candidate.phone_hash) entityMetadata.phone_hash = candidate.phone_hash;
      if (candidate.external_ids) entityMetadata.external_ids = candidate.external_ids;

      const { data: newEntity, error: createErr } = await this.supabase
        .from('atlas_canonical_entities')
        .insert({
          tenant_id: tenantId,
          entity_type: candidate.entity_type,
          canonical_name: candidate.raw_name.trim(),
          normalized_name: normName,
          primary_domain: normDomain || null,
          status: 'ACTIVE',
          metadata: entityMetadata
        })
        .select()
        .single();

      if (!createErr && newEntity) {
        targetCanonicalId = newEntity.canonical_entity_id;
        bestExplanation.target_canonical_id = targetCanonicalId;
        bestExplanation.target_canonical_name = newEntity.canonical_name;
      }
    }

    // 3. Record Immutable Source Observation
    let observationId: string | undefined;
    if (options?.record_observation !== false) {
      const normLoc = EntityNormalizationEngine.normalizeLocation(candidate.location);
      const normalizedAttrs: Record<string, any> = {
        normalized_name: normName,
        normalized_domain: normDomain,
        email_hash: candidate.email_hash,
        phone_hash: candidate.phone_hash,
        external_ids: candidate.external_ids,
        normalized_location: normLoc
      };

      const { data: obs, error: obsErr } = await this.supabase
        .from('atlas_entity_source_observations')
        .upsert(
          {
            tenant_id: tenantId,
            canonical_entity_id: targetCanonicalId,
            original_canonical_entity_id: targetCanonicalId,
            source_name: candidate.source_name,
            source_record_id: candidate.source_record_id,
            source_entity_key: candidate.source_entity_key || 'default',
            entity_type: candidate.entity_type,
            raw_name: candidate.raw_name,
            normalized_name: normName,
            raw_attributes: candidate.raw_attributes || {},
            normalized_attributes: normalizedAttrs,
            resolution_confidence: bestExplanation.match_confidence,
            resolution_decision: bestExplanation.decision,
            resolution_explanation: bestExplanation,
            observed_at: candidate.observed_at || new Date().toISOString()
          },
          {
            onConflict: 'tenant_id,source_name,source_record_id,source_entity_key'
          }
        )
        .select('observation_id')
        .single();

      if (!obsErr && obs) {
        observationId = obs.observation_id;
      }
    }

    return {
      decision: bestExplanation.decision,
      canonical_entity_id: targetCanonicalId,
      explanation: bestExplanation,
      observation_id: observationId
    };
  }

  /**
   * Resolves the canonical root entity following active merge chains with cycle protection.
   * Example: If A merged into B, and B merged into C, returns C.
   */
  public async resolveCanonicalRoot(
    entityId: string,
    tenantId: string,
    maxDepth = 10
  ): Promise<CanonicalEntity> {
    if (!entityId || !tenantId) throw new Error('INVALID_ARGS: entityId and tenantId are required.');

    let currentId = entityId;
    const visited = new Set<string>();
    let depth = 0;

    while (depth < maxDepth) {
      if (visited.has(currentId)) {
        throw new Error(`MERGE_CYCLE_DETECTED: Cycle detected for entity '${currentId}'.`);
      }
      visited.add(currentId);

      const { data: entity, error } = await this.supabase
        .from('atlas_canonical_entities')
        .select('*')
        .eq('canonical_entity_id', currentId)
        .eq('tenant_id', tenantId)
        .single();

      if (error || !entity) {
        throw new Error(`ENTITY_NOT_FOUND: Canonical entity '${currentId}' not found for tenant '${tenantId}'.`);
      }

      if (entity.status === 'MERGED' && entity.merged_into_id) {
        if (entity.merged_into_id === currentId) {
          throw new Error(`SELF_MERGE_DETECTED: Entity '${currentId}' references itself.`);
        }
        currentId = entity.merged_into_id;
        depth++;
      } else {
        return entity as CanonicalEntity;
      }
    }

    throw new Error(`MERGE_MAX_DEPTH_EXCEEDED: Exceeded max depth (${maxDepth}) resolving root for entity '${entityId}'.`);
  }

  /**
   * Retrieves a canonical entity, resolving its active root if merged.
   */
  public async getCanonicalEntity(
    canonicalEntityId: string,
    tenantId: string
  ): Promise<CanonicalEntity> {
    return this.resolveCanonicalRoot(canonicalEntityId, tenantId);
  }

  /**
   * Merges a source canonical entity into a target canonical entity non-destructively.
   * Records the merge in the immutable merge ledger, updates source entity status to MERGED,
   * but PRESERVES all original source observations intact.
   */
  public async mergeEntities(
    sourceEntityId: string,
    targetEntityId: string,
    tenantId: string,
    reason: string,
    explanation: Record<string, any> = {}
  ): Promise<EntityMergeRecord> {
    if (sourceEntityId === targetEntityId) {
      throw new Error('MERGE_SELF_PROHIBITED: Cannot merge an entity into itself.');
    }

    // Verify both entities exist and belong to tenant
    const { data: source } = await this.supabase
      .from('atlas_canonical_entities')
      .select('*')
      .eq('canonical_entity_id', sourceEntityId)
      .eq('tenant_id', tenantId)
      .single();

    const { data: target } = await this.supabase
      .from('atlas_canonical_entities')
      .select('*')
      .eq('canonical_entity_id', targetEntityId)
      .eq('tenant_id', tenantId)
      .single();

    if (!source || !target) {
      throw new Error('ENTITY_NOT_FOUND: Source or target entity does not exist in tenant.');
    }

    if (source.entity_type !== target.entity_type) {
      throw new Error(`TYPE_MISMATCH: Cannot merge ${source.entity_type} into ${target.entity_type}.`);
    }

    // Prevent immediate cycle (target already merged into source)
    if (target.merged_into_id === sourceEntityId) {
      throw new Error('MERGE_CYCLE_PROHIBITED: Target entity is already merged into source entity.');
    }

    // Insert active merge record
    const { data: mergeRecord, error: mergeErr } = await this.supabase
      .from('atlas_entity_merges')
      .insert({
        tenant_id: tenantId,
        source_entity_id: sourceEntityId,
        target_entity_id: targetEntityId,
        merge_reason: reason,
        confidence: explanation.match_confidence || 1.0,
        explanation,
        is_active: true
      })
      .select()
      .single();

    if (mergeErr || !mergeRecord) {
      throw new Error(`MERGE_INSERT_FAILED: ${mergeErr?.message}`);
    }

    // Update source entity status non-destructively
    await this.supabase
      .from('atlas_canonical_entities')
      .update({
        status: 'MERGED',
        merged_into_id: targetEntityId,
        updated_at: new Date().toISOString()
      })
      .eq('canonical_entity_id', sourceEntityId)
      .eq('tenant_id', tenantId);

    // Copy aliases to target entity with provenance
    const { data: sourceAliases } = await this.supabase
      .from('atlas_entity_aliases')
      .select('*')
      .eq('canonical_entity_id', sourceEntityId)
      .eq('tenant_id', tenantId);

    if (sourceAliases && sourceAliases.length > 0) {
      for (const al of sourceAliases) {
        await this.registerAlias(
          targetEntityId,
          tenantId,
          al.alias_name,
          `MERGE_FROM_${sourceEntityId}`,
          al.confidence
        );
      }
    }

    return mergeRecord as EntityMergeRecord;
  }

  /**
   * Reverses an entity merge edge.
   * Sets is_active = false, restores source entity to ACTIVE, clears merged_into_id,
   * without deleting or mutating source observations.
   */
  public async unmergeEntities(
    mergeId: string,
    tenantId: string,
    reason?: string,
    actor?: string
  ): Promise<boolean> {
    const { data: mergeRecord, error: fetchErr } = await this.supabase
      .from('atlas_entity_merges')
      .select('*')
      .eq('merge_id', mergeId)
      .eq('tenant_id', tenantId)
      .single();

    if (fetchErr || !mergeRecord) {
      throw new Error(`MERGE_NOT_FOUND: Merge record '${mergeId}' not found.`);
    }

    // Deactivate merge record
    await this.supabase
      .from('atlas_entity_merges')
      .update({
        is_active: false,
        reversed_at: new Date().toISOString(),
        reversed_by: actor || 'SYSTEM',
        reversal_reason: reason || 'MANUAL_UNMERGE'
      })
      .eq('merge_id', mergeId);

    // Restore source entity back to ACTIVE
    await this.supabase
      .from('atlas_canonical_entities')
      .update({
        status: 'ACTIVE',
        merged_into_id: null,
        updated_at: new Date().toISOString()
      })
      .eq('canonical_entity_id', mergeRecord.source_entity_id)
      .eq('tenant_id', tenantId);

    return true;
  }

  /**
   * Registers an alias for a canonical entity.
   */
  public async registerAlias(
    canonicalEntityId: string,
    tenantId: string,
    aliasName: string,
    source: string,
    confidence = 1.0
  ): Promise<EntityAlias | null> {
    if (!aliasName || aliasName.trim().length === 0) return null;
    const normalizedAlias = EntityNormalizationEngine.cleanText(aliasName);

    const { data, error } = await this.supabase
      .from('atlas_entity_aliases')
      .upsert(
        {
          tenant_id: tenantId,
          canonical_entity_id: canonicalEntityId,
          alias_name: aliasName.trim(),
          normalized_alias: normalizedAlias,
          source,
          confidence: +confidence.toFixed(3)
        },
        {
          onConflict: 'tenant_id,canonical_entity_id,normalized_alias'
        }
      )
      .select()
      .single();

    if (error) {
      console.warn('registerAlias error:', error.message);
      return null;
    }
    return data as EntityAlias;
  }

  /**
   * Retrieves all source observations for a canonical entity (including those from merged entities).
   * Preserves contradictions and original attributes.
   */
  public async getEntitySources(
    canonicalEntityId: string,
    tenantId: string
  ): Promise<SourceObservation[]> {
    // Find all entity IDs that merge into this canonical entity root
    const { data: merges } = await this.supabase
      .from('atlas_entity_merges')
      .select('source_entity_id')
      .eq('target_entity_id', canonicalEntityId)
      .eq('tenant_id', tenantId)
      .eq('is_active', true);

    const entityIds = [canonicalEntityId];
    if (merges) {
      merges.forEach(m => entityIds.push(m.source_entity_id));
    }

    const { data: observations, error } = await this.supabase
      .from('atlas_entity_source_observations')
      .select('*')
      .eq('tenant_id', tenantId)
      .in('canonical_entity_id', entityIds)
      .order('observed_at', { ascending: false });

    if (error || !observations) return [];
    return observations as SourceObservation[];
  }

  /**
   * Retrieves all registered aliases for a canonical entity.
   */
  public async getEntityAliases(
    canonicalEntityId: string,
    tenantId: string
  ): Promise<EntityAlias[]> {
    const { data, error } = await this.supabase
      .from('atlas_entity_aliases')
      .select('*')
      .eq('canonical_entity_id', canonicalEntityId)
      .eq('tenant_id', tenantId);

    if (error || !data) return [];
    return data as EntityAlias[];
  }

  /**
   * Explains the resolution logic without mutating the database.
   */
  public explainEntityResolution(
    candidate: EntityCandidate,
    target: {
      canonical_name: string;
      entity_type: CanonicalEntityType;
      primary_domain?: string;
      email_hash?: string;
      phone_hash?: string;
      external_ids?: Record<string, string>;
      location?: any;
      company_context?: string;
    },
    thresholds?: Partial<ResolutionOptions['thresholds']>
  ): ResolutionExplanation {
    return EntityResolutionEngine.evaluateCandidateMatch(candidate, target, thresholds);
  }
}
