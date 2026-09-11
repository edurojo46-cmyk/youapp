import { SupabaseClient } from '@supabase/supabase-js';
import { AtlasCanonicalEntityService } from '../atlasSemantic/AtlasCanonicalEntityService';
import { EntityNormalizationEngine } from '../atlasSemantic/EntityNormalizationEngine';
import { StructuredQueryPlan, GroundedClaim, EntitySummaryItem, ProvenanceChainItem, EpistemicStatus } from './types';

export class AtlasGraphRetrievalEngine {
  private readonly supabase: SupabaseClient;
  private readonly canonicalService: AtlasCanonicalEntityService;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
    this.canonicalService = new AtlasCanonicalEntityService(supabase);
  }

  /**
   * Executes multi-hop graph retrieval according to the StructuredQueryPlan.
   */
  public async retrieve(plan: StructuredQueryPlan): Promise<{
    claims: GroundedClaim[];
    entities: EntitySummaryItem[];
    provenance: ProvenanceChainItem[];
  }> {
    const tenantId = plan.tenant_id;
    const entitiesMap = new Map<string, EntitySummaryItem>();
    const provenanceList: ProvenanceChainItem[] = [];
    const claims: GroundedClaim[] = [];

    // 1. Resolve Target Initial Entities
    const targetEntityIds = new Set<string>();

    for (const name of plan.target_entity_names) {
      const normName = EntityNormalizationEngine.normalizeName(name);

      let query = this.supabase
        .from('atlas_canonical_entities')
        .select('*')
        .eq('tenant_id', tenantId);

      if (plan.target_entity_types && plan.target_entity_types.length > 0) {
        query = query.in('entity_type', plan.target_entity_types);
      }

      // Exact or ILIKE lookup
      const { data: matchedEntities } = await query.ilike('normalized_name', `%${normName}%`).limit(10);

      for (const ent of matchedEntities || []) {
        const root = await this.canonicalService.resolveCanonicalRoot(ent.canonical_entity_id, tenantId);
        targetEntityIds.add(root.canonical_entity_id);

        entitiesMap.set(root.canonical_entity_id, {
          canonical_entity_id: root.canonical_entity_id,
          canonical_name: root.canonical_name,
          normalized_name: root.normalized_name,
          entity_type: root.entity_type,
          primary_domain: root.primary_domain || undefined,
          status: root.status
        });
      }
    }

    // 2. Fetch Facts for Target Entities
    const visitedEntityIds = new Set<string>(targetEntityIds);
    let frontierEntityIds = Array.from(targetEntityIds);

    for (let hop = 1; hop <= plan.max_hops; hop++) {
      if (frontierEntityIds.length === 0) break;

      const nextFrontier: string[] = [];

      for (const entId of frontierEntityIds) {
        const currentEntity = entitiesMap.get(entId);
        const subjectName = currentEntity?.canonical_name || 'Unknown Entity';

        // A. Retrieve Facts (Literal Values)
        let factsQuery = this.supabase
          .from('atlas_semantic_facts')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('subject_entity_id', entId);

        if (plan.predicates.length > 0) {
          factsQuery = factsQuery.in('predicate_code', plan.predicates);
        }

        const { data: factRows } = await factsQuery;

        for (const f of factRows || []) {
          // Load fact evidence
          const { data: evRows } = await this.supabase
            .from('atlas_semantic_fact_evidence')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('fact_id', f.fact_id);

          const valText = typeof f.object_value === 'object' && f.object_value !== null ? (f.object_value.value ?? JSON.stringify(f.object_value)) : String(f.object_value);

          claims.push({
            claim_id: f.fact_id,
            statement: `${subjectName} ${f.predicate_code} is "${valText}".`,
            epistemic_status: f.knowledge_type as EpistemicStatus,
            confidence: Number(f.confidence),
            subject_entity_id: entId,
            subject_name: subjectName,
            predicate_code: f.predicate_code,
            object_value: valText,
            valid_from: f.valid_from,
            valid_to: f.valid_to,
            is_active: f.status === 'ACTIVE',
            evidence_sources: (evRows || []).map(e => ({
              source_observation_id: e.source_observation_id,
              evidence_role: e.evidence_role,
              confidence: Number(e.confidence_contribution)
            }))
          });
        }

        // B. Retrieve Relationships (Entity -> Entity) [Bi-directional]
        let relQuery = this.supabase
          .from('atlas_semantic_relationships')
          .select('*')
          .eq('tenant_id', tenantId)
          .or(`subject_entity_id.eq.${entId},object_entity_id.eq.${entId}`);

        if (plan.predicates.length > 0) {
          relQuery = relQuery.in('predicate_code', plan.predicates);
        }

        const { data: relRows } = await relQuery;

        for (const r of relRows || []) {
          const isOutgoing = r.subject_entity_id === entId;
          const otherEntityId = isOutgoing ? r.object_entity_id : r.subject_entity_id;

          const otherRoot = await this.canonicalService.resolveCanonicalRoot(otherEntityId, tenantId);

          if (!entitiesMap.has(otherRoot.canonical_entity_id)) {
            entitiesMap.set(otherRoot.canonical_entity_id, {
              canonical_entity_id: otherRoot.canonical_entity_id,
              canonical_name: otherRoot.canonical_name,
              normalized_name: otherRoot.normalized_name,
              entity_type: otherRoot.entity_type,
              primary_domain: otherRoot.primary_domain || undefined,
              status: otherRoot.status
            });
          }

          const otherName = otherRoot.canonical_name;
          const sName = isOutgoing ? subjectName : otherName;
          const oName = isOutgoing ? otherName : subjectName;
          const sId = isOutgoing ? entId : otherRoot.canonical_entity_id;
          const oId = isOutgoing ? otherRoot.canonical_entity_id : entId;

          // Load relationship evidence
          const { data: rEvRows } = await this.supabase
            .from('atlas_semantic_relationship_evidence')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('relationship_id', r.relationship_id);

          claims.push({
            claim_id: r.relationship_id,
            statement: `${sName} ${r.predicate_code} ${oName}.`,
            epistemic_status: r.knowledge_type as EpistemicStatus,
            confidence: Number(r.confidence),
            subject_entity_id: sId,
            subject_name: sName,
            predicate_code: r.predicate_code,
            object_entity_id: oId,
            object_name: oName,
            valid_from: r.valid_from,
            valid_to: r.valid_to,
            is_active: r.is_active,
            evidence_sources: (rEvRows || []).map(e => ({
              source_observation_id: e.source_observation_id,
              evidence_role: e.evidence_role,
              confidence: Number(e.confidence_contribution)
            }))
          });

          // Next hop frontier
          if (!visitedEntityIds.has(otherRoot.canonical_entity_id) && hop < plan.max_hops) {
            visitedEntityIds.add(otherRoot.canonical_entity_id);
            nextFrontier.push(otherRoot.canonical_entity_id);
          }
        }
      }

      frontierEntityIds = nextFrontier;
    }

    // 3. Load Provenance Observations for Involved Entities
    for (const entId of entitiesMap.keys()) {
      const { data: obsRows } = await this.supabase
        .from('atlas_entity_source_observations')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('canonical_entity_id', entId)
        .limit(5);

      for (const o of obsRows || []) {
        provenanceList.push({
          observation_id: o.observation_id,
          source_name: o.source_name,
          source_record_id: o.source_record_id,
          raw_name: o.raw_name,
          normalized_name: o.normalized_name,
          observed_at: o.observed_at
        });
      }
    }

    return {
      claims,
      entities: Array.from(entitiesMap.values()),
      provenance: provenanceList
    };
  }
}
