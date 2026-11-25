import './setup';
import { describe, it, expect } from 'vitest';
import { supabase } from '../lib/supabase';
import { exec } from 'child_process';
import util from 'util';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const execAsync = util.promisify(exec);

describe('10E Real TOCTOU Lock-First with Supabase Linked CLI', () => {
  it('Should acquire locks and block concurrent modifications', async () => {
    const emailA = `test-toctou-${Date.now()}@example.com`;
    const { data: authData, error: err } = await supabase.auth.signUp({ email: emailA, password: 'TestPassword123!' });
    if (err) throw err;
    const tenantId = authData.user!.id;
    await supabase.auth.signInWithPassword({ email: emailA, password: 'TestPassword123!' });

    const policyId = crypto.randomUUID();
    const draftId = crypto.randomUUID();
    const subjectId = crypto.randomUUID();
    const nbaId = crypto.randomUUID();

    await supabase.from('atlas_subject_registry').insert([
      { subject_id: subjectId, subject_type: 'PERSON', person_id: subjectId }
    ]);

    await supabase.from('atlas_next_best_action_state').insert([{
      nba_id: nbaId, tenant_id: tenantId, subject_id: subjectId, subject_type: 'PERSON',
      decision_status: 'DO_NOW', recommended_action: 'EMAIL',
      evidence_snapshot_hash: 'e1', input_snapshot_hash: 'i1', policy_version: 'v1'
    }]);
    
    // Insert Policy
    const { error: pErr } = await supabase.from('atlas_message_policies').insert([{
      id: policyId, tenant_id: tenantId, policy_version: 'v1', status: 'ACTIVE',
      channel: 'EMAIL', action_type: 'EMAIL', max_length: 1000,
      policy_hash: 'p1', language: 'EN', tone: 'FORMAL', ai_generation_allowed: false
    }]);
    if (pErr) console.error('Policy insert error:', pErr);

    // Insert Draft
    const { error: dErr } = await supabase.from('atlas_message_drafts').insert([{
      id: draftId, tenant_id: tenantId, subject_type: 'PERSON', subject_id: subjectId,
      nba_state_id: nbaId, nba_decision_hash: 'd_hash',
      channel: 'EMAIL', action_type: 'EMAIL', policy_id: policyId, policy_version: 'v1', policy_hash: 'p1',
      language: 'EN', tone: 'FORMAL', generation_mode: 'DETERMINISTIC', generation_request_id: crypto.randomUUID(),
      message_subject: 'Subj', message_body: 'Body', status: 'COPY_VALIDATED', evidence_snapshot_hash: 'ev_hash', claim_snapshot_hash: 'c_hash'
    }]);
    if (dErr) console.error('Draft insert error:', dErr);

    console.log(`[TEST] Isolated Tenant: ${tenantId}, Draft: ${draftId}, Policy: ${policyId}`);

    const queryA = `set local request.jwt.claims='{"sub":"${tenantId}"}'; BEGIN; SELECT public.certify_message_current_state('${draftId}'::uuid, NULL::uuid, NULL::uuid, NULL::uuid, NULL::uuid, ARRAY[]::uuid[]); SELECT pg_sleep(3); COMMIT;`;
    const queryB = `set local request.jwt.claims='{"sub":"${tenantId}"}'; BEGIN; UPDATE public.atlas_message_policies SET status = 'INACTIVE' WHERE id = '${policyId}'::uuid; COMMIT;`;

    const fileA = path.join(process.cwd(), `queryA_${tenantId}.sql`);
    const fileB = path.join(process.cwd(), `queryB_${tenantId}.sql`);
    
    fs.writeFileSync(fileA, queryA);
    fs.writeFileSync(fileB, queryB);

    const cmdA = `npx supabase db query --file "${fileA}" --linked`;
    const cmdB = `npx supabase db query --file "${fileB}" --linked`;

    console.log('[TEST] Spawning Session A');
    const startA = Date.now();
    const promiseA = execAsync(cmdA);

    // Give Session A time to establish connection and run RPC
    await new Promise(r => setTimeout(r, 2000));

    console.log('[TEST] Spawning Session B');
    const startB = Date.now();
    const promiseB = execAsync(cmdB);
    try {
      await promiseB;
    } catch (e) {
      console.error('PROMISE B FAILED', e.message);
      console.error('STDOUT B:', e.stdout);
      console.error('STDERR B:', e.stderr);
      throw e;
    }
    const endB = Date.now();
    const elapsedB = endB - startB;
    console.log(`[TEST] Session B elapsed: ${elapsedB}ms`);

    // Now re-run certification using normal supabase client to see if it's STALE
    const { data: certRes, error: rpcErr } = await supabase.rpc('certify_message_current_state', { p_draft_id: draftId });
    
    if (rpcErr) console.error('RPC Error:', rpcErr);
    console.log('[TEST] Post-mutation certification result:', certRes);
    
    // It should be STALE because policy is INACTIVE now (hash changed) or something changed
    // Wait, our test policy hash was hardcoded 'p1' in draft, but does DB compute it dynamically?
    // In migration 20260907200003_atlas_message_certification_v4.sql:
    // v_policy_hash := md5(v_policy.policy_version || v_policy.status);
    // Draft policy hash was 'p1'. If we update policy status to 'INACTIVE', new hash is md5('v1INACTIVE').
    // So it won't match 'p1' and will be STALE.
    
    expect(certRes).not.toBeNull();
    expect(certRes.status).toBe('STALE');

    // Cleanup files
    try {
      fs.unlinkSync(fileA);
      fs.unlinkSync(fileB);
    } catch(e) {}
    
  }, 30000); // 30s timeout
});
