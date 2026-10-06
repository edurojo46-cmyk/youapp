import { SupabaseClient } from '@supabase/supabase-js';
import * as crypto from 'crypto';
import { IngestOutcomeEventParams, IngestOutcomeResult } from './types';

/**
 * OutcomeLedgerService
 *
 * The DB is the CANONICAL FINGERPRINT AUTHORITY.
 * This service does NOT submit a fingerprint to the DB.
 * Instead it passes semantic inputs (source_event_id, provider_message_id, etc.)
 * and the DB-side ingest_outcome_event function computes the authoritative fingerprint
 * using the resolved source policy's identity scope.
 *
 * TypeScript helpers here are used for:
 * - Testing/preview only (not submitted as authoritative)
 * - payload hashing (for integrity, not dedup)
 */
export class OutcomeLedgerService {
    constructor(private supabase: SupabaseClient) {}

    /**
     * Generates a payload hash for integrity without storing raw payload.
     * Uses canonical key sorting for determinism.
     */
    public generatePayloadHash(payload: Record<string, any>): string {
        const canonicalString = JSON.stringify(payload, Object.keys(payload).sort());
        return crypto.createHash('sha256').update(canonicalString).digest('hex');
    }

    /**
     * Preview-only fingerprint calculation — mirrors DB logic for testing/diagnostics.
     * This value is NEVER submitted to the DB as authoritative.
     * 
     * @param scope - matches source_event_identity_scope in the policy
     */
    public previewFingerprint(
        tenant_id: string,
        source_system: string,
        scope: 'GLOBAL_EVENT_ID' | 'MESSAGE_PLUS_EVENT_TYPE' | 'OBJECT_PLUS_EVENT_TYPE' | 'CANONICAL_FIELDS',
        params: {
            source_event_id?: string;
            provider_message_id?: string;
            object_canonical_ref?: string;
            canonical_fields?: Record<string, any>;
            event_type?: string;
        }
    ): string {
        let input: string;

        switch (scope) {
            case 'GLOBAL_EVENT_ID':
                input = `${tenant_id}|${source_system}|${params.source_event_id}`;
                break;
            case 'MESSAGE_PLUS_EVENT_TYPE':
                input = `${tenant_id}|${source_system}|${params.provider_message_id}|${params.event_type}`;
                break;
            case 'OBJECT_PLUS_EVENT_TYPE':
                input = `${tenant_id}|${source_system}|${params.object_canonical_ref}|${params.event_type}`;
                break;
            case 'CANONICAL_FIELDS': {
                const sortedFields = params.canonical_fields
                    ? Object.entries(params.canonical_fields)
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([k, v]) => `${k}:${v}`)
                        .join(',')
                    : '';
                input = `${tenant_id}|${source_system}|${params.event_type}|${sortedFields}`;
                break;
            }
        }

        return crypto.createHash('sha256').update(input!).digest('hex');
    }

    /**
     * Ingests an outcome event through the controlled DB boundary.
     * The DB computes the canonical fingerprint — not the caller.
     */
    async ingestEvent(params: IngestOutcomeEventParams): Promise<IngestOutcomeResult> {
        const { data, error } = await this.supabase.rpc('ingest_outcome_event', {
            p_tenant_id: params.tenant_id,
            p_source_system: params.source_system,
            p_event_type: params.event_type,
            p_occurred_at: params.occurred_at,
            p_business_domain: params.business_domain,
            p_event_class: params.event_class,
            // Semantic fields for fingerprint (DB decides which to use based on policy scope)
            p_source_event_id: params.source_event_id || null,
            p_provider_message_id: params.provider_message_id || null,
            p_object_canonical_ref: params.object_canonical_ref || null,
            p_canonical_fields: params.canonical_fields || null,
            // Payload integrity
            p_payload_hash: params.payload_hash || null,
            p_sanitized_metadata: params.sanitized_metadata || null,
            // Optional actor
            p_subject_type: params.subject_type || null,
            p_subject_id: params.subject_id || null,
            // Optional commercial object
            p_object_type: params.object_type || null,
            p_object_id: params.object_id || null,
            // Optional Atlas context links
            p_logical_execution_identity: params.logical_execution_identity || null,
            p_attempt_id: params.attempt_id || null,
            p_routing_id: params.routing_id || null,
            p_nba_id: params.nba_id || null,
            // Derived provenance
            p_derivation_method: params.derivation_method || null,
            p_derivation_version: params.derivation_version || null,
            // Relationships
            p_supersedes_event_id: params.supersedes_event_id || null,
            p_reverses_event_id: params.reverses_event_id || null,
            p_related_event_id: params.related_event_id || null,
        });

        if (error) {
            throw new Error(`Failed to ingest outcome event: ${error.message}`);
        }

        return data as IngestOutcomeResult;
    }
}
