/**
 * Atlas Semantic Intelligence — Profiles Adapter V1 (Quality Corrected)
 * Transforms platform profiles rows into Person canonical entity candidates.
 * Enforces strict tenant resolution (fails closed if tenant unresolved) and PII minimization.
 */

import { SourceAdapter } from './SourceAdapter';
import type { SemanticIngestionEnvelope, SourceAuthorityClass } from './types';

export class ProfilesAdapter extends SourceAdapter {
  readonly sourceName = 'PLATFORM_PROFILES';
  readonly authorityClass: SourceAuthorityClass = 'USER_GENERATED';

  public async transformRecord(
    record: any,
    tenantId: string
  ): Promise<SemanticIngestionEnvelope | null> {
    if (!record || !record.id) return null;
    if (!tenantId) throw new Error('TENANT_ID_REQUIRED: Tenant ID must be provided for ProfilesAdapter.');

    // If record explicitly carries tenant_id, verify match; otherwise require explicit tenant scope
    if (record.tenant_id && record.tenant_id !== tenantId) {
      throw new Error(`TENANT_MISMATCH: Record tenant '${record.tenant_id}' does not match job tenant '${tenantId}'.`);
    }

    const username = this.sanitizeText(record.username || record.full_name);
    if (!username || username.length === 0) return null;

    const observedAt = record.created_at || new Date().toISOString();

    const envelope: SemanticIngestionEnvelope = {
      source_name: this.sourceName,
      source_record_id: String(record.id),
      tenant_id: tenantId,
      observed_at: observedAt,
      authority_class: this.authorityClass,
      entity_candidates: [
        {
          source_entity_key: 'person:primary',
          candidate: {
            source_name: this.sourceName,
            source_record_id: String(record.id),
            source_entity_key: 'person:primary',
            entity_type: 'PERSON',
            raw_name: username,
            observed_at: observedAt
          }
        }
      ],
      claim_candidates: [],
      relationship_candidates: [],
      metadata: {
        raw_username: username
      }
    };

    if (record.role) {
      const roleText = this.sanitizeText(record.role);
      if (roleText && !this.hasPlaintextPii(roleText)) {
        envelope.claim_candidates.push({
          source_entity_key: 'person:primary',
          predicate_code: 'HAS_ROLE',
          value_type: 'TEXT',
          object_value: roleText,
          confidence: 0.8,
          observed_at: observedAt
        });
      }
    }

    return envelope;
  }
}
