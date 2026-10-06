/**
 * Atlas Semantic Intelligence — Field-Level Semantic Authority Policy V1
 * Defines granular, field-level semantic authority and transformation rules per source column.
 * Enforces strict separation between content source entity and content subject entity.
 * Enforces SHARED_PLATFORM_DOMAIN => NEVER_STRONG_COMPANY_IDENTITY rule.
 */

import type { SourceAuthorityClass } from './types';

export type AllowedKnowledgeType = 'CLAIM' | 'FACT' | 'RELATIONSHIP' | 'ENTITY_IDENTITY' | 'SKIP';

export interface FieldSemanticPolicy {
  source_table: string;
  source_column: string;
  semantic_meaning: string;
  predicate?: string;
  authority_class: SourceAuthorityClass;
  allowed_knowledge_type: AllowedKnowledgeType;
  transformation_rule: string;
}

export const FIELD_SEMANTIC_POLICIES: Record<string, FieldSemanticPolicy> = {
  // SEED_SOURCES POLICIES
  'seed_sources.name': {
    source_table: 'seed_sources',
    source_column: 'name',
    semantic_meaning: 'SOURCE_PUBLISHER_OR_CHANNEL_BRAND_NAME',
    authority_class: 'AUTHORITATIVE',
    allowed_knowledge_type: 'ENTITY_IDENTITY',
    transformation_rule: 'Normalizes brand/channel name to distinct COMPANY/ORGANIZATION entity candidate. Note: CONTENT_SOURCE_ENTITY != CONTENT_SUBJECT_ENTITY.'
  },
  'seed_sources.canonical_url': {
    source_table: 'seed_sources',
    source_column: 'canonical_url',
    semantic_meaning: 'OFFICIAL_SOURCE_CHANNEL_URL',
    authority_class: 'AUTHORITATIVE',
    allowed_knowledge_type: 'ENTITY_IDENTITY',
    transformation_rule: 'Shared platform domains (e.g. youtube.com) must NEVER be treated as strong company identity.'
  },
  'seed_sources.provider_channel_id': {
    source_table: 'seed_sources',
    source_column: 'provider_channel_id',
    semantic_meaning: 'PLATFORM_CHANNEL_EXTERNAL_IDENTIFIER',
    authority_class: 'AUTHORITATIVE',
    allowed_knowledge_type: 'ENTITY_IDENTITY',
    transformation_rule: 'Namespaced external identifier (e.g. youtube_channel:<id>) distinguishing publishers on shared platforms.'
  },
  'seed_sources.provider': {
    source_table: 'seed_sources',
    source_column: 'provider',
    semantic_meaning: 'CONTENT_PLATFORM_OR_DELIVERY_CHANNEL',
    authority_class: 'TRUSTED',
    allowed_knowledge_type: 'SKIP',
    transformation_rule: 'Do NOT map delivery platform (e.g. YouTube) to entity TECH_STACK.'
  },
  'seed_sources.country': {
    source_table: 'seed_sources',
    source_column: 'country',
    semantic_meaning: 'CHANNEL_BROADCAST_COUNTRY_OR_TARGET_MARKET',
    authority_class: 'UNVERIFIED',
    allowed_knowledge_type: 'SKIP',
    transformation_rule: 'Do NOT map broadcast market country to physical COMPANY LOCATED_IN LOCATION. Do NOT create empty LOCATION canonical entities.'
  },
  'seed_sources.language': {
    source_table: 'seed_sources',
    source_column: 'language',
    semantic_meaning: 'CONTENT_LOCALE',
    authority_class: 'TRUSTED',
    allowed_knowledge_type: 'SKIP',
    transformation_rule: 'Language of media feed does not assert entity language fact in V1.'
  },
  'seed_sources.is_official': {
    source_table: 'seed_sources',
    source_column: 'is_official',
    semantic_meaning: 'CHANNEL_VERIFICATION_STATUS',
    authority_class: 'AUTHORITATIVE',
    allowed_knowledge_type: 'SKIP',
    transformation_rule: 'Used for source confidence scoring, not as a semantic predicate.'
  },

  // ATLAS_PRODUCTS POLICIES
  'atlas_products.name': {
    source_table: 'atlas_products',
    source_column: 'name',
    semantic_meaning: 'PRODUCT_NAME',
    authority_class: 'AUTHORITATIVE',
    allowed_knowledge_type: 'ENTITY_IDENTITY',
    transformation_rule: 'Normalizes product name to PRODUCT canonical entity candidate.'
  },
  'atlas_products.category': {
    source_table: 'atlas_products',
    source_column: 'category',
    semantic_meaning: 'PRODUCT_TAXONOMY_CATEGORY',
    authority_class: 'TRUSTED',
    allowed_knowledge_type: 'SKIP',
    transformation_rule: 'Category (e.g. EVENT, TANGO) is not a TECH_STACK; skip until taxonomy predicate exists.'
  },
  'atlas_products.description': {
    source_table: 'atlas_products',
    source_column: 'description',
    semantic_meaning: 'PRODUCT_DESCRIPTION',
    authority_class: 'TRUSTED',
    allowed_knowledge_type: 'SKIP',
    transformation_rule: 'Stored in observation metadata only.'
  },

  // ATLAS_PEOPLE POLICIES
  'atlas_people.full_name': {
    source_table: 'atlas_people',
    source_column: 'full_name',
    semantic_meaning: 'PERSON_DISPLAY_NAME',
    authority_class: 'TRUSTED',
    allowed_knowledge_type: 'ENTITY_IDENTITY',
    transformation_rule: 'Normalizes person name to PERSON canonical entity candidate. Same name alone NEVER produces AUTO_MATCH.'
  },
  'atlas_people.tenant_id': {
    source_table: 'atlas_people',
    source_column: 'tenant_id',
    semantic_meaning: 'OWNING_TENANT_IDENTIFIER',
    authority_class: 'AUTHORITATIVE',
    allowed_knowledge_type: 'ENTITY_IDENTITY',
    transformation_rule: 'Strict boundary. Reject ingestion if row tenant_id does not match job tenant.'
  },
  'atlas_people.role': {
    source_table: 'atlas_people',
    source_column: 'role',
    semantic_meaning: 'SELF_REPORTED_OR_EXTERNAL_ROLE',
    predicate: 'HAS_ROLE',
    authority_class: 'UNVERIFIED',
    allowed_knowledge_type: 'CLAIM',
    transformation_rule: 'Extracts HAS_ROLE as CLAIM (unverified external).'
  },

  // PROFILES POLICIES
  'profiles.username': {
    source_table: 'profiles',
    source_column: 'username',
    semantic_meaning: 'PLATFORM_USER_HANDLE',
    authority_class: 'USER_GENERATED',
    allowed_knowledge_type: 'ENTITY_IDENTITY',
    transformation_rule: 'Normalizes username to PERSON canonical candidate.'
  },
  'profiles.id': {
    source_table: 'profiles',
    source_column: 'id',
    semantic_meaning: 'AUTH_USER_UUID',
    authority_class: 'AUTHORITATIVE',
    allowed_knowledge_type: 'ENTITY_IDENTITY',
    transformation_rule: 'Stable source record ID. Note: does NOT define tenant_id.'
  },

  // VIDEOS POLICIES
  'videos.title': {
    source_table: 'videos',
    source_column: 'title',
    semantic_meaning: 'MEDIA_TITLE',
    authority_class: 'DERIVED',
    allowed_knowledge_type: 'SKIP',
    transformation_rule: 'Video title stored in observation metadata only.'
  },
  'videos.channel_title': {
    source_table: 'videos',
    source_column: 'channel_title',
    semantic_meaning: 'CREATOR_CHANNEL_NAME',
    authority_class: 'DERIVED',
    allowed_knowledge_type: 'ENTITY_IDENTITY',
    transformation_rule: 'Normalizes channel title to PERSON / ORGANIZATION entity candidate.'
  }
};

export class FieldSemanticAuthorityEngine {
  public static getPolicy(table: string, column: string): FieldSemanticPolicy | undefined {
    return FIELD_SEMANTIC_POLICIES[`${table}.${column}`];
  }

  public static isExtractionAllowed(table: string, column: string, desiredType: AllowedKnowledgeType): boolean {
    const policy = this.getPolicy(table, column);
    if (!policy) return false;
    if (policy.allowed_knowledge_type === 'SKIP') return false;
    return policy.allowed_knowledge_type === desiredType;
  }
}
