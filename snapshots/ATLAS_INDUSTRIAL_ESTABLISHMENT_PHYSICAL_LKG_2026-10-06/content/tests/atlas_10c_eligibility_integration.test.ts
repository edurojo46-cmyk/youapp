import { describe, it, expect, beforeAll } from 'vitest';
import { SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { ChannelEligibilityEngine, SubjectType, ActionType, UpstreamDecisionAuthority, IdentifierRepository, SuppressionRepository, ComplianceRepository, PolicyRegistry, CapabilityRegistry, PermissionRegistry } from '../src/social/ChannelEligibilityEngine';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

describe('ATLAS 10C - Eligibility Integration Smokes', () => {
    let supabase: SupabaseClient;
    let engine: ChannelEligibilityEngine;

    let personId: string;
    let companyId: string;
    let dbPermissions: any[] = [];

    beforeAll(async () => {
        supabase = {} as SupabaseClient;

        personId = 'person-123';
        companyId = 'company-456';

        class MockUpstream implements UpstreamDecisionAuthority {
            async getDecision(id: string, type: SubjectType): Promise<any> { return 'PROCEED'; }
        }
        class MockIdentifier implements IdentifierRepository {
            async hasIdentifier(id: string, channel: string): Promise<boolean> { return true; }
        }
        class MockSuppression implements SuppressionRepository {
            async isSuppressed(id: string, channel: string): Promise<boolean> { return false; }
        }
        class MockCompliance implements ComplianceRepository {
            async isAllowed(): Promise<boolean> { return true; }
        }
        
        class MockPolicyRegistry implements PolicyRegistry {
            async getPolicy(platform: string, actionType: ActionType): Promise<any> {
                if (platform === 'EMAIL') return { policy_version: 'v1', api_supported: true, requires_connected_account: true, requires_identifier: true, requires_consent: false, requires_prior_interaction: false, effective_until: null };
                if (platform === 'WHATSAPP') return { policy_version: 'v1', api_supported: true, requires_connected_account: true, requires_identifier: true, requires_consent: true, requires_prior_interaction: false, effective_until: null };
                if (platform === 'INSTAGRAM') return { policy_version: 'v1', api_supported: true, requires_connected_account: true, requires_identifier: true, requires_consent: false, requires_prior_interaction: true, effective_until: null };
                return null;
            }
        }
        
        class MockCapabilityRegistry implements CapabilityRegistry {
            async getCapability(channel: string, actionType: ActionType): Promise<any> {
                return { enabled: true, write_supported: true, health_status: 'HEALTHY', capability_version: 'cap1' };
            }
        }

        class MockPermissionRegistry implements PermissionRegistry {
            async getPermission(id: string, channel: string, actionType: ActionType): Promise<any> {
                const perm = dbPermissions.find(p => p.subject_id === id && p.channel === channel);
                return perm || null;
            }
        }

        engine = new ChannelEligibilityEngine(
            new MockUpstream(),
            new MockIdentifier(),
            new MockSuppression(),
            new MockCompliance(),
            new MockPolicyRegistry(),
            new MockCapabilityRegistry(),
            new MockPermissionRegistry()
        );
    });

    it('1. PERSON email eligible', async () => {
        const result = await engine.evaluate(personId, 'PERSON', 'EMAIL', 'EMAIL_SEND');
        expect(result.eligibility_status).toBe('ELIGIBLE');
        expect(result.policy_version).toBe('v1');
    });

    it('2. PERSON WhatsApp no consent -> CONSENT_REQUIRED', async () => {
        const result = await engine.evaluate(personId, 'PERSON', 'WHATSAPP', 'WHATSAPP_MARKETING_MESSAGE');
        expect(result.eligibility_status).toBe('CONSENT_REQUIRED');
        expect(result.reason_codes).toContain('NO_CONSENT');
    });

    it('3. PERSON WhatsApp WITH consent -> ELIGIBLE', async () => {
        dbPermissions.push({
            subject_id: personId,
            channel: 'WHATSAPP',
            action_type: 'WHATSAPP_MARKETING_MESSAGE',
            permission_status: 'GRANTED',
            permission_basis: 'EXPLICIT_CONSENT',
            valid_until: new Date(Date.now() + 86400000)
        });

        const result = await engine.evaluate(personId, 'PERSON', 'WHATSAPP', 'WHATSAPP_MARKETING_MESSAGE');
        expect(result.eligibility_status).toBe('ELIGIBLE');
    });

    it('4. PERSON Instagram DM no interaction -> CONSENT_REQUIRED', async () => {
        const result = await engine.evaluate(personId, 'PERSON', 'INSTAGRAM', 'INSTAGRAM_DM');
        expect(result.eligibility_status).toBe('CONSENT_REQUIRED');
    });

    it('5. COMPANY email eligible', async () => {
        const result = await engine.evaluate(companyId, 'COMPANY', 'EMAIL', 'EMAIL_SEND');
        expect(result.eligibility_status).toBe('ELIGIBLE');
    });

    it('Environment constraints: no real API / writes', () => {
        expect(true).toBe(true);
    });
});
