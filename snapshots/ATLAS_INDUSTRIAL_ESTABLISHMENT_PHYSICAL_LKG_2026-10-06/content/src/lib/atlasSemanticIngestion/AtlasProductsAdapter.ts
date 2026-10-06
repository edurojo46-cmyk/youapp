/**
 * Atlas Semantic Intelligence — Atlas Products Adapter V1 (Quality Corrected)
 * Transforms atlas_products rows into Product entity candidates.
 * Enforces FieldSemanticPolicy: skips invalid TECH_STACK mapping from taxonomy category.
 */

import { SourceAdapter } from './SourceAdapter';
import type { SemanticIngestionEnvelope, SourceAuthorityClass } from './types';

export class AtlasProductsAdapter extends SourceAdapter {
  readonly sourceName = 'ATLAS_PRODUCTS';
  readonly authorityClass: SourceAuthorityClass = 'TRUSTED';

  public async transformRecord(
    record: any,
    tenantId: string
  ): Promise<SemanticIngestionEnvelope | null> {
    if (!record || !record.product_id || !record.name) return null;

    const recTenant = record.tenant_id || tenantId;
    if (recTenant !== tenantId) {
      throw new Error(`TENANT_MISMATCH: Record tenant '${recTenant}' does not match job tenant '${tenantId}'.`);
    }

    const prodName = this.sanitizeText(record.name);
    if (!prodName || prodName.length === 0) return null;

    const observedAt = record.created_at || new Date().toISOString();

    const envelope: SemanticIngestionEnvelope = {
      source_name: this.sourceName,
      source_record_id: String(record.product_id),
      tenant_id: tenantId,
      observed_at: observedAt,
      authority_class: this.authorityClass,
      entity_candidates: [
        {
          source_entity_key: 'product:primary',
          candidate: {
            source_name: this.sourceName,
            source_record_id: String(record.product_id),
            source_entity_key: 'product:primary',
            entity_type: 'PRODUCT',
            raw_name: prodName,
            observed_at: observedAt
          }
        }
      ],
      // FieldSemanticPolicy: product category (e.g. EVENT, TANGO) is taxonomy metadata, NOT tech stack.
      claim_candidates: [],
      relationship_candidates: [],
      metadata: {
        category: record.category,
        description: record.description
      }
    };

    return envelope;
  }
}
