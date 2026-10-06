import { SupabaseClient } from '@supabase/supabase-js';

export interface BatchProjectionResult {
    success: boolean;
    projected: number;
    skipped: number;
    errors: number;
    details: any[];
    reason?: string;
}

export interface ProjectionResult {
    success: boolean;
    status?: string;
    event_id?: string;
    reason?: string;
    event_type?: string;
}

/**
 * 10H-A2: 10F Outcome Bridge
 * 
 * Thin orchestrator layer that invokes authoritative DB-side projection logic.
 * The DB validates source policy, fingerprinting, semantics, and tenant isolation.
 * The TypeScript client only identifies WHICH fact to project.
 */
export class TenFOutcomeBridge {
    constructor(private readonly supabase: SupabaseClient) {}

    /**
     * Projects a specific 10F execution attempt (e.g. ACCEPTED -> PROVIDER_ACCEPTED) to the 10H ledger.
     */
    async projectAttempt(attemptId: string): Promise<ProjectionResult> {
        const { data, error } = await this.supabase.rpc('project_10f_attempt_to_10h', {
            p_attempt_id: attemptId
        });
        
        if (error) {
            throw error;
        }
        return data as ProjectionResult;
    }

    /**
     * Projects a specific 10F outcome (e.g. DELIVERY -> DELIVERED) to the 10H ledger.
     */
    async projectOutcome(outcomeId: string): Promise<ProjectionResult> {
        const { data, error } = await this.supabase.rpc('project_10f_outcome_to_10h', {
            p_outcome_id: outcomeId
        });
        
        if (error) {
            throw error;
        }
        return data as ProjectionResult;
    }

    /**
     * Replays all 10F execution facts for a given tenant.
     * Idempotent DB projection guarantees no duplication.
     */
    async projectAllForTenant(tenantId: string, limit: number = 1000): Promise<BatchProjectionResult> {
        const { data, error } = await this.supabase.rpc('project_10f_events_to_10h', {
            p_tenant_id: tenantId,
            p_limit: limit
        });

        if (error) {
            throw error;
        }
        return data as BatchProjectionResult;
    }
}
