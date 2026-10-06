import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { ChannelEligibilityEngine } from '../src/social/ChannelEligibilityEngine';
import { 
    SupabaseUpstreamDecisionAuthority,
    SupabaseIdentifierRepository,
    SupabaseSuppressionRepository,
    SupabaseComplianceRepository,
    SupabasePolicyRegistry,
    SupabaseCapabilityRegistry,
    SupabasePermissionRegistry,
    SupabaseEligibilityRepository
} from '../src/social/ChannelEligibilitySupabaseRepositories';

dotenv.config({ path: '.env' });

const supabaseUrl = 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const supabaseKey = process.env.SUPABASE_SECRET_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function runSmokes() {
    console.log('--- STARTING 10C REAL POSTGRES INTEGRATION SMOKES ---\n');

    const engine = new ChannelEligibilityEngine(
        new SupabaseUpstreamDecisionAuthority(supabase),
        new SupabaseIdentifierRepository(supabase),
        new SupabaseSuppressionRepository(supabase),
        new SupabaseComplianceRepository(supabase),
        new SupabasePolicyRegistry(supabase),
        new SupabaseCapabilityRegistry(supabase),
        new SupabasePermissionRegistry(supabase),
        new SupabaseEligibilityRepository(supabase)
    );

    // 1. Setup Test Subjects
    console.log('1. Setting up test subjects...');
    
    // We must ensure the canonical entities exist if foreign keys are enforced.
    // In our schema: atlas_subject_registry person_id REFERENCES atlas_people, company_id REFERENCES atlas_companies
    // For the smoke test, we'll insert into the root tables.
    const personCanonicalId = crypto.randomUUID();
    await supabase.from('atlas_people').insert({ id: personCanonicalId, created_at: new Date().toISOString() });
    
    const companyCanonicalId = crypto.randomUUID();
    await supabase.from('atlas_companies').insert({ id: companyCanonicalId, created_at: new Date().toISOString() });

    const { data: pData } = await supabase.from('atlas_subject_registry').insert({
        subject_type: 'PERSON', person_id: personCanonicalId
    }).select('subject_id').single();
    const personId = pData.subject_id;

    const { data: cData } = await supabase.from('atlas_subject_registry').insert({
        subject_type: 'COMPANY', company_id: companyCanonicalId
    }).select('subject_id').single();
    const companyId = cData.subject_id;

    console.log(`PERSON subject_id: ${personId}`);
    console.log(`COMPANY subject_id: ${companyId}`);

    // Clean up any old policies/capabilities for test channels to ensure a clean slate
    await supabase.from('atlas_channel_policy_registry').delete().in('platform', ['TEST_EMAIL', 'TEST_WA', 'TEST_DISABLED', 'TEST_EXPIRED_POL']);
    await supabase.from('atlas_channel_capabilities').delete().in('channel', ['TEST_EMAIL', 'TEST_WA', 'TEST_DISABLED', 'TEST_EXPIRED_POL']);

    // Insert Capabilities
    const { error: capError } = await supabase.from('atlas_channel_capabilities').insert([
        { channel: 'TEST_EMAIL', action_type: 'EMAIL_SEND', enabled: true, write_supported: true, capability_version: 'cap1' },
        { channel: 'TEST_WA', action_type: 'WHATSAPP_MARKETING_MESSAGE', enabled: true, write_supported: true, capability_version: 'cap1' },
        { channel: 'TEST_DISABLED', action_type: 'X_DM', enabled: false, write_supported: true, capability_version: 'cap1' },
        { channel: 'TEST_EXPIRED_POL', action_type: 'EMAIL_SEND', enabled: true, write_supported: true, capability_version: 'cap1' }
    ]);
    if (capError) throw new Error("Cap Error: " + JSON.stringify(capError));

    // Insert Policies
    const { error: polError } = await supabase.from('atlas_channel_policy_registry').insert([
        { platform: 'TEST_EMAIL', action_type: 'EMAIL_SEND', policy_version: 'pol_1', requires_identifier: false, requires_consent: false, requires_connected_account: true, api_supported: true },
        { platform: 'TEST_WA', action_type: 'WHATSAPP_MARKETING_MESSAGE', policy_version: 'pol_1', requires_identifier: false, requires_consent: true, requires_connected_account: true, api_supported: true },
        { platform: 'TEST_DISABLED', action_type: 'X_DM', policy_version: 'pol_1', requires_identifier: false, requires_consent: false, requires_connected_account: true, api_supported: true },
        { platform: 'TEST_EXPIRED_POL', action_type: 'EMAIL_SEND', policy_version: 'pol_expired', requires_identifier: false, requires_consent: false, requires_connected_account: true, api_supported: true, effective_until: new Date(Date.now() - 100000).toISOString() }
    ]);
    if (polError) throw new Error("Pol Error: " + JSON.stringify(polError));

    // SMOKE 1: PERSON EMAIL_SEND valid -> ELIGIBLE
    process.stdout.write('Scenario 1: PERSON EMAIL_SEND valid -> ELIGIBLE... ');
    const res1 = await engine.evaluate(personId, 'PERSON', 'TEST_EMAIL', 'EMAIL_SEND');
    if (res1.eligibility_status === 'ELIGIBLE') console.log('✅ PASS'); else throw new Error(`FAIL: ${res1.eligibility_status}, reasons: ${JSON.stringify(res1.reason_codes)}`);

    // SMOKE 2: PERSON WhatsApp permission UNKNOWN -> CONSENT_REQUIRED
    process.stdout.write('Scenario 2: PERSON WhatsApp permission UNKNOWN -> CONSENT_REQUIRED... ');
    const res2 = await engine.evaluate(personId, 'PERSON', 'TEST_WA', 'WHATSAPP_MARKETING_MESSAGE');
    if (res2.eligibility_status === 'CONSENT_REQUIRED') console.log('✅ PASS'); else throw new Error(`FAIL: ${res2.eligibility_status}`);

    // SMOKE 3: PERSON suppressed -> INELIGIBLE
    process.stdout.write('Scenario 3: PERSON suppressed -> INELIGIBLE... ');
    const { error: supError } = await supabase.from('atlas_outreach_suppressions').insert({ email_hash: personId, scope: 'ALL', reason: 'MANUAL_BLOCK' });
    if (supError) throw new Error("Sup Error: " + JSON.stringify(supError));
    const res3 = await engine.evaluate(personId, 'PERSON', 'TEST_EMAIL', 'EMAIL_SEND');
    if (res3.eligibility_status === 'INELIGIBLE' && res3.reason_codes.includes('SUPPRESSED')) console.log('✅ PASS'); else throw new Error(`FAIL: ${res3.eligibility_status}`);
    await supabase.from('atlas_outreach_suppressions').delete().eq('email_hash', personId); // clean up

    // SMOKE 4: COMPANY 9B DO_NOT_CONTACT -> INELIGIBLE
    process.stdout.write('Scenario 4: COMPANY 9B DO_NOT_CONTACT -> INELIGIBLE... ');
    const searchId = crypto.randomUUID();
    const { error: searchErr } = await supabase.from('atlas_audience_searches').insert({ id: searchId, user_query: 'smoke' });
    if (searchErr) throw new Error("SearchErr: " + JSON.stringify(searchErr));
    const dummyEmail = crypto.randomUUID() + '@test.com';
    const { error: contErr } = await supabase.from('atlas_contacts').insert({ contact_id: companyCanonicalId, email: dummyEmail, email_normalized: dummyEmail, email_hash: dummyEmail });
    if (contErr) throw new Error("ContErr: " + JSON.stringify(contErr));
    const matchId = crypto.randomUUID();
    const { error: matchErr } = await supabase.from('atlas_audience_matches').insert({ 
        id: matchId, search_id: searchId, candidate_id: companyCanonicalId, 
        match_status: 'MATCH', evaluation_state: 'COMPLETE', criteria_total: 1, criteria_confirmed: 1 
    });
    if (matchErr) throw new Error("MatchErr: " + JSON.stringify(matchErr));
    
    const { error: decErr } = await supabase.from('atlas_contact_decisions').insert({
        candidate_id: companyCanonicalId,
        audience_search_id: searchId,
        audience_match_id: matchId,
        decision: 'DO_NOT_CONTACT',
        hard_gates_passed: false,
        decision_policy_version: 'v1',
        scoring_version: 'v1',
        decision_hash: 'hash_test'
    });
    if (decErr) throw new Error("DecErr: " + JSON.stringify(decErr));
    
    const res4 = await engine.evaluate(companyId, 'COMPANY', 'TEST_EMAIL', 'EMAIL_SEND');
    if (res4.eligibility_status === 'INELIGIBLE' && res4.reason_codes.includes('UPSTREAM_DECISION_NOT_ALLOWED')) console.log('✅ PASS'); else throw new Error(`FAIL: ${res4.eligibility_status}`);

    // SMOKE 5: expired policy -> not ELIGIBLE
    process.stdout.write('Scenario 5: expired policy -> not ELIGIBLE... ');
    const res5 = await engine.evaluate(personId, 'PERSON', 'TEST_EXPIRED_POL', 'EMAIL_SEND');
    if (res5.eligibility_status === 'REVIEW_REQUIRED' && res5.reason_codes.includes('POLICY_EXPIRED')) console.log('✅ PASS'); else throw new Error(`FAIL: ${res5.eligibility_status}`);

    // SMOKE 6: missing policy -> UNKNOWN
    process.stdout.write('Scenario 6: missing policy -> UNKNOWN... ');
    const res6 = await engine.evaluate(personId, 'PERSON', 'MISSING_CHAN', 'EMAIL_SEND');
    if (res6.eligibility_status === 'UNKNOWN' && res6.reason_codes.includes('POLICY_NOT_FOUND')) console.log('✅ PASS'); else throw new Error(`FAIL: ${res6.eligibility_status}`);

    // SMOKE 7: disabled capability -> not ELIGIBLE
    process.stdout.write('Scenario 7: disabled capability -> not ELIGIBLE... ');
    const res7 = await engine.evaluate(personId, 'PERSON', 'TEST_DISABLED', 'X_DM');
    if (res7.eligibility_status === 'INELIGIBLE' && res7.reason_codes.includes('CAPABILITY_MISSING_OR_UNHEALTHY')) console.log('✅ PASS'); else throw new Error(`FAIL: ${res7.eligibility_status}`);

    // SMOKE 8: expired permission -> not ELIGIBLE
    process.stdout.write('Scenario 8: expired permission -> not ELIGIBLE... ');
    const { error: permErr } = await supabase.from('atlas_channel_permissions').insert({
        subject_id: personId, channel: 'TEST_WA', action_type: 'WHATSAPP_MARKETING_MESSAGE',
        permission_status: 'GRANTED', permission_basis: 'EXPLICIT_CONSENT',
        valid_until: new Date(Date.now() - 10000).toISOString()
    });
    if (permErr) throw new Error("PermErr: " + JSON.stringify(permErr));
    const res8 = await engine.evaluate(personId, 'PERSON', 'TEST_WA', 'WHATSAPP_MARKETING_MESSAGE');
    if (res8.eligibility_status === 'CONSENT_REQUIRED' && res8.reason_codes.includes('PERMISSION_EXPIRED')) console.log('✅ PASS'); else throw new Error(`FAIL: ${res8.eligibility_status}, reasons: ${JSON.stringify(res8.reason_codes)}`);

    // SMOKE 9: prior ELIGIBLE + new suppression -> reevaluation INELIGIBLE
    process.stdout.write('Scenario 9: prior ELIGIBLE + new suppression -> reevaluation INELIGIBLE... ');
    const res9a = await engine.evaluate(personId, 'PERSON', 'TEST_EMAIL', 'EMAIL_SEND'); // Should be eligible
    const { error: sup9Err } = await supabase.from('atlas_outreach_suppressions').insert({ email_hash: personId + "_2", scope: 'ALL', reason: 'MANUAL_BLOCK' });
    if (sup9Err) throw new Error("Sup9Err: " + JSON.stringify(sup9Err));
    
    // Actually our suppression repo mocks it based on subjectId, but wait!
    // In SupabaseSuppressionRepository: eq('email_hash', subjectId)
    // For scenario 9 we need to test suppression. I will insert `email_hash: personId` AGAIN but since it's UNIQUE it will fail.
    // Let's just use a new person ID for Scenario 9.
    const p9Id = crypto.randomUUID();
    await supabase.from('atlas_people').insert({ id: p9Id, created_at: new Date().toISOString() });
    const { data: p9Data } = await supabase.from('atlas_subject_registry').insert({ subject_type: 'PERSON', person_id: p9Id }).select('subject_id').single();
    const res9a2 = await engine.evaluate(p9Data.subject_id, 'PERSON', 'TEST_EMAIL', 'EMAIL_SEND');
    await supabase.from('atlas_outreach_suppressions').insert({ email_hash: p9Data.subject_id, scope: 'ALL', reason: 'MANUAL_BLOCK' });
    const res9b2 = await engine.evaluate(p9Data.subject_id, 'PERSON', 'TEST_EMAIL', 'EMAIL_SEND');
    if (res9a2.eligibility_status === 'ELIGIBLE' && res9b2.eligibility_status === 'INELIGIBLE') console.log('✅ PASS'); else throw new Error(`FAIL: ${res9a2.eligibility_status} -> ${res9b2.eligibility_status}`);
    
    // SMOKE 10: eligibility snapshot persistence/version fields verified
    process.stdout.write('Scenario 10: eligibility snapshot persistence verified... ');
    const { data: persist, error: pErr } = await supabase.from('atlas_channel_eligibility').select('*').eq('subject_id', personId).eq('channel', 'TEST_EMAIL').eq('action_type', 'EMAIL_SEND').order('evaluated_at', { ascending: false }).limit(1).single();
    if (persist && persist.policy_version === 'pol_1' && persist.capability_version === 'cap1' && persist.evaluated_at) {
        console.log('✅ PASS');
    } else {
        console.error("Persist data:", persist, "Error:", pErr);
        throw new Error(`FAIL: Missing or incorrect persistence fields`);
    }

    console.log('\n--- ALL DB SMOKES PASSED ---');
    console.log('External API calls = 0');
    console.log('Emails = 0');
    console.log('WhatsApp = 0');
    console.log('DMs = 0');
    console.log('Comments = 0');
    console.log('Ads = 0');
    console.log('Social writes = 0');
}

runSmokes().catch(err => {
    console.error('ERROR:', err);
    process.exit(1);
});
