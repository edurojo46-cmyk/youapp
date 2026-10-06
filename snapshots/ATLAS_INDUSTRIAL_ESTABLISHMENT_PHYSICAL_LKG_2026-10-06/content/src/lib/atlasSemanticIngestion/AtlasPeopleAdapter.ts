/**
 * Atlas Semantic Intelligence — Atlas People Adapter V1 (Quality Corrected)
 * Transforms atlas_people rows into Person canonical entity candidates and literal claims.
 * Strictly enforces tenant boundary (no ambiguous fallback) and PII minimization.
 */

import { SourceAdapter } from './SourceAdapter';
import type { SemanticIngestionEnvelope, SourceAuthorityClass } from './types';

export class AtlasPeopleAdapter extends SourceAdapter {
  readonly sourceName = 'ATLAS_PEOPLE';
  readonly authorityClass: SourceAuthorityClass = 'UNVERIFIED';

  public async transformRecord(
    record: any,
    tenantId: string
  ): Promise<SemanticIngestionEnvelope | null> {
    if (!record || !record.person_id) return null;
    if (!tenantId) throw new Error('TENANT_ID_REQUIRED: Tenant ID must be provided.');

    // Strict tenant verification: record must belong to the target tenant
    if (record.tenant_id && record.tenant_id !== tenantId) {
      throw new Error(`TENANT_MISMATCH: Record tenant '${record.tenant_id}' does not match job tenant '${tenantId}'.`);
    }

    const rawName = this.sanitizeText(record.full_name);
    if (!rawName || rawName.length === 0 || rawName.toLowerCase() === 'anonymous person') {
      return null; // Skip empty or anonymous records
    }

    const observedAt = record.created_at || new Date().toISOString();

    const envelope: SemanticIngestionEnvelope = {
      source_name: this.sourceName,
      source_record_id: String(record.person_id),
      tenant_id: tenantId,
      observed_at: observedAt,
      authority_class: this.authorityClass,
      entity_candidates: [
        {
          source_entity_key: 'person:primary',
          candidate: {
            source_name: this.sourceName,
            source_record_id: String(record.person_id),
            source_entity_key: 'person:primary',
            entity_type: 'PERSON',
            raw_name: rawName,
            observed_at: observedAt
          }
        }
      ],
      claim_candidates: [],
      relationship_candidates: [],
      metadata: {
        lifecycle_stage: record.lifecycle_stage,
        status: record.status
      }
    };

    // If explicit role is present, extract HAS_ROLE as CLAIM (unverified external)
    if (record.role || record.attributes?.role) {
      const roleText = this.sanitizeText(record.role || record.attributes.role);
      if (roleText && !this.hasPlaintextPii(roleText)) {
        envelope.claim_candidates.push({
          source_entity_key: 'person:primary',
          predicate_code: 'HAS_ROLE',
          value_type: 'TEXT',
          object_value: roleText,
          confidence: 0.85,
          observed_at: observedAt
        });
      }
    }

    return envelope;
  }
}
