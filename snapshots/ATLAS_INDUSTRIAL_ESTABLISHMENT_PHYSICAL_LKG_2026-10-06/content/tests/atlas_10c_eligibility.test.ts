import { describe, it, expect, beforeEach, vi, Mocked } from 'vitest';
import { 
    ChannelEligibilityEngine, 
    SubjectType, 
    ActionType, 
    UpstreamDecisionAuthority,
    IdentifierRepository,
    SuppressionRepository,
    ComplianceRepository,
    PolicyRegistry,
    CapabilityRegistry,
    PermissionRegistry,
    PolicyRecord,
    CapabilityRecord,
    PermissionRecord
} from '../src/social/ChannelEligibilityEngine';

describe('ChannelEligibilityEngine', () => {
    
    // Mocks
    const mockUpstream: Mocked<UpstreamDecisionAuthority> = { getDecision: vi.fn() };
    const mockIdentifier: Mocked<IdentifierRepository> = { hasIdentifier: vi.fn() };
    const mockSuppression: Mocked<SuppressionRepository> = { isSuppressed: vi.fn() };
    const mockCompliance: Mocked<ComplianceRepository> = { isAllowed: vi.fn() };
    const mockPolicy: Mocked<PolicyRegistry> = { getPolicy: vi.fn() };
    const mockCapability: Mocked<CapabilityRegistry> = { getCapability: vi.fn() };
    const mockPermission: Mocked<PermissionRegistry> = { getPermission: vi.fn() };

    let engine: ChannelEligibilityEngine;

    beforeEach(() => {
        vi.resetAllMocks();
        engine = new ChannelEligibilityEngine(
            mockUpstream,
            mockIdentifier,
            mockSuppression,
            mockCompliance,
            mockPolicy,
            mockCapability,
            mockPermission
        );
        
        // Defaults to pass all gates
        mockUpstream.getDecision.mockResolvedValue('PROCEED');
        mockIdentifier.hasIdentifier.mockResolvedValue(true);
        mockSuppression.isSuppressed.mockResolvedValue(false);
        mockCompliance.isAllowed.mockResolvedValue(true);
        mockPolicy.getPolicy.mockResolvedValue({
            policy_version: 'v1',
            effective_until: null,
            requires_identifier: true,
            requires_consent: false,
            requires_prior_interaction: false,
            requires_connected_account: true,
            api_supported: true
        });
        mockCapability.getCapability.mockResolvedValue({
            enabled: true,
            write_supported: true,
            health_status: 'HEALTHY',
            capability_version: 'cap_v1'
        });
    });

    it('1. email verified + allowed → ELIGIBLE', async () => {
        const result = await engine.evaluate('subj1', 'PERSON', 'EMAIL', 'EMAIL_SEND');
        expect(result.eligibility_status).toBe('ELIGIBLE');
    });

    it('2. email suppressed → INELIGIBLE', async () => {
        mockSuppression.isSuppressed.mockResolvedValue(true);
        const result = await engine.evaluate('subj1', 'PERSON', 'EMAIL', 'EMAIL_SEND');
        expect(result.eligibility_status).toBe('INELIGIBLE');
        expect(result.reason_codes).toContain('SUPPRESSED');
    });

    it('3. WhatsApp identifier but no permission → CONSENT_REQUIRED', async () => {
        mockPolicy.getPolicy.mockResolvedValueOnce({
            policy_version: 'v1',
            effective_until: null,
            requires_identifier: true,
            requires_consent: true, // Needs consent
            requires_prior_interaction: false,
            requires_connected_account: true,
            api_supported: true
        });
        mockPermission.getPermission.mockResolvedValue(null); // No permission
        const result = await engine.evaluate('subj1', 'PERSON', 'WHATSAPP', 'WHATSAPP_MARKETING_MESSAGE');
        expect(result.eligibility_status).toBe('CONSENT_REQUIRED');
        expect(result.reason_codes).toContain('NO_CONSENT');
    });

    it('4. Instagram profile but no eligible DM context (prior interaction) → INELIGIBLE / CONSENT_REQUIRED', async () => {
        mockPolicy.getPolicy.mockResolvedValueOnce({
            policy_version: 'v1',
            effective_until: null,
            requires_identifier: true,
            requires_consent: false,
            requires_prior_interaction: true,
            requires_connected_account: true,
            api_supported: true
        });
        mockPermission.getPermission.mockResolvedValue(null);
        const result = await engine.evaluate('subj1', 'PERSON', 'INSTAGRAM', 'INSTAGRAM_DM');
        expect(result.eligibility_status).toBe('CONSENT_REQUIRED');
    });

    it('5. unknown platform policy → UNKNOWN', async () => {
        mockPolicy.getPolicy.mockResolvedValue(null);
        const result = await engine.evaluate('subj1', 'PERSON', 'SOME_PLATFORM', 'EMAIL_SEND');
        expect(result.eligibility_status).toBe('UNKNOWN');
        expect(result.reason_codes).toContain('POLICY_NOT_FOUND');
    });

    it('6. disconnected platform account → INELIGIBLE / capability missing', async () => {
        mockCapability.getCapability.mockResolvedValue(null);
        const result = await engine.evaluate('subj1', 'PERSON', 'YOUTUBE', 'YOUTUBE_COMMENT');
        expect(result.eligibility_status).toBe('INELIGIBLE');
        expect(result.reason_codes).toContain('CAPABILITY_MISSING_OR_UNHEALTHY');
    });

    it('7. stale permission → CONSENT_REQUIRED / UNKNOWN', async () => {
        mockPolicy.getPolicy.mockResolvedValueOnce({
            policy_version: 'v1',
            effective_until: null,
            requires_identifier: true,
            requires_consent: true,
            requires_prior_interaction: false,
            requires_connected_account: true,
            api_supported: true
        });
        mockPermission.getPermission.mockResolvedValue({
            permission_id: 'p1',
            permission_status: 'GRANTED',
            permission_basis: 'EXPLICIT_CONSENT',
            valid_until: new Date(Date.now() - 10000) // Expired
        });
        const result = await engine.evaluate('subj1', 'PERSON', 'WHATSAPP', 'WHATSAPP_MARKETING_MESSAGE');
        expect(result.eligibility_status).toBe('CONSENT_REQUIRED');
        expect(result.reason_codes).toContain('PERMISSION_EXPIRED');
    });

    it('8. current permission → eligible if all other gates pass', async () => {
        mockPolicy.getPolicy.mockResolvedValueOnce({
            policy_version: 'v1',
            effective_until: null,
            requires_identifier: true,
            requires_consent: true,
            requires_prior_interaction: false,
            requires_connected_account: true,
            api_supported: true
        });
        mockPermission.getPermission.mockResolvedValue({
            permission_id: 'p1',
            permission_status: 'GRANTED',
            permission_basis: 'EXPLICIT_CONSENT',
            valid_until: new Date(Date.now() + 100000)
        });
        const result = await engine.evaluate('subj1', 'COMPANY', 'WHATSAPP', 'WHATSAPP_MARKETING_MESSAGE');
        expect(result.eligibility_status).toBe('ELIGIBLE');
    });

    it('9. compliance blocked → INELIGIBLE', async () => {
        mockCompliance.isAllowed.mockResolvedValue(false);
        const result = await engine.evaluate('subj1', 'PERSON', 'EMAIL', 'EMAIL_SEND');
        expect(result.eligibility_status).toBe('INELIGIBLE');
        expect(result.reason_codes).toContain('COMPLIANCE_BLOCKED');
    });

    it('10. upstream 9B DO_NOT_CONTACT → INELIGIBLE', async () => {
        mockUpstream.getDecision.mockResolvedValue('DO_NOT_CONTACT');
        const result = await engine.evaluate('subj1', 'COMPANY', 'EMAIL', 'EMAIL_SEND');
        expect(result.eligibility_status).toBe('INELIGIBLE');
        expect(result.reason_codes).toContain('UPSTREAM_DECISION_NOT_ALLOWED');
    });

    it('11. upstream REVIEW_REQUIRED → REVIEW_REQUIRED', async () => {
        mockUpstream.getDecision.mockResolvedValue('REVIEW_REQUIRED');
        const result = await engine.evaluate('subj1', 'PERSON', 'EMAIL', 'EMAIL_SEND');
        expect(result.eligibility_status).toBe('REVIEW_REQUIRED');
        expect(result.reason_codes).toContain('UPSTREAM_REVIEW_REQUIRED');
    });

    it('12. unresolved person identity → REVIEW_REQUIRED (UNKNOWN upstream decision)', async () => {
        mockUpstream.getDecision.mockResolvedValue('UNKNOWN'); // Since they are unresolved
        const result = await engine.evaluate('subj1', 'PERSON', 'EMAIL', 'EMAIL_SEND');
        expect(result.eligibility_status).toBe('REVIEW_REQUIRED');
        expect(result.reason_codes).toContain('UPSTREAM_DECISION_UNKNOWN');
    });

    it('13. suppressed after previous eligibility → reevaluation becomes INELIGIBLE', async () => {
        const result1 = await engine.evaluate('subj1', 'PERSON', 'EMAIL', 'EMAIL_SEND');
        expect(result1.eligibility_status).toBe('ELIGIBLE');
        
        mockSuppression.isSuppressed.mockResolvedValue(true);
        const result2 = await engine.evaluate('subj1', 'PERSON', 'EMAIL', 'EMAIL_SEND');
        expect(result2.eligibility_status).toBe('INELIGIBLE');
    });

    it('14. capability removed → current eligibility invalidated', async () => {
        mockCapability.getCapability.mockResolvedValueOnce({
            enabled: false, // Disabled
            write_supported: true,
            health_status: 'HEALTHY',
            capability_version: 'v2'
        });
        const result = await engine.evaluate('subj1', 'PERSON', 'X', 'X_DM');
        expect(result.eligibility_status).toBe('INELIGIBLE');
        expect(result.reason_codes).toContain('CAPABILITY_MISSING_OR_UNHEALTHY');
    });

    it('15. policy version changes → old decision remains auditable, new evaluation uses new policy', async () => {
        mockPolicy.getPolicy.mockResolvedValueOnce({
            policy_version: 'v2_strict',
            effective_until: null,
            requires_identifier: true,
            requires_consent: true, // Now requires consent
            requires_prior_interaction: false,
            requires_connected_account: true,
            api_supported: true
        });
        mockPermission.getPermission.mockResolvedValue(null);
        const result = await engine.evaluate('subj1', 'COMPANY', 'LINKEDIN', 'LINKEDIN_COMMENT');
        expect(result.eligibility_status).toBe('CONSENT_REQUIRED');
        expect(result.policy_version).toBe('v2_strict');
    });

    it('16. UNKNOWN never becomes ELIGIBLE', async () => {
        mockPolicy.getPolicy.mockResolvedValue(null); // Unknown policy
        const result = await engine.evaluate('subj1', 'PERSON', 'EMAIL', 'EMAIL_SEND');
        expect(result.eligibility_status).not.toBe('ELIGIBLE');
        expect(result.eligibility_status).toBe('UNKNOWN');
    });

    it('17. API unsupported cannot override hard gate', async () => {
        mockPolicy.getPolicy.mockResolvedValueOnce({
            policy_version: 'v1',
            effective_until: null,
            requires_identifier: true,
            requires_consent: false,
            requires_prior_interaction: false,
            requires_connected_account: true,
            api_supported: false // API not supported
        });
        const result = await engine.evaluate('subj1', 'PERSON', 'INSTAGRAM', 'INSTAGRAM_DM');
        expect(result.eligibility_status).toBe('INELIGIBLE');
        expect(result.reason_codes).toContain('PLATFORM_API_UNSUPPORTED');
    });

    it('18. social signal alone cannot authorize channel without identifier', async () => {
        mockIdentifier.hasIdentifier.mockResolvedValue(false); // No identifier mapped to subject
        const result = await engine.evaluate('subj1', 'COMPANY', 'X', 'X_PUBLIC_REPLY');
        expect(result.eligibility_status).toBe('INELIGIBLE');
        expect(result.reason_codes).toContain('NO_IDENTIFIER');
    });

    it('19. missing B2C decision for PERSON → UNKNOWN/REVIEW_REQUIRED', async () => {
        mockUpstream.getDecision.mockResolvedValue('UNKNOWN');
        const result = await engine.evaluate('subj1', 'PERSON', 'EMAIL', 'EMAIL_SEND');
        expect(result.eligibility_status).toBe('REVIEW_REQUIRED'); // Or UNKNOWN
    });

    it('20. deterministic rerun same evidence/policy → same result', async () => {
        const result1 = await engine.evaluate('subj1', 'COMPANY', 'EMAIL', 'EMAIL_SEND');
        const result2 = await engine.evaluate('subj1', 'COMPANY', 'EMAIL', 'EMAIL_SEND');
        expect(result1.eligibility_status).toBe(result2.eligibility_status);
        expect(result1.policy_version).toBe(result2.policy_version);
    });

    it('21. expired policy → REVIEW_REQUIRED', async () => {
        mockPolicy.getPolicy.mockResolvedValueOnce({
            policy_version: 'v1_old',
            effective_until: new Date(Date.now() - 10000), // Expired
            requires_identifier: true,
            requires_consent: false,
            requires_prior_interaction: false,
            requires_connected_account: true,
            api_supported: true
        });
        const result = await engine.evaluate('subj1', 'COMPANY', 'YOUTUBE', 'YOUTUBE_COMMENT');
        expect(result.eligibility_status).toBe('REVIEW_REQUIRED');
        expect(result.reason_codes).toContain('POLICY_EXPIRED');
    });
});
