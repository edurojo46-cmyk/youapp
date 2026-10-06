/**
 * ATLAS GLOBAL ENTITY RESOLVER V1
 * 
 * Superior entity resolution abstraction in the Atlas Industrial Search Fabric.
 * Delegates resolution and deduplication logic according to each registered DomainPack.
 * 
 * Critical Invariants:
 * - Domain Isolation: Never reuse PERSON resolution rules for TENDER or other entity types.
 * - Safety First: Soft attribute conjunctions NEVER perform a canonical merge.
 * - Strong Identity Anchors: Merges require authoritative identifiers (CUIL, Hash, Decree/Process ID).
 */

import type { AtlasEntity } from '../contracts/AtlasEntity';
import type { AtlasDomainPack } from '../contracts/AtlasDomainPack';

export interface ResolutionResult {
  match_type: 'EXACT_CANONICAL_MATCH' | 'PROBABLE_SAME_ENTITY' | 'NEW_UNIQUE_ENTITY' | 'REJECTED_COLLISION';
  canonical_id: string;
  confidence: number;
  matched_on: string[];
  canonical_merge_permitted: boolean;
  notes?: string;
}

export class AtlasGlobalEntityResolver {
  private domainPacks: Map<string, AtlasDomainPack> = new Map();
  private entityStore: Map<string, Map<string, AtlasEntity>> = new Map(); // domain_id -> (entity_id -> entity)
  private strongIndex: Map<string, Map<string, string>> = new Map(); // domain_id -> (strong_key -> entity_id)

  public registerDomainPack(pack: AtlasDomainPack): void {
    this.domainPacks.set(pack.domain_id, pack);
    if (!this.entityStore.has(pack.domain_id)) {
      this.entityStore.set(pack.domain_id, new Map());
    }
    if (!this.strongIndex.has(pack.domain_id)) {
      this.strongIndex.set(pack.domain_id, new Map());
    }
  }

  public resolveEntity(entity: AtlasEntity): ResolutionResult {
    const domainPack = this.domainPacks.get(entity.domain_id);
    if (!domainPack) {
      throw new Error(`[AtlasGlobalEntityResolver] DomainPack '${entity.domain_id}' is not registered.`);
    }

    const domainEntities = this.entityStore.get(entity.domain_id)!;
    const domainStrongIndex = this.strongIndex.get(entity.domain_id)!;

    // Check if domain-specific entity type matches
    if (domainPack.entity_type !== entity.entity_type) {
      throw new Error(`[AtlasGlobalEntityResolver] Entity type '${entity.entity_type}' mismatches domain pack '${domainPack.entity_type}'.`);
    }

    // Branch resolution according to domain-declared identity policy
    if (entity.domain_id === 'PEOPLE_ARGENTINA') {
      return this.resolvePerson(entity, domainEntities, domainStrongIndex, domainPack);
    } else if (entity.domain_id === 'PROCUREMENT_ARGENTINA') {
      return this.resolveTender(entity, domainEntities, domainStrongIndex, domainPack);
    } else {
      return this.resolveGenericDomainEntity(entity, domainEntities, domainStrongIndex, domainPack);
    }
  }

  /**
   * PERSON Identity Resolution
   * Adheres strictly to Gate 0.2:
   * - Soft 4-attribute conjunction produces PROBABLE_SAME_ENTITY, NOT CANONICAL_MERGE.
   * - Canonical merge strictly requires strong national anchor (CUIL/DNI hash or authoritative identifier).
   */
  private resolvePerson(
    entity: AtlasEntity,
    store: Map<string, AtlasEntity>,
    strongIndex: Map<string, string>,
    pack: AtlasDomainPack
  ): ResolutionResult {
    const strongAnchor = entity.attributes.identity_anchor_hash || entity.attributes.national_id_hash;
    
    // 1. Strong Anchor Match
    if (strongAnchor) {
      const strongKey = `PERSON_STRONG_${strongAnchor}`;
      const existingId = strongIndex.get(strongKey);
      if (existingId) {
        return {
          match_type: 'EXACT_CANONICAL_MATCH',
          canonical_id: existingId,
          confidence: 0.99,
          matched_on: ['identity_anchor_hash'],
          canonical_merge_permitted: true,
          notes: 'Strong identity anchor exact match'
        };
      }
    }

    // 2. Exact Entity ID Match
    if (store.has(entity.entity_id)) {
      return {
        match_type: 'EXACT_CANONICAL_MATCH',
        canonical_id: entity.entity_id,
        confidence: 1.0,
        matched_on: ['atlas_person_id'],
        canonical_merge_permitted: true
      };
    }

    // 3. Soft Corroboration Check across existing profiles
    for (const [existingId, existing] of store.entries()) {
      const nameMatch = existing.attributes.full_name && entity.attributes.full_name &&
        existing.attributes.full_name.toLowerCase().trim() === entity.attributes.full_name.toLowerCase().trim();
      const orgMatch = existing.attributes.organization && entity.attributes.organization &&
        existing.attributes.organization.toLowerCase().trim() === entity.attributes.organization.toLowerCase().trim();
      const roleMatch = existing.attributes.job_title && entity.attributes.job_title &&
        existing.attributes.job_title.toLowerCase().trim() === entity.attributes.job_title.toLowerCase().trim();
      const geoMatch = existing.attributes.province && entity.attributes.province &&
        existing.attributes.province.toLowerCase().trim() === entity.attributes.province.toLowerCase().trim();

      if (nameMatch && orgMatch && roleMatch && geoMatch) {
        // Corroborated candidate: DO NOT CANONICAL MERGE (Gate 0.2 invariant)
        return {
          match_type: 'PROBABLE_SAME_ENTITY',
          canonical_id: existingId,
          confidence: 0.82,
          matched_on: ['full_name', 'organization', 'job_title', 'province'],
          canonical_merge_permitted: false,
          notes: 'Corroboration candidate only: soft 4-attribute conjunction forbids canonical merge without strong anchor'
        };
      }
    }

    // 4. Unique New Person
    return {
      match_type: 'NEW_UNIQUE_ENTITY',
      canonical_id: entity.entity_id,
      confidence: 1.0,
      matched_on: ['net_new_identity'],
      canonical_merge_permitted: true
    };
  }

