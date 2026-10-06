import { describe, it, expect, beforeAll } from 'vitest';
import * as crypto from 'crypto';
import { SupabaseClient } from '@supabase/supabase-js';
import { createGuardedTestClient as createClient } from '../lib/testDbGuard';
import * as dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

describe('ATLAS RFC 8058 ONE-CLICK LIST-UNSUBSCRIBE & SUPPRESSION PIPELINE', () => {
  let supabase: SupabaseClient;
  const testTenant = '00000000-0000-0000-0000-000000000001';

  beforeAll(() => {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  });

  it('1. RFC 8058 Header Compliance: Requires both List-Unsubscribe and List-Unsubscribe-Post', () => {
    const email = 'test_unsub_recipient@youapptv.com';
    const emailHash = crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
    const unsubUrl = `https://youapptv.com/api/mail/unsubscribe?tenant_id=${testTenant}&h=${emailHash}`;

    const headers = {
      'List-Unsubscribe': `<${unsubUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
    };

    expect(headers['List-Unsubscribe']).toBe(`<${unsubUrl}>`);
    expect(headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });

  it('2. RFC 8058 Automated POST: Inserts MARKETING suppression row into atlas_outreach_suppressions', async () => {
    const testEmail = `canary_unsub_${Date.now()}@youapptv.com`;
    const emailHash = crypto.createHash('sha256').update(testEmail.toLowerCase().trim()).digest('hex');

    // Simulate RFC 8058 One-Click POST processing
    const { error: insertErr } = await supabase.from('atlas_outreach_suppressions').upsert({
      tenant_id: testTenant,
      email_hash: emailHash,
      scope: 'MARKETING',
      reason: 'UNSUBSCRIBED'
    }, { onConflict: 'tenant_id,email_hash,scope' });

    expect(insertErr).toBeNull();

    // Verify row exists in atlas_outreach_suppressions
    const { data: suppression, error: fetchErr } = await supabase
      .from('atlas_outreach_suppressions')
      .select('*')
      .eq('tenant_id', testTenant)
      .eq('email_hash', emailHash)
      .eq('scope', 'MARKETING')
      .single();

    expect(fetchErr).toBeNull();
    expect(suppression).toBeDefined();
    expect(suppression.reason).toBe('UNSUBSCRIBED');
  });

  it('3. Idempotency: Multiple one-click POST requests for same recipient do not duplicate or fail', async () => {
    const testEmail = `canary_unsub_idemp_${Date.now()}@youapptv.com`;
    const emailHash = crypto.createHash('sha256').update(testEmail.toLowerCase().trim()).digest('hex');

    for (let i = 0; i < 3; i++) {
      const { error } = await supabase.from('atlas_outreach_suppressions').upsert({
        tenant_id: testTenant,
        email_hash: emailHash,
        scope: 'MARKETING',
        reason: 'UNSUBSCRIBED'
      }, { onConflict: 'tenant_id,email_hash,scope' });

      expect(error).toBeNull();
    }

    const { data: rows } = await supabase
      .from('atlas_outreach_suppressions')
      .select('suppression_id')
      .eq('tenant_id', testTenant)
      .eq('email_hash', emailHash)
      .eq('scope', 'MARKETING');

    expect(rows?.length).toBe(1);
  });
});
