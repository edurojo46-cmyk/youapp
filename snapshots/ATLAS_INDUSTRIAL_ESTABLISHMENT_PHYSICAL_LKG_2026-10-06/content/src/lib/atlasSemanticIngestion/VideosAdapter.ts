/**
 * Atlas Semantic Intelligence — Videos Adapter V1
 * Transforms videos rows into Person / Creator entity candidates with role claims.
 */

import { SourceAdapter } from './SourceAdapter';
import type { SemanticIngestionEnvelope, SourceAuthorityClass } from './types';

export class VideosAdapter extends SourceAdapter {
  readonly sourceName = 'VIDEOS_CATALOG';
  readonly authorityClass: SourceAuthorityClass = 'TRUSTED';

  public async transformRecord(
    record: any,
    tenantId: string
  ): Promise<SemanticIngestionEnvelope | null> {
    if (!record || !record.id || !record.author) return null;
    if (!tenantId) throw new Error('TENANT_ID_REQUIRED: Tenant ID must be provided for VideosAdapter.');

    const authorName = this.sanitizeText(record.author);
    if (!authorName || authorName.length === 0) return null;

    const observedAt = record.created_at || new Date().toISOString();

    const envelope: SemanticIngestionEnvelope = {
      source_name: this.sourceName,
      source_record_id: String(record.id),
      tenant_id: tenantId,
      observed_at: observedAt,
      authority_class: this.authorityClass,
      entity_candidates: [
        {
          source_entity_key: 'person:creator',
          candidate: {
            source_name: this.sourceName,
            source_record_id: String(record.id),
            source_entity_key: 'person:creator',
            entity_type: 'PERSON',
            raw_name: authorName,
            observed_at: observedAt
          }
        }
      ],
      claim_candidates: [
        {
          source_entity_key: 'person:creator',
          predicate_code: 'HAS_ROLE',
          value_type: 'TEXT',
          object_value: 'Content Creator',
          confidence: 0.88,
          observed_at: observedAt
        }
      ],
      relationship_candidates: [],
      metadata: {
        provider: record.provider,
        title: record.title
      }
    };

    return envelope;
  }
}
