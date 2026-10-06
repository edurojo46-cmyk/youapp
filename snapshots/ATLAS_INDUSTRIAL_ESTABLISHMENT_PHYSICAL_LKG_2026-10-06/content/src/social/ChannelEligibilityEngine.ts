export type SubjectType = 'PERSON' | 'COMPANY';

export type ActionType = 
    | 'EMAIL_SEND'
    | 'WHATSAPP_MARKETING_MESSAGE'
    | 'WHATSAPP_SERVICE_REPLY'
    | 'INSTAGRAM_DM'
    | 'INSTAGRAM_PUBLIC_REPLY'
    | 'X_DM'
    | 'X_PUBLIC_REPLY'
    | 'YOUTUBE_COMMENT'
    | 'YOUTUBE_LIVE_CHAT'
    | 'LINKEDIN_COMMENT'
    | 'META_AD_AUDIENCE'
    | 'GOOGLE_AD_AUDIENCE';

export type EligibilityStatus = 'ELIGIBLE' | 'INELIGIBLE' | 'CONSENT_REQUIRED' | 'REVIEW_REQUIRED' | 'UNKNOWN';
export type UpstreamDecision = 'PROCEED' | 'REVIEW_REQUIRED' | 'DO_NOT_CONTACT' | 'UNKNOWN';
export type PermissionStatus = 'GRANTED' | 'DENIED' | 'UNKNOWN' | 'EXPIRED';
export type PermissionBasis = 'EXPLICIT_CONSENT' | 'PLATFORM_INITIATED_CONTEXT' | 'FIRST_PARTY_RELATIONSHIP' | 'CONTRACTUAL_BASIS' | 'OTHER_VERIFIED_BASIS' | 'NONE';

export interface UpstreamDecisionAuthority {
    getDecision(subjectId: string, subjectType: SubjectType): Promise<UpstreamDecision>;
}

export interface IdentifierRepository {
    hasIdentifier(subjectId: string, channel: string): Promise<boolean>;
}

export interface SuppressionRepository {
    isSuppressed(subjectId: string, channel: string): Promise<boolean>;
}

export interface ComplianceRepository {
    isAllowed(subjectId: string, channel: string, actionType: ActionType): Promise<boolean>;
}

export interface PolicyRegistry {
    getPolicy(platform: string, actionType: ActionType): Promise<PolicyRecord | null>;
}

export interface CapabilityRegistry {
    getCapability(channel: string, actionType: ActionType): Promise<CapabilityRecord | null>;
}

export interface PermissionRegistry {
    getPermission(subjectId: string, channel: string, actionType: ActionType): Promise<PermissionRecord | null>;
}

export interface PolicyRecord {
    policy_version: string;
    effective_until: Date | null;
    requires_identifier: boolean;
    requires_consent: boolean;
    requires_prior_interaction: boolean;
    requires_connected_account: boolean;
    api_supported: boolean;
}

export interface CapabilityRecord {
    enabled: boolean;
    write_supported: boolean;
    health_status: string;
    capability_version: string;
}

export interface PermissionRecord {
    permission_id: string;
    permission_status: PermissionStatus;
    permission_basis: PermissionBasis;
    valid_until: Date | null;
}

export interface EligibilityResult {
    subject_id: string;
    channel: string;
    action_type: ActionType;
    eligibility_status: EligibilityStatus;
    reason_codes: string[];
    upstream_decision?: UpstreamDecision;
    policy_version?: string;
    capability_version?: string;
    permission_id?: string;
    evaluated_at: Date;
    expires_at: Date;
}

export interface EligibilityRepository {
    saveEvaluation(result: EligibilityResult): Promise<void>;
}

export class ChannelEligibilityEngine {
    constructor(
        private upstreamDecisionAuthority: UpstreamDecisionAuthority,
        private identifierRepo: IdentifierRepository,
        private suppressionRepo: SuppressionRepository,
        private complianceRepo: ComplianceRepository,
        private policyRegistry: PolicyRegistry,
        private capabilityRegistry: CapabilityRegistry,
        private permissionRegistry: PermissionRegistry,
        private eligibilityRepo?: EligibilityRepository
    ) {}

    async evaluate(subjectId: string, subjectType: SubjectType, channel: string, actionType: ActionType): Promise<EligibilityResult> {
        const result = await this._evaluate(subjectId, subjectType, channel, actionType);
        if (this.eligibilityRepo) {
            await this.eligibilityRepo.saveEvaluation(result);
        }
        return result;
    }

