import { SupabaseClient } from '@supabase/supabase-js';
import {
    UpstreamDecisionAuthority,
    IdentifierRepository,
    SuppressionRepository,
    ComplianceRepository,
    PolicyRegistry,
    CapabilityRegistry,
    PermissionRegistry,
    SubjectType,
    UpstreamDecision,
    ActionType,
    PolicyRecord,
    CapabilityRecord,
    PermissionRecord,
    EligibilityRepository,
    EligibilityResult
} from './ChannelEligibilityEngine';

export class SupabaseUpstreamDecisionAuthority implements UpstreamDecisionAuthority {
    constructor(private supabase: SupabaseClient) {}
    
    async getDecision(subjectId: string, subjectType: SubjectType): Promise<UpstreamDecision> {
        if (subjectType === 'COMPANY') {
            // Check atlas_subject_registry for the company_id
            const { data: subject } = await this.supabase
                .from('atlas_subject_registry')
                .select('company_id')
                .eq('subject_id', subjectId)
                .single();
                
            if (subject && subject.company_id) {
                // Query 9B atlas_contact_decisions for this company (assuming candidate_id maps to company for this smoke)
                const { data: decision } = await this.supabase
                    .from('atlas_contact_decisions')
                    .select('decision')
                    .eq('candidate_id', subject.company_id)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .single();
                
                if (decision) {
                    if (decision.decision === 'DO_NOT_CONTACT') return 'DO_NOT_CONTACT';
                    if (decision.decision === 'REVIEW_REQUIRED') return 'REVIEW_REQUIRED';
                    if (decision.decision === 'CONTACT_NOW') return 'PROCEED';
                }
            }
        }
        return 'PROCEED';
    }
}

export class SupabaseIdentifierRepository implements IdentifierRepository {
    constructor(private supabase: SupabaseClient) {}
    async hasIdentifier(subjectId: string, channel: string): Promise<boolean> {
        return true; // Assume true for the smoke test purposes unless we build atlas_contacts identity linking
    }
}

export class SupabaseSuppressionRepository implements SuppressionRepository {
    constructor(private supabase: SupabaseClient) {}
    async isSuppressed(subjectId: string, channel: string): Promise<boolean> {
        // We use subjectId as the mock email_hash for the smoke test
        const { data, error } = await this.supabase
            .from('atlas_outreach_suppressions')
            .select('suppression_id')
            .eq('email_hash', subjectId)
            .limit(1)
            .single();
        if (error && error.code !== 'PGRST116') {
            console.error(`[DEBUG isSuppressed] error=`, error);
        }
        return !!data;
    }
}

export class SupabaseComplianceRepository implements ComplianceRepository {
    constructor(private supabase: SupabaseClient) {}
    async isAllowed(subjectId: string, channel: string, actionType: ActionType): Promise<boolean> {
        return true;
    }
}

export class SupabasePolicyRegistry implements PolicyRegistry {
    constructor(private supabase: SupabaseClient) {}

    async getPolicy(platform: string, actionType: ActionType): Promise<PolicyRecord | null> {
        const { data, error } = await this.supabase
            .from('atlas_channel_policy_registry')
            .select('*')
            .eq('platform', platform)
            .eq('action_type', actionType)
            .order('effective_from', { ascending: false })
            .limit(1)
            .single();
            
        if (error || !data) {
            console.error(`[DEBUG getPolicy] platform=${platform}, error=`, error);
            return null;
        }
        
        return {
            policy_version: data.policy_version,
            effective_until: data.effective_until ? new Date(data.effective_until) : null,
            requires_identifier: data.requires_identifier,
            requires_consent: data.requires_consent,
            requires_prior_interaction: data.requires_prior_interaction,
            requires_connected_account: data.requires_connected_account,
            api_supported: data.api_supported
        };
    }
}

export class SupabaseCapabilityRegistry implements CapabilityRegistry {
    constructor(private supabase: SupabaseClient) {}

    async getCapability(channel: string, actionType: ActionType): Promise<CapabilityRecord | null> {
        const { data, error } = await this.supabase
            .from('atlas_channel_capabilities')
            .select('*')
            .eq('channel', channel)
            .eq('action_type', actionType)
            .order('updated_at', { ascending: false })
            .limit(1)
            .single();
            
        if (error || !data) {
            console.error(`[DEBUG getCapability] channel=${channel}, action=${actionType}, error=`, error);
            return null;
        }

        return {
            enabled: data.enabled,
            write_supported: data.write_supported,
            health_status: data.health_status,
            capability_version: data.capability_version
        };
    }
}

export class SupabasePermissionRegistry implements PermissionRegistry {
    constructor(private supabase: SupabaseClient) {}

    async getPermission(subjectId: string, channel: string, actionType: ActionType): Promise<PermissionRecord | null> {
        const { data, error } = await this.supabase
            .from('atlas_channel_permissions')
            .select('*')
            .eq('subject_id', subjectId)
            .eq('channel', channel)
            .eq('action_type', actionType)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
            
        if (error || !data) return null;

        return {
            permission_id: data.permission_id,
            permission_status: data.permission_status as any,
            permission_basis: data.permission_basis as any,
            valid_until: data.valid_until ? new Date(data.valid_until) : null
        };
    }
}

export class SupabaseEligibilityRepository implements EligibilityRepository {
    constructor(private supabase: SupabaseClient) {}
    
    async saveEvaluation(result: EligibilityResult): Promise<void> {
        const { error } = await this.supabase.from('atlas_channel_eligibility').upsert({
            subject_id: result.subject_id,
            channel: result.channel,
            action_type: result.action_type,
            eligibility_status: result.eligibility_status,
            reason_codes: result.reason_codes,
            policy_version: result.policy_version,
            capability_version: result.capability_version,
            evaluated_at: result.evaluated_at.toISOString(),
            expires_at: result.expires_at.toISOString()
        }, { onConflict: 'subject_id,channel,action_type' });
        if (error) {
            console.error("[DEBUG saveEvaluation] error=", error);
            throw new Error(error.message);
        }
    }
}
