import { describe, it, expect, beforeAll } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

describe('ATLAS 10A - Social Identity & Account Layer Guardrails', () => {
    let supabase: SupabaseClient;
    const testTenant = crypto.randomUUID();

    beforeAll(() => {
        const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
        
        if (!supabaseUrl || !supabaseKey) {
            throw new Error("Missing Supabase credentials");
        }
        
        supabase = createClient(supabaseUrl, supabaseKey);
    });

    it('1. Enforces write_enabled = false constraint at the database level', async () => {
        const extId = crypto.randomUUID();
        const { error } = await supabase.from('atlas_social_accounts').insert({
            tenant_id: testTenant,
            platform: 'YOUTUBE',
            external_account_id: extId,
            credential_ref: 'vault:test',
            write_enabled: true
        });

        expect(error).toBeDefined();
        expect(error?.message).toMatch(/chk_social_v1_read_only/);
    });

    it('2. Enforces uniqueness of owned social accounts (tenant, platform, external_id)', async () => {
        const extId = crypto.randomUUID();
        
        // First insert should succeed
        const res1 = await supabase.from('atlas_social_accounts').insert({
            tenant_id: testTenant,
            platform: 'X',
            external_account_id: extId,
            credential_ref: 'vault:test'
        });
        expect(res1.error).toBeNull();

        // Second insert with exact same combo should fail
        const res2 = await supabase.from('atlas_social_accounts').insert({
            tenant_id: testTenant,
            platform: 'X',
            external_account_id: extId,
            credential_ref: 'vault:test2'
        });
        
        expect(res2.error).toBeDefined();
        expect(res2.error?.code).toBe('23505'); // unique_violation
    });

    it('3. Enforces uniqueness of observed external profiles (platform, profile_id)', async () => {
        const profileId = `channel_${crypto.randomUUID()}`;
        
        const res1 = await supabase.from('atlas_social_profiles').insert({
            platform: 'YOUTUBE',
            platform_profile_id: profileId,
            display_name: 'Test Channel'
        });
        expect(res1.error).toBeNull();

        const res2 = await supabase.from('atlas_social_profiles').insert({
            platform: 'YOUTUBE',
            platform_profile_id: profileId,
            display_name: 'Duplicate Channel'
        });
        
        expect(res2.error).toBeDefined();
        expect(res2.error?.code).toBe('23505');
    });

    it('4. Enforces uniqueness of observed content (platform, content_id)', async () => {
        const contentId = `tweet_${crypto.randomUUID()}`;
        
        const res1 = await supabase.from('atlas_social_content').insert({
            platform: 'X',
            content_id: contentId,
            content_hash: 'hash1',
            ingest_method: 'timeline'
        });
        expect(res1.error).toBeNull();

        const res2 = await supabase.from('atlas_social_content').insert({
            platform: 'X',
            content_id: contentId,
            content_hash: 'hash2',
            ingest_method: 'search'
        });
        
        expect(res2.error).toBeDefined();
        expect(res2.error?.code).toBe('23505');
    });
});