    private async _evaluate(subjectId: string, subjectType: SubjectType, channel: string, actionType: ActionType): Promise<EligibilityResult> {
        const result: EligibilityResult = {
            subject_id: subjectId,
            channel: channel,
            action_type: actionType,
            eligibility_status: 'UNKNOWN', // Fail-closed
            reason_codes: [],
            evaluated_at: new Date(),
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000) // Default 24h validity, subject to policy
        };

        // 1. Identity Resolution & Upstream Decision
        const decision = await this.upstreamDecisionAuthority.getDecision(subjectId, subjectType);
        result.upstream_decision = decision;
        
        if (decision === 'UNKNOWN') {
            result.eligibility_status = 'REVIEW_REQUIRED';
            result.reason_codes.push('UPSTREAM_DECISION_UNKNOWN');
            return result;
        }
        if (decision === 'DO_NOT_CONTACT') {
            result.eligibility_status = 'INELIGIBLE';
            result.reason_codes.push('UPSTREAM_DECISION_NOT_ALLOWED');
            return result;
        }

        // 2. Policy Evaluation
        const policy = await this.policyRegistry.getPolicy(channel, actionType);
        if (!policy) {
            result.eligibility_status = 'UNKNOWN';
            result.reason_codes.push('POLICY_NOT_FOUND');
            return result;
        }
        if (policy.effective_until && policy.effective_until < new Date()) {
            result.eligibility_status = 'REVIEW_REQUIRED';
            result.reason_codes.push('POLICY_EXPIRED');
            return result;
        }
        result.policy_version = policy.policy_version;
        if (!policy.api_supported) {
            result.eligibility_status = 'INELIGIBLE';
            result.reason_codes.push('PLATFORM_API_UNSUPPORTED');
            return result;
        }

        // 3. Capability Check
        if (policy.requires_connected_account) {
            const capability = await this.capabilityRegistry.getCapability(channel, actionType);
            if (!capability || !capability.enabled || !capability.write_supported || capability.health_status !== 'HEALTHY') {
                result.eligibility_status = 'INELIGIBLE';
                result.reason_codes.push('CAPABILITY_MISSING_OR_UNHEALTHY');
                return result;
            }
            result.capability_version = capability.capability_version;
        }

        // 4. Identifier Check
        if (policy.requires_identifier) {
            const hasId = await this.identifierRepo.hasIdentifier(subjectId, channel);
            if (!hasId) {
                result.eligibility_status = 'INELIGIBLE';
                result.reason_codes.push('NO_IDENTIFIER');
                return result;
            }
        }

        // 5. Suppression & Compliance
        const isSuppressed = await this.suppressionRepo.isSuppressed(subjectId, channel);
        if (isSuppressed) {
            result.eligibility_status = 'INELIGIBLE';
            result.reason_codes.push('SUPPRESSED');
            return result;
        }

        const isCompliant = await this.complianceRepo.isAllowed(subjectId, channel, actionType);
        if (!isCompliant) {
            result.eligibility_status = 'INELIGIBLE';
            result.reason_codes.push('COMPLIANCE_BLOCKED');
            return result;
        }

        // 6. Permission Check
        if (policy.requires_consent || policy.requires_prior_interaction) {
            const permission = await this.permissionRegistry.getPermission(subjectId, channel, actionType);
            
            if (!permission) {
                result.eligibility_status = 'CONSENT_REQUIRED';
                result.reason_codes.push('NO_CONSENT');
                return result;
            }
            
            result.permission_id = permission.permission_id;

            if (permission.valid_until && permission.valid_until < new Date()) {
                result.eligibility_status = 'CONSENT_REQUIRED';
                result.reason_codes.push('PERMISSION_EXPIRED');
                return result;
            }

            if (permission.permission_status === 'DENIED') {
                result.eligibility_status = 'INELIGIBLE';
                result.reason_codes.push('PERMISSION_DENIED');
                return result;
            }

            if (permission.permission_status === 'UNKNOWN') {
                result.eligibility_status = 'UNKNOWN';
                result.reason_codes.push('PERMISSION_UNKNOWN');
                return result;
            }
        }

        // 7. Final Upstream Gate (REVIEW_REQUIRED overrides ELIGIBLE)
        if (decision === 'REVIEW_REQUIRED') {
            result.eligibility_status = 'REVIEW_REQUIRED';
            result.reason_codes.push('UPSTREAM_REVIEW_REQUIRED');
            return result;
        }

        // If all gates pass, return ELIGIBLE
        result.eligibility_status = 'ELIGIBLE';
        return result;
    }
}
