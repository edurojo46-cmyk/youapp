/**
 * Atlas Semantic Intelligence — Seed Sources Adapter V1 (Quality Corrected)
 * Transforms seed_sources rows into Company / Organization canonical entity candidates.
 * Enforces Shared Platform Domain rule and avoids location/category conflation.
 */

import { SourceAdapter } from './SourceAdapter';
import type { SemanticIngestionEnvelope, SourceAuthorityClass } from './types';
import { EntityNormalizationEngine } from '../atlasSemantic/EntityNormalizationEngine';

export class SeedSourcesAdapter extends SourceAdapter {
  readonly sourceName = 'SEED_SOURCES';
  readonly authorityClass: SourceAuthorityClass = 'TRUSTED';

  public async transformRecord(
    record: any,
    tenantId: string
  ): Promise<SemanticIngestionEnvelope | null> {
    if (!record || !record.id || !record.name) return null;
    if (!tenantId) throw new Error('TENANT_ID_REQUIRED: Tenant ID must be provided for SeedSourcesAdapter.');

    const publisherName = this.sanitizeText(record.name);
    if (!publisherName || publisherName.length === 0) return null;

    const observedAt = record.created_at || new Date().toISOString();

    // Ensure shared platform URLs (e.g. youtube.com/...) are NOT passed as strong company primary_domain
    const rawDomain = record.canonical_url ? EntityNormalizationEngine.normalizeDomain(record.canonical_url) : undefined;
    const companyDomain = EntityNormalizationEngine.isSharedPlatformDomain(rawDomain) ? undefined : rawDomain;

    // Use explicit external identifier namespace for stable channel identity
    const externalIds: Record<string, string> = {};
    if (record.provider_channel_id) {
      externalIds[`${record.provider || 'youtube'}_channel`] = String(record.provider_channel_id);
    } else if (record.id) {
      externalIds['seed_source_id'] = String(record.id);
    }

    const envelope: SemanticIngestionEnvelope = {
      source_name: this.sourceName,
      source_record_id: String(record.id),
      tenant_id: tenantId,
      observed_at: observedAt,
      authority_class: this.authorityClass,
      entity_candidates: [
        {
          source_entity_key: 'company:primary',
          candidate: {
            source_name: this.sourceName,
            source_record_id: String(record.id),
            source_entity_key: 'company:primary',
            entity_type: 'COMPANY',
            raw_name: publisherName,
            domain: companyDomain,
            external_ids: Object.keys(externalIds).length > 0 ? externalIds : undefined,
            observed_at: observedAt
          }
        }
      ],
      claim_candidates: [],
      relationship_candidates: [],
      metadata: {
        provider: record.provider,
        handle: record.handle,
        is_official: record.is_official,
        channel_country: record.country,
        content_language: record.language
      }
    };

    return envelope;
  }
}
