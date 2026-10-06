/**
 * ATLAS IDENTITY POLICY PROPOSAL GENERATOR V1
 * 
 * Defines identity resolution, deduplication, and anti-merge policies
 * tailored for corporate and industrial entities (COMPANY / SUPPLIER).
 * 
 * Strict Invariants:
 * - COMPANY_NAME_ONLY_MERGE = 0
 * - TRADE_NAME_ONLY_MERGE = 0
 * - WEBSITE_SIMILARITY_MERGE = 0
 * - Canonical merge requires strong official anchor (CUIT / Registro Oficial).
 */

import type { ParsedDomainIntent } from '../parser/AtlasDomainIntentParser';
import type { AtlasDomainSpecification } from '../contracts/AtlasDomainSpecification';

export class AtlasIdentityPolicyProposal {
  public static generateIdentityPolicy(intent: ParsedDomainIntent): AtlasDomainSpecification['identity_policy'] {
    if (intent.entity_type === 'COMPANY' || intent.entity_type === 'SUPPLIER') {
      return {
        primary_id_field: 'cuit',
        strong_identifier_fields: ['cuit', 'official_registry_number'],
        secondary_identifier_fields: ['company_name', 'province'],
        weak_signal_fields: ['trade_name', 'official_website', 'city'],
        allow_soft_canonical_merge: false,
        allow_name_only_merge: false,
        collision_action: 'REJECT',
        dedup_strategy: 'REGISTRY_ID_MATCH'
      };
    }

    return {
      primary_id_field: 'id',
      strong_identifier_fields: ['id'],
      secondary_identifier_fields: ['name'],
      weak_signal_fields: [],
      allow_soft_canonical_merge: false,
      allow_name_only_merge: false,
      collision_action: 'REJECT',
      dedup_strategy: 'STRONG_HASH_MATCH'
    };
  }
}
