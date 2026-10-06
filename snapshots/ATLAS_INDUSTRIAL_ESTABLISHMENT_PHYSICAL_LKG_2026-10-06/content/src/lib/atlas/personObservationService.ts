import { SupabaseClient } from '@supabase/supabase-js';
import * as crypto from 'crypto';

export type CandidateSourceType = 
    | 'WEB_HARVEST' 
    | 'API_CONNECTOR' 
    | 'MANUAL_INGEST' 
    | 'SOCIAL_MENTION' 
    | 'SYSTEM_BRIDGE';

export type UseAuthority = 
    | 'DISCOVERY_ONLY' 
    | 'OBSERVATION_ALLOWED' 
    | 'CANONICAL_ALLOWED';

export interface CandidateIdentifierInput {
    identifier_type: string;
    normalized_value_hash: string;
    display_value?: string;
    safe_value?: string;
    verification_status?: string;
}

export interface IngestFromUiInput {
    candidate_identity_key: string;
    source_type: CandidateSourceType;
    source_ref: string;
    source_authority: string;
    extracted_name?: string;
    payload?: Record<string, any>;
    identifiers?: CandidateIdentifierInput[];
}

export interface IngestFromHarvestInput {
    job_id: string;
    lock_token: string;
    candidate_identity_key: string;
    source_ref: string;
    extracted_name?: string;
    payload?: Record<string, any>;
    identifiers?: CandidateIdentifierInput[];
}

export interface PromotionResult {
    status: string;
    candidate_id?: string;
    person_id?: string;
    outcome?: string;
    reason?: string;
    reasons?: string[];
    use_authority?: string;
}

/**
 * Computes a deterministic SHA-256 hex hash of a JSON payload
 * by recursively sorting object keys. Matches 10H-A2 canonical standard.
 */
export function computeCanonicalPayloadHash(payload: any): string {
    function canonicalize(obj: any): any {
        if (obj === null || typeof obj !== 'object') {
            return obj;
        }
        if (Array.isArray(obj)) {
            return obj.map(canonicalize);
        }
        const sortedKeys = Object.keys(obj).sort();
        const result: Record<string, any> = {};
        for (const key of sortedKeys) {
            result[key] = canonicalize(obj[key]);
        }
        return result;
    }

    const canonicalJson = JSON.stringify(canonicalize(payload));
    return crypto.createHash('sha256').update(canonicalJson).digest('hex');
}

/**
 * Service orchestrating Person Observation Lifecycle operations.
 */
export class PersonObservationService {
    constructor(private readonly client: SupabaseClient) {}

    /**
     * Ingests discovery candidate from authenticated UI context.
     */
    async ingestFromUi(input: IngestFromUiInput): Promise<PromotionResult> {
        const { data, error } = await this.client.rpc('ingest_discovery_candidate_from_ui_v1', {
            p_candidate_identity_key: input.candidate_identity_key,
            p_source_type: input.source_type,
            p_source_ref: input.source_ref,
            p_source_authority: input.source_authority,
            p_extracted_name: input.extracted_name || null,
            p_payload: input.payload || {},
            p_identifiers: input.identifiers || []
        });
        if (error) throw error;
        return data as PromotionResult;
    }

    /**
     * Ingests discovery candidate from background harvester worker.
     */
    async ingestFromHarvest(input: IngestFromHarvestInput): Promise<PromotionResult> {
        const { data, error } = await this.client.rpc('ingest_discovery_candidate_from_harvest_v1', {
            p_job_id: input.job_id,
            p_lock_token: input.lock_token,
            p_candidate_identity_key: input.candidate_identity_key,
            p_source_ref: input.source_ref,
            p_extracted_name: input.extracted_name || null,
            p_payload: input.payload || {},
            p_identifiers: input.identifiers || []
        });
        if (error) throw error;
        return data as PromotionResult;
    }

    /**
     * Promotes a candidate from DISCOVERED staging to OBSERVED or attaches to existing person.
     */
    async promoteCandidateToObserved(candidateId: string): Promise<PromotionResult> {
        const { data, error } = await this.client.rpc('promote_candidate_to_observed_v1', {
            p_candidate_id: candidateId
        });
        if (error) throw error;
        return data as PromotionResult;
    }

    /**
     * Promotes an OBSERVED person to CANONICAL stage after validating active policy criteria.
     */
    async promoteObservedToCanonical(personId: string, reasonOverride?: string): Promise<PromotionResult> {
        const { data, error } = await this.client.rpc('promote_observed_to_canonical_v1', {
            p_person_id: personId,
            p_reason_override: reasonOverride || null
        });
        if (error) throw error;
        return data as PromotionResult;
    }

    /**
     * Cleans up expired discovery candidates past retention window.
     */
    async cleanupExpiredCandidates(tenantId?: string): Promise<{ status: string; expired_count: number }> {
        const { data, error } = await this.client.rpc('cleanup_expired_candidates_v1', {
            p_tenant_id: tenantId || null
        });
        if (error) throw error;
        return data as { status: string; expired_count: number };
    }

    /**
     * Sets active lifecycle policy version (service_role only).
     */
    async setActivePolicy(policyVersion: string): Promise<void> {
        const { error } = await this.client.rpc('set_active_lifecycle_policy', {
            p_policy_version: policyVersion
        });
        if (error) throw error;
    }
}
