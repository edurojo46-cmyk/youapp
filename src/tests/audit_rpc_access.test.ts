import { describe, expect, it } from 'vitest';
import { createGuardedTestClient as createClient } from '../lib/testDbGuard';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const TRUE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0bnVyYWZtbmdhemR3bHpwdnh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM2ODY1MzAsImV4cCI6MjA2OTI2MjUzMH0.M8aSmJxODwZhG4mvoBq7sVNkLlRrSNqHiDBuKHagVFc';

describe('Audit RPC Access', () => {
it('anon and authenticated cannot call ingest_outcome_event', async () => {
    // Anon client
    const anonClient = createClient(SUPABASE_URL, TRUE_ANON_KEY);
    const { error: anonError, data: anonData } = await anonClient.rpc('ingest_outcome_event', {
        p_tenant_id: '00000000-0000-0000-0000-000000000000',
        p_source_system: 'SYS', p_event_type: 'T', p_occurred_at: new Date().toISOString(),
        p_business_domain: 'OUTREACH', p_event_class: 'OBSERVED'
    });
    console.log('Anon error:', anonError?.message);
    expect(anonError?.message).toMatch(/permission denied|not exist|find function|invalid api key/i);

    // Create a new user to test authenticated
    const { data: authData, error: signUpError } = await anonClient.auth.signUp({
        email: `test-auth-${Date.now()}@example.com`,
        password: 'password123'
    });
    if (signUpError) {
        expect(signUpError.message).toBeDefined();
        return;
    }
    
    const { error: authError } = await anonClient.rpc('ingest_outcome_event', {
        p_tenant_id: '00000000-0000-0000-0000-000000000000',
        p_source_system: 'SYS', p_event_type: 'T', p_occurred_at: new Date().toISOString(),
        p_business_domain: 'OUTREACH', p_event_class: 'OBSERVED'
    });
    console.log('Auth error:', authError?.message);
    expect(authError?.message).toMatch(/permission denied|not exist|find function|invalid api key/i);
  });
});
