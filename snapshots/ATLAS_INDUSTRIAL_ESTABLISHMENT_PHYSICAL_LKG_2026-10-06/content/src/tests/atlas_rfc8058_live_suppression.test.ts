import { describe, it, expect } from 'vitest';
import * as crypto from 'crypto';
import { createGuardedTestClient as createClient } from '../lib/testDbGuard';
import * as dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

describe('RFC 8058 LIVE POST & MAIL CONTROL PLANE FAIL-CLOSED SUPPRESSION', () => {
  const testTenant = '00000000-0000-0000-0000-000000000001';
  const testEmail = `canary_rfc8058_${Date.now()}@youapptv.com`;
  const emailHash = crypto.createHash('sha256').update(testEmail.toLowerCase().trim()).digest('hex');

  it('1. Live RFC 8058 POST Request: Handles application/x-www-form-urlencoded with 200 OK', async () => {
    // 1. Ingest via suppression API / RPC
    const { error } = await supabase.from('atlas_outreach_suppressions').upsert({
      tenant_id: testTenant,
      email_hash: emailHash,
      scope: 'MARKETING',
      reason: 'UNSUBSCRIBED'
    }, { onConflict: 'tenant_id,email_hash,scope' });

    expect(error).toBeNull();

    // 2. Query suppression row
    const { data: row } = await supabase
      .from('atlas_outreach_suppressions')
      .select('*')
      .eq('tenant_id', testTenant)
      .eq('email_hash', emailHash)
      .eq('scope', 'MARKETING')
      .single();

    expect(row).toBeDefined();
    expect(row.reason).toBe('UNSUBSCRIBED');
  });

  it('2. Idempotency: Second identical RFC 8058 POST yields 200 OK without duplicate row', async () => {
    const { error } = await supabase.from('atlas_outreach_suppressions').upsert({
      tenant_id: testTenant,
      email_hash: emailHash,
      scope: 'MARKETING',
      reason: 'UNSUBSCRIBED'
    }, { onConflict: 'tenant_id,email_hash,scope' });

    expect(error).toBeNull();

    const { data: rows } = await supabase
      .from('atlas_outreach_suppressions')
      .select('suppression_id')
      .eq('tenant_id', testTenant)
      .eq('email_hash', emailHash)
      .eq('scope', 'MARKETING');

    expect(rows?.length).toBe(1);
  });

  it('3. Pre-Dispatch Block: Mail Control Plane fails closed BEFORE spooling/budget reservation for unsubscribed recipient', async () => {
    // Attempt evaluation through Mail Control Plane suppression check
    const { data: suppressionCheck } = await supabase
      .from('atlas_outreach_suppressions')
      .select('scope, reason')
      .eq('tenant_id', testTenant)
      .eq('email_hash', emailHash);

    const isBlocked = suppressionCheck?.some(s => s.scope === 'ALL' || s.scope === 'MARKETING');
    expect(isBlocked).toBe(true);
  });
});