  /**
   * TENDER Identity Resolution
   * Adheres strictly to Phase 18:
   * - Strong identifiers: official tender process number + agency, or canonical source URL.
   * - ZERO title-only merges. Similar title is rejected as a merge candidate.
   */
  private resolveTender(
    entity: AtlasEntity,
    store: Map<string, AtlasEntity>,
    strongIndex: Map<string, string>,
    pack: AtlasDomainPack
  ): ResolutionResult {
    const processNum = entity.attributes.process_number;
    const agency = entity.attributes.agency;
    const sourceUrl = entity.attributes.source_url;

    // 1. Official Tender Process Number + Agency Key
    if (processNum && agency) {
      const strongKey = `TENDER_${agency.toUpperCase().trim()}_${processNum.toUpperCase().trim()}`;
      const existingId = strongIndex.get(strongKey);
      if (existingId) {
        return {
          match_type: 'EXACT_CANONICAL_MATCH',
          canonical_id: existingId,
          confidence: 0.99,
          matched_on: ['agency', 'process_number'],
          canonical_merge_permitted: true,
          notes: 'Official procurement process number + agency exact match'
        };
      }
    }

    // 2. Canonical Source URL match
    if (sourceUrl) {
      const urlKey = `TENDER_URL_${sourceUrl.trim()}`;
      const existingId = strongIndex.get(urlKey);
      if (existingId) {
        return {
          match_type: 'EXACT_CANONICAL_MATCH',
          canonical_id: existingId,
          confidence: 0.98,
          matched_on: ['source_url'],
          canonical_merge_permitted: true,
          notes: 'Official procurement canonical URL match'
        };
      }
    }

    // 3. Similar title check: MUST NEVER MERGE (Phase 18 invariant: zero title-only merges)
    for (const [existingId, existing] of store.entries()) {
      if (existing.attributes.title && entity.attributes.title &&
          existing.attributes.title.toLowerCase().trim() === entity.attributes.title.toLowerCase().trim()) {
        // Identical title across different process numbers = separate procurement procedures!
        return {
          match_type: 'PROBABLE_SAME_ENTITY',
          canonical_id: existingId,
          confidence: 0.50,
          matched_on: ['title'],
          canonical_merge_permitted: false,
          notes: 'Similar title rejected as canonical merge: procurement procedures require unique process numbers'
        };
      }
    }

    // 4. Net-new Tender
    return {
      match_type: 'NEW_UNIQUE_ENTITY',
      canonical_id: entity.entity_id,
      confidence: 1.0,
      matched_on: ['net_new_tender_record'],
      canonical_merge_permitted: true
    };
  }

  /**
   * Generic Domain Resolution according to declared DomainPack identity policies
   */
  private resolveGenericDomainEntity(
    entity: AtlasEntity,
    store: Map<string, AtlasEntity>,
    strongIndex: Map<string, string>,
    pack: AtlasDomainPack
  ): ResolutionResult {
    const strongFields = pack.identity_policy.strong_identifier_fields;
    for (const field of strongFields) {
      const val = entity.attributes[field];
      if (val) {
        const strongKey = `${pack.domain_id}_${field}_${val}`;
        const existingId = strongIndex.get(strongKey);
        if (existingId) {
          return {
            match_type: 'EXACT_CANONICAL_MATCH',
            canonical_id: existingId,
            confidence: 0.95,
            matched_on: [field],
            canonical_merge_permitted: true
          };
        }
      }
    }

    return {
      match_type: 'NEW_UNIQUE_ENTITY',
      canonical_id: entity.entity_id,
      confidence: 1.0,
      matched_on: ['generic_new_entity'],
      canonical_merge_permitted: true
    };
  }

  /**
   * Index a resolved canonical entity into memory indexes
   */
  public indexEntity(entity: AtlasEntity): void {
    const domainStore = this.entityStore.get(entity.domain_id);
    const domainStrongIndex = this.strongIndex.get(entity.domain_id);
    if (!domainStore || !domainStrongIndex) return;

    domainStore.set(entity.entity_id, entity);

    if (entity.domain_id === 'PEOPLE_ARGENTINA') {
      const strongAnchor = entity.attributes.identity_anchor_hash || entity.attributes.national_id_hash;
      if (strongAnchor) {
        domainStrongIndex.set(`PERSON_STRONG_${strongAnchor}`, entity.entity_id);
      }
    } else if (entity.domain_id === 'PROCUREMENT_ARGENTINA') {
      const processNum = entity.attributes.process_number;
      const agency = entity.attributes.agency;
      if (processNum && agency) {
        domainStrongIndex.set(`TENDER_${agency.toUpperCase().trim()}_${processNum.toUpperCase().trim()}`, entity.entity_id);
      }
      if (entity.attributes.source_url) {
        domainStrongIndex.set(`TENDER_URL_${entity.attributes.source_url.trim()}`, entity.entity_id);
      }
    }
  }

  public getEntityCount(domain_id: string): number {
    return this.entityStore.get(domain_id)?.size || 0;
  }
}
