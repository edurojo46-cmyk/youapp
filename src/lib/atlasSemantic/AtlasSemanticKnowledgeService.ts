/**
 * Atlas Semantic Intelligence — Semantic Knowledge Service V1
 * Complete management of epistemological knowledge: Facts (typed literals), Relationships (entity-to-entity),
 * Multi-source Provenance, Contradiction Ledger, Conservative Fact Resolution, and Inferences.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { AtlasCanonicalEntityService } from './AtlasCanonicalEntityService';
import { PredicateRegistry } from './PredicateRegistry';
import { AtlasInferenceEngine } from './AtlasInferenceEngine';
import type {
  AssertFactInput,
  AssertRelationshipInput,
  SemanticFact,
  SemanticRelationship,
  SemanticInference,
  ContradictionGroup,
  CurrentFactResolutionResult,
  EntityKnowledgeSummary,
  KnowledgeType,
  ValidationMethod
} from './semanticTypes';

export class AtlasSemanticKnowledgeService {
  private canonicalService: AtlasCanonicalEntityService;

  constructor(
    private supabase: SupabaseClient,
    canonicalService?: AtlasCanonicalEntityService
  ) {
    this.canonicalService = canonicalService || new AtlasCanonicalEntityService(supabase);
  }

  /**
   * Asserts a semantic fact (Subject Entity + Predicate + Typed Literal Value)
   * Enforces domain/range, literal type, fail-closed PII, epistemological promotion rules,
   * temporal overlap reasoning, contradiction detection, and merge-aware deduplication.
   */
  public async assertFact(
    input: AssertFactInput,
    tenantId: string
  ): Promise<SemanticFact> {
    if (!tenantId) throw new Error('TENANT_ID_REQUIRED: Tenant ID must be provided.');
    if (!input.subject_entity_id) throw new Error('SUBJECT_ENTITY_REQUIRED: subject_entity_id must be provided.');
    if (!input.predicate_code) throw new Error('PREDICATE_REQUIRED: predicate_code must be provided.');

    // 1. Recursive PII and secret check
    this.assertNoPlaintextPii(input.object_value, 'object_value');
    if (input.metadata) {
      this.assertNoPlaintextPii(input.metadata, 'metadata');
    }

    // 2. Resolve Subject to Canonical Root Entity
    const subjectRoot = await this.canonicalService.resolveCanonicalRoot(input.subject_entity_id, tenantId);

    // 3. Domain and Literal Value Type Validation against Predicate Registry
    const valResult = PredicateRegistry.validateFactInput(
      input.predicate_code,
      subjectRoot.entity_type,
      input.value_type,
      input.object_value
    );
    if (!valResult.valid) {
      throw new Error(`FACT_VALIDATION_FAILED: ${valResult.error}`);
    }

    const predDef = PredicateRegistry.getPredicate(input.predicate_code)!;

    // 4. Epistemological Promotion & Provenance Rules (Requirements 8 & 9)
    let knowledgeType: KnowledgeType = input.knowledge_type || 'CLAIM';
    let validationMethod: ValidationMethod = input.validation_method || 'UNVALIDATED_CLAIM';

    if (knowledgeType === 'FACT') {
      if (!input.validation_method || input.validation_method === 'UNVALIDATED_CLAIM') {
        throw new Error(
          `PROMOTION_VALIDATION_REQUIRED: Knowledge type 'FACT' requires an explicit validation_method (e.g. MULTI_SOURCE_CORROBORATION, AUTHORITATIVE_SOURCE, USER_CONFIRMATION, SYSTEM_RULE). Raw external inputs default to 'CLAIM'.`
        );
      }
    } else if (knowledgeType === 'USER_CONFIRMED_FACT') {
      validationMethod = 'USER_CONFIRMATION';
    }

    const validatedAt =
      knowledgeType === 'FACT' || knowledgeType === 'USER_CONFIRMED_FACT'
        ? new Date().toISOString()
        : undefined;

    // 5. Temporal Knowledge Separation (Requirement 12)
    const observedAt = input.observed_at || new Date().toISOString();
    const validFrom = input.valid_from || observedAt;
    const validTo = input.valid_to || null;

    if (validTo && new Date(validTo) < new Date(validFrom)) {
      throw new Error(`INVALID_TEMPORAL_INTERVAL: valid_to (${validTo}) cannot precede valid_from (${validFrom}).`);
    }

    // 6. Merge-Aware Deduplication & Existing Fact Check (Requirement 15)
    const { data: existingFacts } = await this.supabase
      .from('atlas_semantic_facts')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('subject_entity_id', subjectRoot.canonical_entity_id)
      .eq('predicate_code', input.predicate_code)
      .eq('status', 'ACTIVE');

    const exactMatch = (existingFacts || []).find(
      f =>
        f.value_type === input.value_type &&
        JSON.stringify(f.object_value) === JSON.stringify(input.object_value)
    );

    let factId: string;
    let createdFact: SemanticFact;

    if (exactMatch) {
      // Idempotency: exact same logical fact already exists for this canonical entity root
      factId = exactMatch.fact_id;
      createdFact = exactMatch as SemanticFact;
    } else {
      // 7. Temporal Overlap & Contradiction Detection (Requirements 10, 11, 17)
      if (
        predDef.contradiction_mode === 'TEMPORAL_SINGLE_VALUE' ||
        predDef.contradiction_mode === 'VALUE_EXCLUSIVE'
      ) {
        const conflictingFacts = (existingFacts || []).filter(existing => {
          if (JSON.stringify(existing.object_value) === JSON.stringify(input.object_value)) {
            return false;
          }
          return this.hasTemporalOverlap(
            validFrom,
            validTo,
            existing.valid_from,
            existing.valid_to
          );
        });

        // 8. Insert new Fact
        const { data: newFact, error: insertErr } = await this.supabase
          .from('atlas_semantic_facts')
          .insert({
            tenant_id: tenantId,
            subject_entity_id: subjectRoot.canonical_entity_id,
            predicate_code: input.predicate_code,
            value_type: input.value_type,
            object_value: input.object_value,
            knowledge_type: knowledgeType,
            confidence: input.confidence ?? 1.0,
            validation_method: validationMethod,
            validated_at: validatedAt,
            validated_by_type: input.validated_by_type,
            observed_at: observedAt,
            valid_from: validFrom,
            valid_to: validTo,
            status: 'ACTIVE',
            metadata: input.metadata || {}
          })
          .select()
          .single();

        if (insertErr || !newFact) {
          throw new Error(`FACT_INSERT_FAILED: ${insertErr?.message}`);
        }

        factId = newFact.fact_id;
        createdFact = newFact as SemanticFact;

        // Record persistent contradiction if conflicting facts exist
        if (conflictingFacts.length > 0) {
          const { data: contradiction } = await this.supabase
            .from('atlas_semantic_contradictions')
            .insert({
              tenant_id: tenantId,
              subject_entity_id: subjectRoot.canonical_entity_id,
              predicate_code: input.predicate_code,
              contradiction_type: 'TEMPORAL_OVERLAP_EXCLUSIVE_VALUE',
              status: 'UNRESOLVED',
              resolution_notes: `Detected ${conflictingFacts.length} conflicting temporal assertion(s).`
            })
            .select('contradiction_id')
            .single();

          if (contradiction) {
            const claimsToLink = [factId, ...conflictingFacts.map(cf => cf.fact_id)];
            for (const cFactId of claimsToLink) {
              await this.supabase
                .from('atlas_semantic_contradiction_claims')
                .upsert(
                  {
                    tenant_id: tenantId,
                    contradiction_id: contradiction.contradiction_id,
                    fact_id: cFactId
                  },
                  { onConflict: 'tenant_id,contradiction_id,fact_id' }
                );
            }
          }
        }
      } else {
        // Non-exclusive predicate (e.g. INDUSTRY, TECH_STACK)
        const { data: newFact, error: insertErr } = await this.supabase
          .from('atlas_semantic_facts')
          .insert({
            tenant_id: tenantId,
            subject_entity_id: subjectRoot.canonical_entity_id,
            predicate_code: input.predicate_code,
            value_type: input.value_type,
            object_value: input.object_value,
            knowledge_type: knowledgeType,
            confidence: input.confidence ?? 1.0,
            validation_method: validationMethod,
            validated_at: validatedAt,
            validated_by_type: input.validated_by_type,
            observed_at: observedAt,
            valid_from: validFrom,
            valid_to: validTo,
            status: 'ACTIVE',
            metadata: input.metadata || {}
          })
          .select()
          .single();

        if (insertErr || !newFact) {
          throw new Error(`FACT_INSERT_FAILED: ${insertErr?.message}`);
        }

        factId = newFact.fact_id;
        createdFact = newFact as SemanticFact;
      }
    }

    // 9. Attach Multi-Source Evidence (Requirement 5)
    if (input.evidence && input.evidence.length > 0) {
      for (const ev of input.evidence) {
        if (!ev.source_observation_id) continue;
        await this.supabase
          .from('atlas_semantic_fact_evidence')
          .upsert(
            {
              tenant_id: tenantId,
              fact_id: factId,
              source_observation_id: ev.source_observation_id,
              evidence_role: ev.evidence_role || 'PRIMARY_OBSERVATION',
              confidence_contribution: ev.confidence_contribution ?? 1.0,
              evidence_metadata: ev.evidence_metadata || {}
            },
            { onConflict: 'tenant_id,fact_id,source_observation_id' }
          );
      }
    }

    // Fetch attached evidence to return complete snapshot
    const { data: loadedEvidence } = await this.supabase
      .from('atlas_semantic_fact_evidence')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('fact_id', factId);

    createdFact.evidence = loadedEvidence || [];
    return createdFact;
  }

  /**
   * Asserts a semantic relationship (Subject Entity + Predicate + Object Entity)
   * Strict Entity-to-Entity graph edge. Rejects literal values or invalid entity types.
   */
  public async assertRelationship(
    input: AssertRelationshipInput,
    tenantId: string
  ): Promise<SemanticRelationship> {
    if (!tenantId) throw new Error('TENANT_ID_REQUIRED: Tenant ID must be provided.');
    if (!input.subject_entity_id) throw new Error('SUBJECT_ENTITY_REQUIRED: subject_entity_id must be provided.');
    if (!input.object_entity_id) throw new Error('OBJECT_ENTITY_REQUIRED: object_entity_id must be provided.');
    if (!input.predicate_code) throw new Error('PREDICATE_REQUIRED: predicate_code must be provided.');

    // 1. Recursive PII check on metadata
    if (input.metadata) {
      this.assertNoPlaintextPii(input.metadata, 'metadata');
    }

    // 2. Resolve both Subject and Object to Canonical Root Entities (Requirement 14)
    const subjectRoot = await this.canonicalService.resolveCanonicalRoot(input.subject_entity_id, tenantId);
    const objectRoot = await this.canonicalService.resolveCanonicalRoot(input.object_entity_id, tenantId);

    if (subjectRoot.canonical_entity_id === objectRoot.canonical_entity_id) {
      throw new Error('SELF_RELATIONSHIP_PROHIBITED: Subject and Object cannot resolve to the same canonical entity.');
    }

    // 3. Domain and Range Validation against Predicate Registry (Requirement 18)
    const valResult = PredicateRegistry.validateRelationshipInput(
      input.predicate_code,
      subjectRoot.entity_type,
      objectRoot.entity_type
    );
    if (!valResult.valid) {
      throw new Error(`RELATIONSHIP_VALIDATION_FAILED: ${valResult.error}`);
    }

    // 4. Epistemological Promotion & Provenance Rules
    let knowledgeType: KnowledgeType = input.knowledge_type || 'CLAIM';
    let validationMethod: ValidationMethod = input.validation_method || 'UNVALIDATED_CLAIM';

    if (knowledgeType === 'FACT') {
      if (!input.validation_method || input.validation_method === 'UNVALIDATED_CLAIM') {
        throw new Error(
          `PROMOTION_VALIDATION_REQUIRED: Knowledge type 'FACT' requires an explicit validation_method. Raw claims default to 'CLAIM'.`
        );
      }
    } else if (knowledgeType === 'USER_CONFIRMED_FACT') {
      validationMethod = 'USER_CONFIRMATION';
    }

    const validatedAt =
      knowledgeType === 'FACT' || knowledgeType === 'USER_CONFIRMED_FACT'
        ? new Date().toISOString()
        : undefined;

    // 5. Temporal Knowledge
    const observedAt = input.observed_at || new Date().toISOString();
    const validFrom = input.valid_from || observedAt;
    const validTo = input.valid_to || null;

    if (validTo && new Date(validTo) < new Date(validFrom)) {
      throw new Error(`INVALID_TEMPORAL_INTERVAL: valid_to (${validTo}) cannot precede valid_from (${validFrom}).`);
    }

    // 6. Deduplication Check (Merge-aware)
    const { data: existingRel } = await this.supabase
      .from('atlas_semantic_relationships')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('subject_entity_id', subjectRoot.canonical_entity_id)
      .eq('predicate_code', input.predicate_code)
      .eq('object_entity_id', objectRoot.canonical_entity_id)
      .eq('is_active', true)
      .maybeSingle();

    let relationshipId: string;
    let createdRel: SemanticRelationship;

    if (existingRel) {
      relationshipId = existingRel.relationship_id;
      createdRel = existingRel as SemanticRelationship;
    } else {
      const { data: newRel, error: insertErr } = await this.supabase
        .from('atlas_semantic_relationships')
        .insert({
          tenant_id: tenantId,
          subject_entity_id: subjectRoot.canonical_entity_id,
          predicate_code: input.predicate_code,
          object_entity_id: objectRoot.canonical_entity_id,
          knowledge_type: knowledgeType,
          confidence: input.confidence ?? 1.0,
          validation_method: validationMethod,
          validated_at: validatedAt,
          validated_by_type: input.validated_by_type,
          observed_at: observedAt,
          valid_from: validFrom,
          valid_to: validTo,
          is_active: true,
          metadata: input.metadata || {}
        })
        .select()
        .single();

      if (insertErr || !newRel) {
        throw new Error(`RELATIONSHIP_INSERT_FAILED: ${insertErr?.message}`);
      }

      relationshipId = newRel.relationship_id;
      createdRel = newRel as SemanticRelationship;
    }

    // 7. Attach Multi-Source Evidence (Requirement 5)
    if (input.evidence && input.evidence.length > 0) {
      for (const ev of input.evidence) {
        if (!ev.source_observation_id) continue;
        await this.supabase
          .from('atlas_semantic_relationship_evidence')
          .upsert(
            {
              tenant_id: tenantId,
              relationship_id: relationshipId,
              source_observation_id: ev.source_observation_id,
              evidence_role: ev.evidence_role || 'PRIMARY_OBSERVATION',
              confidence_contribution: ev.confidence_contribution ?? 1.0,
              evidence_metadata: ev.evidence_metadata || {}
            },
            { onConflict: 'tenant_id,relationship_id,source_observation_id' }
          );
      }
    }

    const { data: loadedEvidence } = await this.supabase
      .from('atlas_semantic_relationship_evidence')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('relationship_id', relationshipId);

    createdRel.evidence = loadedEvidence || [];
    return createdRel;
  }

  /**
   * Retrieves all facts for an entity, resolving canonical root and optionally loading evidence.
   */
  public async getFactsForEntity(
    entityId: string,
    options?: {
      tenantId?: string;
      includeHistorical?: boolean;
      includeEvidence?: boolean;
    }
  ): Promise<SemanticFact[]> {
    const tenantId = options?.tenantId || (await this.getDefaultTenantId());
    const subjectRoot = await this.canonicalService.resolveCanonicalRoot(entityId, tenantId);

    let query = this.supabase
      .from('atlas_semantic_facts')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('subject_entity_id', subjectRoot.canonical_entity_id);

    if (!options?.includeHistorical) {
      query = query.eq('status', 'ACTIVE');
    }

    const { data: facts, error } = await query;
    if (error) throw new Error(`GET_FACTS_FAILED: ${error.message}`);
    if (!facts || facts.length === 0) return [];

    if (options?.includeEvidence !== false) {
      const factIds = facts.map(f => f.fact_id);
      const { data: evidenceList } = await this.supabase
        .from('atlas_semantic_fact_evidence')
        .select('*')
        .eq('tenant_id', tenantId)
        .in('fact_id', factIds);

      const evidenceMap = new Map<string, any[]>();
      (evidenceList || []).forEach(ev => {
        if (!evidenceMap.has(ev.fact_id)) evidenceMap.set(ev.fact_id, []);
        evidenceMap.get(ev.fact_id)!.push(ev);
      });

      return facts.map(f => ({
        ...f,
        evidence: evidenceMap.get(f.fact_id) || []
      })) as SemanticFact[];
    }

    return facts as SemanticFact[];
  }

  /**
   * Retrieves all relationships for an entity, resolving canonical root.
   */
  public async getRelationshipsForEntity(
    entityId: string,
    options?: {
      tenantId?: string;
      includeInactive?: boolean;
      includeEvidence?: boolean;
    }
  ): Promise<SemanticRelationship[]> {
    const tenantId = options?.tenantId || (await this.getDefaultTenantId());
    const root = await this.canonicalService.resolveCanonicalRoot(entityId, tenantId);

    let query = this.supabase
      .from('atlas_semantic_relationships')
      .select('*')
      .eq('tenant_id', tenantId)
      .or(`subject_entity_id.eq.${root.canonical_entity_id},object_entity_id.eq.${root.canonical_entity_id}`);

    if (!options?.includeInactive) {
      query = query.eq('is_active', true);
    }

    const { data: rels, error } = await query;
    if (error) throw new Error(`GET_RELATIONSHIPS_FAILED: ${error.message}`);
    if (!rels || rels.length === 0) return [];

    if (options?.includeEvidence !== false) {
      const relIds = rels.map(r => r.relationship_id);
      const { data: evidenceList } = await this.supabase
        .from('atlas_semantic_relationship_evidence')
        .select('*')
        .eq('tenant_id', tenantId)
        .in('relationship_id', relIds);

      const evidenceMap = new Map<string, any[]>();
      (evidenceList || []).forEach(ev => {
        if (!evidenceMap.has(ev.relationship_id)) evidenceMap.set(ev.relationship_id, []);
        evidenceMap.get(ev.relationship_id)!.push(ev);
      });

      return rels.map(r => ({
        ...r,
        evidence: evidenceMap.get(r.relationship_id) || []
      })) as SemanticRelationship[];
    }

    return rels as SemanticRelationship[];
  }

  /**
   * Conservative current fact resolution (Requirement 13)
   * Resolves currently active fact for a predicate without naive "most recent" guessing.
   * Returns RESOLVED, AMBIGUOUS, or UNKNOWN.
   */
  public async resolveCurrentFact(
    entityId: string,
    predicateCode: string,
    tenantId?: string
  ): Promise<CurrentFactResolutionResult> {
    const tId = tenantId || (await this.getDefaultTenantId());
    const root = await this.canonicalService.resolveCanonicalRoot(entityId, tId);
    const pred = PredicateRegistry.getPredicate(predicateCode);

    if (!pred) {
      return {
        predicate_code: predicateCode,
        status: 'UNKNOWN',
        reason: `Predicate '${predicateCode}' is not registered.`
      };
    }

    // 1. Check for active contradictions
    const { data: activeContradictions } = await this.supabase
      .from('atlas_semantic_contradictions')
      .select('*, atlas_semantic_contradiction_claims(fact_id)')
      .eq('tenant_id', tId)
      .eq('subject_entity_id', root.canonical_entity_id)
      .eq('predicate_code', predicateCode)
      .eq('status', 'UNRESOLVED');

    if (activeContradictions && activeContradictions.length > 0) {
      const conflictingFactIds: string[] = [];
      for (const ac of activeContradictions) {
        if (ac.atlas_semantic_contradiction_claims) {
          conflictingFactIds.push(...ac.atlas_semantic_contradiction_claims.map((c: any) => c.fact_id));
        }
      }

      const { data: conflictingFacts } = await this.supabase
        .from('atlas_semantic_facts')
        .select('*')
        .eq('tenant_id', tId)
        .in('fact_id', conflictingFactIds);

      return {
        predicate_code: predicateCode,
        status: 'AMBIGUOUS',
        competing_claims: (conflictingFacts || []) as SemanticFact[],
        reason: `Active contradiction detected with ${conflictingFacts?.length || 0} conflicting claims.`
      };
    }

    // 2. Query active facts currently valid (now between valid_from and valid_to)
    const now = new Date().toISOString();
    const facts = await this.getFactsForEntity(root.canonical_entity_id, {
      tenantId: tId,
      includeHistorical: false
    });

    const candidateFacts = facts.filter(f => {
      if (f.predicate_code !== predicateCode) return false;
      const validFromOk = f.valid_from <= now;
      const validToOk = !f.valid_to || f.valid_to >= now;
      return validFromOk && validToOk;
    });

    if (candidateFacts.length === 0) {
      return {
        predicate_code: predicateCode,
        status: 'UNKNOWN',
        reason: `No currently valid facts or claims found for predicate '${predicateCode}'.`
      };
    }

    if (candidateFacts.length === 1) {
      return {
        predicate_code: predicateCode,
        status: 'RESOLVED',
        current_fact: candidateFacts[0],
        reason: `Single uncontested fact found with confidence ${candidateFacts[0].confidence}.`
      };
    }

    // Multi-candidate resolution: check if one is validated FACT while others are unvalidated CLAIMs
    const validatedFacts = candidateFacts.filter(
      f => f.knowledge_type === 'FACT' || f.knowledge_type === 'USER_CONFIRMED_FACT'
    );

    if (validatedFacts.length === 1) {
      return {
        predicate_code: predicateCode,
        status: 'RESOLVED',
        current_fact: validatedFacts[0],
        reason: `Resolved authoritative FACT over uncorroborated CLAIM candidates.`
      };
    }

    // If multiple validated facts exist with different values for a single-value predicate -> AMBIGUOUS
    if (pred.cardinality === 'SINGLE') {
      const distinctValues = new Set(candidateFacts.map(f => JSON.stringify(f.object_value)));
      if (distinctValues.size > 1) {
        return {
          predicate_code: predicateCode,
          status: 'AMBIGUOUS',
          competing_claims: candidateFacts,
          reason: `Multiple competing claims exist without decisive corroboration.`
        };
      }
    }

    // Return the fact with the highest confidence
    candidateFacts.sort((a, b) => b.confidence - a.confidence);
    return {
      predicate_code: predicateCode,
      status: 'RESOLVED',
      current_fact: candidateFacts[0],
      reason: `Multi-value or highest corroborated fact returned.`
    };
  }

  /**
   * Retrieves active contradictions for an entity.
   */
  public async getContradictions(
    entityId: string,
    tenantId?: string
  ): Promise<ContradictionGroup[]> {
    const tId = tenantId || (await this.getDefaultTenantId());
    const root = await this.canonicalService.resolveCanonicalRoot(entityId, tId);

    const { data: contradictions, error } = await this.supabase
      .from('atlas_semantic_contradictions')
      .select('*, atlas_semantic_contradiction_claims(fact_id)')
      .eq('tenant_id', tId)
      .eq('subject_entity_id', root.canonical_entity_id)
      .eq('status', 'UNRESOLVED');

    if (error || !contradictions || contradictions.length === 0) return [];

    const results: ContradictionGroup[] = [];

    for (const c of contradictions) {
      const factIds = (c.atlas_semantic_contradiction_claims || []).map((m: any) => m.fact_id);
      let conflictingFacts: SemanticFact[] = [];

      if (factIds.length > 0) {
        const { data: facts } = await this.supabase
          .from('atlas_semantic_facts')
          .select('*')
          .eq('tenant_id', tId)
          .in('fact_id', factIds);
        conflictingFacts = (facts || []) as SemanticFact[];
      }

      results.push({
        subject_entity_id: root.canonical_entity_id,
        predicate_code: c.predicate_code,
        contradiction_type: c.contradiction_type,
        conflicting_facts: conflictingFacts,
        temporal_overlap: true,
        detected_at: c.detected_at,
        status: c.status
      });
    }

    return results;
  }

  /**
   * Derives rule-based inferences for an entity, recording normalized lineage and maintaining idempotency.
   */
  public async deriveInferences(
    entityId: string,
    tenantId?: string
  ): Promise<SemanticInference[]> {
    const tId = tenantId || (await this.getDefaultTenantId());
    const root = await this.canonicalService.resolveCanonicalRoot(entityId, tId);

    const facts = await this.getFactsForEntity(root.canonical_entity_id, {
      tenantId: tId,
      includeHistorical: false
    });
    const relationships = await this.getRelationshipsForEntity(root.canonical_entity_id, {
      tenantId: tId,
      includeInactive: false
    });

    const proposedInferences = AtlasInferenceEngine.evaluateRules(
      root.canonical_entity_id,
      tId,
      facts,
      relationships
    );

    const activeInferences: SemanticInference[] = [];

    for (const prop of proposedInferences) {
      // Check idempotency: check if active inference with same rule & version exists
      const { data: existingInf } = await this.supabase
        .from('atlas_semantic_inferences')
        .select('*')
        .eq('tenant_id', tId)
        .eq('subject_entity_id', root.canonical_entity_id)
        .eq('inference_rule', prop.inferenceRule)
        .eq('inference_rule_version', prop.inferenceRuleVersion)
        .eq('status', 'ACTIVE')
        .maybeSingle();

      let inferenceId: string;

      if (existingInf) {
        inferenceId = existingInf.inference_id;
        activeInferences.push({
          ...existingInf,
          derived_from_facts: prop.derivedFromFacts,
          derived_from_relationships: prop.derivedFromRelationships
        } as SemanticInference);
      } else {
        // Insert new inference
        const { data: newInf, error: infErr } = await this.supabase
          .from('atlas_semantic_inferences')
          .insert({
            tenant_id: tId,
            subject_entity_id: root.canonical_entity_id,
            inference_type: prop.inferenceType,
            inference_rule: prop.inferenceRule,
            inference_rule_version: prop.inferenceRuleVersion,
            confidence: prop.confidence,
            explanation: prop.explanation,
            status: 'ACTIVE',
            metadata: prop.metadata || {}
          })
          .select()
          .single();

        if (infErr || !newInf) {
          throw new Error(`INFERENCE_INSERT_FAILED: ${infErr?.message}`);
        }

        inferenceId = newInf.inference_id;

        // Insert normalized lineage into atlas_semantic_inference_evidence (Requirements 6 & 52)
        for (const fId of prop.derivedFromFacts) {
          await this.supabase
            .from('atlas_semantic_inference_evidence')
            .upsert(
              {
                tenant_id: tId,
                inference_id: inferenceId,
                fact_id: fId,
                relationship_id: null
              },
              { onConflict: 'tenant_id,inference_id,fact_id,relationship_id' }
            );
        }

        for (const rId of prop.derivedFromRelationships) {
          await this.supabase
            .from('atlas_semantic_inference_evidence')
            .upsert(
              {
                tenant_id: tId,
                inference_id: inferenceId,
                fact_id: null,
                relationship_id: rId
              },
              { onConflict: 'tenant_id,inference_id,fact_id,relationship_id' }
            );
        }

        activeInferences.push({
          ...newInf,
          derived_from_facts: prop.derivedFromFacts,
          derived_from_relationships: prop.derivedFromRelationships
        } as SemanticInference);
      }
    }

    return activeInferences;
  }

  /**
   * Generates a comprehensive knowledge summary for an entity.
   */
  public async getEntityKnowledgeSummary(
    entityId: string,
    tenantId?: string
  ): Promise<EntityKnowledgeSummary> {
    const tId = tenantId || (await this.getDefaultTenantId());
    const root = await this.canonicalService.resolveCanonicalRoot(entityId, tId);

    const allFacts = await this.getFactsForEntity(root.canonical_entity_id, {
      tenantId: tId,
      includeHistorical: true,
      includeEvidence: true
    });

    const now = new Date().toISOString();
    const currentFacts = allFacts.filter(
      f => f.status === 'ACTIVE' && (!f.valid_to || f.valid_to >= now)
    );
    const historicalFacts = allFacts.filter(
      f => f.status !== 'ACTIVE' || (f.valid_to && f.valid_to < now)
    );

    const relationships = await this.getRelationshipsForEntity(root.canonical_entity_id, {
      tenantId: tId,
      includeInactive: false,
      includeEvidence: true
    });

    const contradictions = await this.getContradictions(root.canonical_entity_id, tId);
    const inferences = await this.deriveInferences(root.canonical_entity_id, tId);

    // Count unique evidence observations
    const observationIds = new Set<string>();
    allFacts.forEach(f => (f.evidence || []).forEach(e => observationIds.add(e.source_observation_id)));
    relationships.forEach(r => (r.evidence || []).forEach(e => observationIds.add(e.source_observation_id)));

    return {
      subject_entity_id: entityId,
      canonical_root_id: root.canonical_entity_id,
      canonical_name: root.canonical_name,
      entity_type: root.entity_type,
      current_facts: currentFacts,
      historical_facts: historicalFacts,
      relationships: relationships,
      contradictions: contradictions,
      inferences: inferences,
      total_evidence_observations: observationIds.size,
      summarized_at: now
    };
  }

  // --- Internal Helpers ---

  private hasTemporalOverlap(
    startA: string,
    endA: string | null,
    startB: string,
    endB: string | null
  ): boolean {
    const tStartA = new Date(startA).getTime();
    const tEndA = endA ? new Date(endA).getTime() : Number.POSITIVE_INFINITY;
    const tStartB = new Date(startB).getTime();
    const tEndB = endB ? new Date(endB).getTime() : Number.POSITIVE_INFINITY;

    return tStartA <= tEndB && tEndA >= tStartB;
  }

  private assertNoPlaintextPii(data: any, fieldName: string): void {
    const forbiddenKeys = new Set([
      'email', 'phone', 'telephone', 'mobile',
      'password', 'token', 'secret', 'authorization',
      'cookie', 'session', 'auth_token', 'access_token',
      'refresh_token', 'api_key', 'bearer'
    ]);

    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
    const phoneRegex = /\b(?:\+\d{1,3}[- ]?)?\(?\d{2,4}\)?[- ]?\d{3,4}[- ]?\d{3,4}\b/;

    const checkValue = (val: any, path: string) => {
      if (val === null || val === undefined) return;

      if (typeof val === 'string') {
        if (emailRegex.test(val)) {
          throw new Error(`PII_VIOLATION_DETECTED: Plaintext email detected in ${path}.`);
        }
        if (phoneRegex.test(val)) {
          throw new Error(`PII_VIOLATION_DETECTED: Plaintext phone number detected in ${path}.`);
        }
      } else if (typeof val === 'object') {
        for (const key of Object.keys(val)) {
          if (forbiddenKeys.has(key.toLowerCase())) {
            throw new Error(`PII_VIOLATION_DETECTED: Forbidden sensitive key '${key}' detected at ${path}.${key}.`);
          }
          checkValue(val[key], `${path}.${key}`);
        }
      }
    };

    checkValue(data, fieldName);
  }

  private async getDefaultTenantId(): Promise<string> {
    const { data: tenant } = await this.supabase
      .from('atlas_tenants')
      .select('tenant_id')
      .limit(1)
      .single();

    if (!tenant) throw new Error('NO_DEFAULT_TENANT: No tenant found in database.');
    return tenant.tenant_id;
  }
}
