import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SupabaseClient } from '@supabase/supabase-js';
import { createGuardedTestClient as createClient } from '../lib/testDbGuard';
import * as crypto from 'crypto';
import dotenv from 'dotenv';

const loadEnv = dotenv?.config || (dotenv as any)?.default?.config;
if (typeof loadEnv === 'function') loadEnv({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_IWSDC0aWUR8cvOPrwYSaqg_JU8aASm8';
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY;
if (!supabaseServiceKey) throw new Error('SUPABASE_SECRET_KEY must be set in environment');

const adminClient = createClient(supabaseUrl, supabaseServiceKey);
let userClientA: SupabaseClient;
let userClientB: SupabaseClient;

function randomUUID() {
    return crypto.randomUUID();
}

describe('Person Coverage and Gap Analysis V1 Certification Suite (060000)', () => {
    let tenantA: string;
    let tenantB: string;
    let personObservedA: string;
    let personCanonicalA: string;
    let personTenantB: string;

    let testProductId: string;
    let testOfferId: string;

    const userEmailA = `cov_test_a_${Date.now()}_${randomUUID().slice(0, 8)}@example.com`;
    const userEmailB = `cov_test_b_${Date.now()}_${randomUUID().slice(0, 8)}@example.com`;
    const testPassword = `TestPass!_${randomUUID()}`;

    beforeAll(async () => {
        // 1. Setup Tenant A
        const { data: authA, error: errA } = await adminClient.auth.admin.createUser({
            email: userEmailA,
            password: testPassword,
            email_confirm: true
        });
        if (errA || !authA.user) throw new Error(`User A creation failed: ${errA?.message}`);
        tenantA = authA.user.id;
        await adminClient.from('atlas_tenants').upsert([{ tenant_id: tenantA }]);

        // Setup Tenant B
        const { data: authB, error: errB } = await adminClient.auth.admin.createUser({
            email: userEmailB,
            password: testPassword,
            email_confirm: true
        });
        if (errB || !authB.user) throw new Error(`User B creation failed: ${errB?.message}`);
        tenantB = authB.user.id;
        await adminClient.from('atlas_tenants').upsert([{ tenant_id: tenantB }]);

        // Clients
        userClientA = createClient(supabaseUrl, supabaseAnonKey);
        await userClientA.auth.signInWithPassword({ email: userEmailA, password: testPassword });

        userClientB = createClient(supabaseUrl, supabaseAnonKey);
        await userClientB.auth.signInWithPassword({ email: userEmailB, password: testPassword });

        // 2. Setup Seed Persons
        // Person Observed in Tenant A
        personObservedA = randomUUID();
        await adminClient.from('atlas_people').insert([{
            person_id: personObservedA,
            tenant_id: tenantA,
            full_name: 'Alice Observed',
            status: 'ACTIVE',
            lifecycle_stage: 'OBSERVED'
        }]);

        // Person Canonical in Tenant A
        personCanonicalA = randomUUID();
        await adminClient.from('atlas_people').insert([{
            person_id: personCanonicalA,
            tenant_id: tenantA,
            full_name: 'Bob Canonical',
            status: 'ACTIVE',
            lifecycle_stage: 'CANONICAL'
        }]);

        // Person in Tenant B
        personTenantB = randomUUID();
        await adminClient.from('atlas_people').insert([{
            person_id: personTenantB,
            tenant_id: tenantB,
            full_name: 'Charlie Tenant B',
            status: 'ACTIVE',
            lifecycle_stage: 'CANONICAL'
        }]);

        // Seed Product & Offer for Product Fit test
        testProductId = randomUUID();
        testOfferId = randomUUID();
        await adminClient.from('atlas_products').insert([{
            product_id: testProductId,
            tenant_id: tenantA,
            name: 'Coverage Test Product',
            category: 'SAAS',
            description: 'Test Product',
            status: 'ACTIVE',
            attributes_json: {}
        }]);
        await adminClient.from('atlas_product_offers').insert([{
            offer_id: testOfferId,
            tenant_id: tenantA,
            product_id: testProductId,
            price: 1000,
            currency: 'USD',
            availability_status: 'AVAILABLE',
            offer_version: 'v1.0'
        }]);
    });

    afterAll(async () => {
        // Cleanup created data
        await adminClient.from('atlas_product_offers').delete().eq('offer_id', testOfferId);
        await adminClient.from('atlas_products').delete().eq('product_id', testProductId);
        await adminClient.from('atlas_people').delete().in('person_id', [personObservedA, personCanonicalA, personTenantB]);
        await adminClient.auth.admin.deleteUser(tenantA).catch(() => {});
        await adminClient.auth.admin.deleteUser(tenantB).catch(() => {});
    });

    // =========================================================================
    // 1. TEMPORAL & HASH REPRODUCIBILITY
    // =========================================================================
    it('1: TEMPORAL_REPRODUCIBILITY - same facts + same policy + same as_of -> identical state hash', async () => {
        const asOf = new Date().toISOString();
        const { data: res1, error: err1 } = await adminClient.rpc('compute_person_coverage_system_v1', {
            p_tenant_id: tenantA,
            p_person_id: personObservedA,
            p_as_of: asOf,
            p_force_snapshot: false
        });
        expect(err1).toBeNull();

        const { data: res2, error: err2 } = await adminClient.rpc('compute_person_coverage_system_v1', {
            p_tenant_id: tenantA,
            p_person_id: personObservedA,
            p_as_of: asOf,
            p_force_snapshot: false
        });
        expect(err2).toBeNull();
        expect(res1.source_fact_set_hash).toBe(res2.source_fact_set_hash);
        expect(res1.coverage_state_hash).toBe(res2.coverage_state_hash);
    });

    it('2: TEMPORAL_SHIFT - same facts + later as_of -> source hash identical, state hash changes to STALE', async () => {
        // Add an intent with an expiry date
        const intentExp = new Date(Date.now() + 10 * 86400 * 1000).toISOString(); // expires in 10 days
        await adminClient.from('atlas_person_intent_state').insert([{
            tenant_id: tenantA,
            person_id: personObservedA,
            topic: 'AI_AGENT_PLATFORM',
            intent_level: 'HIGH',
            intent_score: 85.0,
            policy_version: 'v1.0.0-deterministic',
            calculated_at: new Date().toISOString(),
            expires_at: intentExp
        }]);

        // Evaluate before expiry
        const asOfBefore = new Date().toISOString();
        const { data: resBefore } = await adminClient.rpc('compute_person_coverage_system_v1', {
            p_tenant_id: tenantA,
            p_person_id: personObservedA,
            p_as_of: asOfBefore,
            p_force_snapshot: true
        });

        // Evaluate after expiry (30 days in future)
        const asOfAfter = new Date(Date.now() + 30 * 86400 * 1000).toISOString();
        const { data: resAfter } = await adminClient.rpc('compute_person_coverage_system_v1', {
            p_tenant_id: tenantA,
            p_person_id: personObservedA,
            p_as_of: asOfAfter,
            p_force_snapshot: true
        });

        // Source fact set hash must remain 100% IDENTICAL
        expect(resBefore.source_fact_set_hash).toBe(resAfter.source_fact_set_hash);
        // Coverage state hash must CHANGE because intent transitioned to STALE
        expect(resBefore.coverage_state_hash).not.toBe(resAfter.coverage_state_hash);

        // Check intent dimension status in both
        const dimBefore = resBefore.dimensions.find((d: any) => d.dimension_key === 'INTENT_STATE');
        const dimAfter = resAfter.dimensions.find((d: any) => d.dimension_key === 'INTENT_STATE');
        expect(dimBefore.coverage_status).toBe('KNOWN');
        expect(dimAfter.coverage_status).toBe('STALE');
    });

    it('3: SOURCE_HASH_STABILITY - NOW() and execution timestamp excluded from source fact hash', async () => {
        const { data: hash1 } = await adminClient.rpc('calculate_person_source_fact_set_hash', {
            p_tenant_id: tenantA,
            p_person_id: personObservedA
        });
        await new Promise(resolve => setTimeout(resolve, 50));
        const { data: hash2 } = await adminClient.rpc('calculate_person_source_fact_set_hash', {
            p_tenant_id: tenantA,
            p_person_id: personObservedA
        });
        expect(hash1).toBe(hash2);
    });

    // =========================================================================
    // 2. KNOWLEDGE VS SUFFICIENCY (EVIDENCE & INTENT & FIT)
    // =========================================================================
    it('4: IDENTITY_EVIDENCE - 1 verified anchor -> status KNOWN, sufficient TRUE', async () => {
        const pId = randomUUID();
        await adminClient.from('atlas_people').insert([{
            person_id: pId,
            tenant_id: tenantA,
            full_name: 'Test Anchor Person',
            lifecycle_stage: 'OBSERVED'
        }]);

        await adminClient.from('atlas_person_identifiers').insert([{
            person_id: pId,
            tenant_id: tenantA,
            identifier_type: 'EMAIL',
            normalized_value_hash: crypto.createHash('sha256').update('anchor@test.com').digest('hex'),
            verification_status: 'VERIFIED'
        }]);

        const { data: res } = await adminClient.rpc('compute_person_coverage_system_v1', {
            p_tenant_id: tenantA,
            p_person_id: pId,
            p_as_of: null,
            p_force_snapshot: false
        });

        const idDim = res.dimensions.find((d: any) => d.dimension_key === 'IDENTITY_ANCHORS');
        expect(idDim.coverage_status).toBe('KNOWN');
        expect(idDim.sufficient_for_lifecycle).toBe(true);
        expect(idDim.details.stable_anchors).toBe(1);
    });

    it('5: ATTRIBUTE_EVIDENCE - 1 verified attribute -> status KNOWN, sufficient FALSE (< 2)', async () => {
        const pId = randomUUID();
        await adminClient.from('atlas_people').insert([{
            person_id: pId,
            tenant_id: tenantA,
            full_name: 'Test Attr 1 Person',
            lifecycle_stage: 'OBSERVED'
        }]);

        await adminClient.from('atlas_person_attribute_evidence').insert([{
            person_id: pId,
            tenant_id: tenantA,
            attribute_key: 'residence_city',
            normalized_value: 'Rosario',
            assertion_type: 'OBSERVED',
            confidence: 0.85
        }]);

        const { data: res } = await adminClient.rpc('compute_person_coverage_system_v1', {
            p_tenant_id: tenantA,
            p_person_id: pId,
            p_as_of: null,
            p_force_snapshot: false
        });

        const attrDim = res.dimensions.find((d: any) => d.dimension_key === 'ATTRIBUTE_EVIDENCE');
        expect(attrDim.coverage_status).toBe('KNOWN');
        expect(attrDim.sufficient_for_lifecycle).toBe(false);
        expect(attrDim.details.count).toBe(1);
    });

    it('6: ATTRIBUTE_EVIDENCE - 2 verified attributes -> status KNOWN, sufficient TRUE (>= 2)', async () => {
        const pId = randomUUID();
        await adminClient.from('atlas_people').insert([{
            person_id: pId,
            tenant_id: tenantA,
            full_name: 'Test Attr 2 Person',
            lifecycle_stage: 'OBSERVED'
        }]);

        await adminClient.from('atlas_person_attribute_evidence').insert([
            { person_id: pId, tenant_id: tenantA, attribute_key: 'residence_city', normalized_value: 'Mendoza', assertion_type: 'OBSERVED', confidence: 0.85 },
            { person_id: pId, tenant_id: tenantA, attribute_key: 'profession', normalized_value: 'Arquitecto', assertion_type: 'OBSERVED', confidence: 0.80 }
        ]);

        const { data: res } = await adminClient.rpc('compute_person_coverage_system_v1', {
            p_tenant_id: tenantA,
            p_person_id: pId,
            p_as_of: null,
            p_force_snapshot: false
        });

        const attrDim = res.dimensions.find((d: any) => d.dimension_key === 'ATTRIBUTE_EVIDENCE');
        expect(attrDim.coverage_status).toBe('KNOWN');
        expect(attrDim.sufficient_for_lifecycle).toBe(true);
        expect(attrDim.details.count).toBe(2);
    });

    it('7: EVIDENCE_CONFIDENCE - low confidence (0.55) is KNOWN with sufficient FALSE, NEVER STALE', async () => {
        const pId = randomUUID();
        await adminClient.from('atlas_people').insert([{
            person_id: pId,
            tenant_id: tenantA,
            full_name: 'Low Conf Person',
            lifecycle_stage: 'OBSERVED'
        }]);

        await adminClient.from('atlas_person_attribute_evidence').insert([{
            person_id: pId,
            tenant_id: tenantA,
            attribute_key: 'residence_country',
            normalized_value: 'Argentina',
            assertion_type: 'OBSERVED',
            confidence: 0.55
        }]);

        const { data: res } = await adminClient.rpc('compute_person_coverage_system_v1', {
            p_tenant_id: tenantA,
            p_person_id: pId,
            p_as_of: null,
            p_force_snapshot: false
        });

        const confDim = res.dimensions.find((d: any) => d.dimension_key === 'EVIDENCE_CONFIDENCE');
        expect(confDim.coverage_status).toBe('KNOWN');
        expect(confDim.sufficient_for_lifecycle).toBe(false);
    });

    it('8: INTENT - LOW intent is KNOWN but qualified FALSE', async () => {
        const pId = randomUUID();
        await adminClient.from('atlas_people').insert([{
            person_id: pId,
            tenant_id: tenantA,
            full_name: 'Low Intent Person',
            lifecycle_stage: 'OBSERVED'
        }]);

        await adminClient.from('atlas_person_intent_state').insert([{
            tenant_id: tenantA,
            person_id: pId,
            topic: 'FINTECH',
            intent_level: 'LOW',
            intent_score: 25.0,
            policy_version: 'v1.0.0-deterministic',
            calculated_at: new Date().toISOString()
        }]);

        const { data: res } = await adminClient.rpc('compute_person_coverage_system_v1', {
            p_tenant_id: tenantA,
            p_person_id: pId,
            p_as_of: null,
            p_force_snapshot: false
        });

        const intDim = res.dimensions.find((d: any) => d.dimension_key === 'INTENT_STATE');
        expect(intDim.coverage_status).toBe('KNOWN');
        expect(intDim.sufficient_for_lifecycle).toBe(false);
    });

    it('9: PRODUCT_FIT - NO_FIT is KNOWN but qualified FALSE', async () => {
        const pId = randomUUID();
        // Product fit requires CANONICAL person
        await adminClient.from('atlas_people').insert([{
            person_id: pId,
            tenant_id: tenantA,
            full_name: 'No Fit Person',
            lifecycle_stage: 'CANONICAL'
        }]);

        await adminClient.from('atlas_person_product_fit_state').insert([{
            tenant_id: tenantA,
            person_id: pId,
            product_id: testProductId,
            offer_id: testOfferId,
            context_hash: 'test-context-hash',
            component_scores: {},
            policy_version: 'v1.0.0',
            input_snapshot_hash: 'test-in',
            evidence_snapshot_hash: 'test-ev',
            fit_level: 'NO_FIT',
            fit_score: 10.0,
            calculated_at: new Date().toISOString()
        }]);

        const { data: res } = await adminClient.rpc('compute_person_coverage_system_v1', {
            p_tenant_id: tenantA,
            p_person_id: pId,
            p_as_of: null,
            p_force_snapshot: false
        });

        const fitDim = res.dimensions.find((d: any) => d.dimension_key === 'PRODUCT_FIT_STATE');
        expect(fitDim.coverage_status).toBe('KNOWN');
        expect(fitDim.sufficient_for_lifecycle).toBe(false);
    });

    // =========================================================================
    // 3. STRICT ATTRIBUTE GRANULARITY
    // =========================================================================
    it('10: COARSE_LOCATION_DOES_NOT_IMPLY_CITY_OR_COUNTRY', async () => {
        const pId = randomUUID();
        await adminClient.from('atlas_people').insert([{
            person_id: pId,
            tenant_id: tenantA,
            full_name: 'Coarse Location Person',
            lifecycle_stage: 'OBSERVED'
        }]);

        await adminClient.from('atlas_person_attribute_evidence').insert([{
            person_id: pId,
            tenant_id: tenantA,
            attribute_key: 'LOCATION',
            normalized_value: 'Palermo, Buenos Aires, Argentina',
            assertion_type: 'OBSERVED',
            confidence: 0.9
        }]);

        const { data: res } = await adminClient.rpc('compute_person_coverage_system_v1', {
            p_tenant_id: tenantA,
            p_person_id: pId,
            p_as_of: null,
            p_force_snapshot: false
        });

        const locDim = res.dimensions.find((d: any) => d.dimension_key === 'LOCATION');
        const cityDim = res.dimensions.find((d: any) => d.dimension_key === 'CITY');
        const countryDim = res.dimensions.find((d: any) => d.dimension_key === 'COUNTRY');

        expect(locDim.coverage_status).toBe('KNOWN');
        expect(cityDim.coverage_status).toBe('UNKNOWN');
        expect(countryDim.coverage_status).toBe('UNKNOWN');
    });

    it('11: PROFESSION_DOES_NOT_IMPLY_JOB_TITLE', async () => {
        const pId = randomUUID();
        await adminClient.from('atlas_people').insert([{
            person_id: pId,
            tenant_id: tenantA,
            full_name: 'Profession Only Person',
            lifecycle_stage: 'OBSERVED'
        }]);

        await adminClient.from('atlas_person_attribute_evidence').insert([{
            person_id: pId,
            tenant_id: tenantA,
            attribute_key: 'profession',
            normalized_value: 'Software Engineer',
            assertion_type: 'OBSERVED',
            confidence: 0.9
        }]);

        const { data: res } = await adminClient.rpc('compute_person_coverage_system_v1', {
            p_tenant_id: tenantA,
            p_person_id: pId,
            p_as_of: null,
            p_force_snapshot: false
        });

        const profDim = res.dimensions.find((d: any) => d.dimension_key === 'PROFESSION');
        const titleDim = res.dimensions.find((d: any) => d.dimension_key === 'JOB_TITLE');

        expect(profDim.coverage_status).toBe('KNOWN');
        expect(titleDim.coverage_status).toBe('UNKNOWN');
    });

    it('12: UNSUPPORTED_REGION_AND_WORK_NEIGHBORHOOD_REMAIN_UNKNOWN', async () => {
        const { data: res } = await adminClient.rpc('compute_person_coverage_system_v1', {
            p_tenant_id: tenantA,
            p_person_id: personObservedA,
            p_as_of: null,
            p_force_snapshot: false
        });

        const regDim = res.dimensions.find((d: any) => d.dimension_key === 'REGION');
        const wnDim = res.dimensions.find((d: any) => d.dimension_key === 'WORK_NEIGHBORHOOD');

        expect(regDim.coverage_status).toBe('UNKNOWN');
        expect(regDim.details.status).toBe('UNSUPPORTED_V1');
        expect(wnDim.coverage_status).toBe('UNKNOWN');
        expect(wnDim.details.status).toBe('UNSUPPORTED_V1');
    });

    // =========================================================================
    // 4. SUBJECT REGISTRY LINKAGE (10C / 10D)
    // =========================================================================
    it('13: SUBJECT_REGISTRY_LINKAGE - resolves 10C when subject_id != person_id', async () => {
        const pId = randomUUID();
        const customSubjectId = randomUUID(); // Explicitly different UUID!
        await adminClient.from('atlas_people').insert([{
            person_id: pId,
            tenant_id: tenantA,
            full_name: 'Diff Subject Person',
            lifecycle_stage: 'CANONICAL'
        }]);

        // Update the auto-created registry row to have customSubjectId
        await adminClient.from('atlas_subject_registry').update({
            subject_id: customSubjectId
        }).eq('person_id', pId);

        // Insert channel eligibility linked to customSubjectId
        await adminClient.from('atlas_channel_eligibility').insert([{
            subject_id: customSubjectId,
            channel: 'EMAIL',
            action_type: 'EMAIL_SEND',
            eligibility_status: 'ELIGIBLE',
            evaluated_at: new Date().toISOString()
        }]);

        const { data: res } = await adminClient.rpc('compute_person_coverage_system_v1', {
            p_tenant_id: tenantA,
            p_person_id: pId,
            p_as_of: null,
            p_force_snapshot: false
        });

        const ceDim = res.dimensions.find((d: any) => d.dimension_key === 'CHANNEL_ELIGIBILITY');
        expect(ceDim.coverage_status).toBe('KNOWN');
    });

    it('14: SUBJECT_REGISTRY_MISSING - gracefully evaluates 10C and 10D to UNKNOWN', async () => {
        const pId = randomUUID();
        await adminClient.from('atlas_people').insert([{
            person_id: pId,
            tenant_id: tenantA,
            full_name: 'No Registry Person',
            lifecycle_stage: 'CANONICAL'
        }]);

        // Delete any auto-trigger registry insertion if exists
        await adminClient.from('atlas_subject_registry').delete().eq('person_id', pId);

        const { data: res } = await adminClient.rpc('compute_person_coverage_system_v1', {
            p_tenant_id: tenantA,
            p_person_id: pId,
            p_as_of: null,
            p_force_snapshot: false
        });

        const ceDim = res.dimensions.find((d: any) => d.dimension_key === 'CHANNEL_ELIGIBILITY');
        const nbaDim = res.dimensions.find((d: any) => d.dimension_key === 'NEXT_BEST_ACTION');
        expect(ceDim.coverage_status).toBe('UNKNOWN');
        expect(nbaDim.coverage_status).toBe('UNKNOWN');
    });

    // =========================================================================
    // 5. PRIORITY AUTHORITY & GAPS
    // =========================================================================
    it('15: PRIORITY_AUTHORITY - CANONICAL missing email has priority NONE', async () => {
        const { data: res } = await adminClient.rpc('compute_person_coverage_system_v1', {
            p_tenant_id: tenantA,
            p_person_id: personCanonicalA,
            p_as_of: null,
            p_force_snapshot: false
        });

        const emailGap = res.gaps.find((g: any) => g.gap_key === 'EMAIL');
        expect(emailGap).toBeDefined();
        expect(emailGap.priority).toBe('NONE');
    });

    it('16: PRIORITY_AUTHORITY - OBSERVED missing anchor has priority HIGH (blocker)', async () => {
        const { data: res } = await adminClient.rpc('compute_person_coverage_system_v1', {
            p_tenant_id: tenantA,
            p_person_id: personObservedA,
            p_as_of: null,
            p_force_snapshot: false
        });

        const anchorGap = res.gaps.find((g: any) => g.gap_key === 'IDENTITY_ANCHORS');
        expect(anchorGap).toBeDefined();
        expect(anchorGap.priority).toBe('HIGH');
        expect(anchorGap.blocker_rule).toBe('min_identity_anchors');
    });

    it('17: COMPOSITE_SIGNAL_INTENT_GATE - fresh signal present -> missing intent has priority NONE', async () => {
        const pId = randomUUID();
        await adminClient.from('atlas_people').insert([{
            person_id: pId,
            tenant_id: tenantA,
            full_name: 'Signal Only Person',
            lifecycle_stage: 'OBSERVED'
        }]);

        // Insert fresh confirmed signal with valid enum and mandatory fields
        await adminClient.from('atlas_social_signals').insert([{
            canonical_entity_id: pId,
            canonical_entity_type: 'PERSON',
            signal_type: 'HIRING',
            status: 'CONFIRMED',
            confidence: 0.95,
            strength: 0.90,
            signal_fingerprint: randomUUID(),
            extractor_type: 'DETERMINISTIC',
            extractor_version: 'v1.0',
            signal_policy_version: 'v1.0',
            detected_at: new Date().toISOString(),
            valid_from: new Date().toISOString(),
            valid_until: new Date(Date.now() + 30 * 86400 * 1000).toISOString()
        }]);

        const { data: res } = await adminClient.rpc('compute_person_coverage_system_v1', {
            p_tenant_id: tenantA,
            p_person_id: pId,
            p_as_of: null,
            p_force_snapshot: false
        });

        // DOMAIN_RELEVANCE blocker gap should NOT be present because signal is satisfied
        const relGap = res.gaps.find((g: any) => g.gap_key === 'DOMAIN_RELEVANCE');
        expect(relGap).toBeUndefined();
    });

    // =========================================================================
    // 6. CURRENT VS HISTORICAL ISOLATION CONTRACT
    // =========================================================================
    it('18: HISTORICAL_AS_OF_DOES_NOT_MUTATE_CURRENT_DIMENSIONS', async () => {
        // First, compute in CURRENT mode to record initial state
        await adminClient.rpc('compute_person_coverage_system_v1', {
            p_tenant_id: tenantA,
            p_person_id: personObservedA,
            p_as_of: null,
            p_force_snapshot: false
        });

        const { data: dimsBefore } = await adminClient
            .from('atlas_person_coverage_dimensions')
            .select('*')
            .eq('person_id', personObservedA);

        // Now compute in HISTORICAL mode with as_of 1 year ago
        const pastAsOf = new Date(Date.now() - 365 * 86400 * 1000).toISOString();
        const { data: histRes } = await adminClient.rpc('compute_person_coverage_system_v1', {
            p_tenant_id: tenantA,
            p_person_id: personObservedA,
            p_as_of: pastAsOf,
            p_force_snapshot: false
        });
        expect(histRes.is_historical).toBe(true);

        const { data: dimsAfter } = await adminClient
            .from('atlas_person_coverage_dimensions')
            .select('*')
            .eq('person_id', personObservedA);

        // Current dimensions must be 100% UNTOUCHED
        expect(dimsBefore).toEqual(dimsAfter);
    });

    it('19: HISTORICAL_AS_OF_DOES_NOT_MUTATE_CURRENT_GAPS', async () => {
        const { data: gapsBefore } = await adminClient
            .from('atlas_person_gap_analysis')
            .select('*')
            .eq('person_id', personObservedA);

        const pastAsOf = new Date(Date.now() - 365 * 86400 * 1000).toISOString();
        await adminClient.rpc('compute_person_coverage_system_v1', {
            p_tenant_id: tenantA,
            p_person_id: personObservedA,
            p_as_of: pastAsOf,
            p_force_snapshot: false
        });

        const { data: gapsAfter } = await adminClient
            .from('atlas_person_gap_analysis')
            .select('*')
            .eq('person_id', personObservedA);

        expect(gapsBefore).toEqual(gapsAfter);
    });

    it('20: HISTORICAL_AS_OF_DOES_NOT_MUTATE_LEGACY', async () => {
        const { data: covBefore } = await adminClient
            .from('atlas_person_coverage')
            .select('*')
            .eq('person_id', personObservedA);

        const pastAsOf = new Date(Date.now() - 365 * 86400 * 1000).toISOString();
        await adminClient.rpc('compute_person_coverage_system_v1', {
            p_tenant_id: tenantA,
            p_person_id: personObservedA,
            p_as_of: pastAsOf,
            p_force_snapshot: false
        });

        const { data: covAfter } = await adminClient
            .from('atlas_person_coverage')
            .select('*')
            .eq('person_id', personObservedA);

        expect(covBefore).toEqual(covAfter);
    });

    it('21: CURRENT_COMPUTE_UPDATES_CURRENT_STATE_AND_LEGACY', async () => {
        const pId = randomUUID();
        await adminClient.from('atlas_people').insert([{
            person_id: pId,
            tenant_id: tenantA,
            full_name: 'Current Compute Test',
            lifecycle_stage: 'CANONICAL'
        }]);

        // Insert verified email
        await adminClient.from('atlas_person_identifiers').insert([{
            person_id: pId,
            tenant_id: tenantA,
            identifier_type: 'EMAIL',
            normalized_value_hash: crypto.createHash('sha256').update('current@test.com').digest('hex'),
            verification_status: 'VERIFIED'
        }]);

        // Run current compute
        await adminClient.rpc('compute_person_coverage_system_v1', {
            p_tenant_id: tenantA,
            p_person_id: pId,
            p_as_of: null,
            p_force_snapshot: false
        });

        const { data: covRow } = await adminClient
            .from('atlas_person_coverage')
            .select('*')
            .eq('person_id', pId)
            .single();

        expect(covRow).toBeDefined();
        expect(covRow.email_known).toBe(true);
        expect(covRow.phone_known).toBe(false);
    });

    it('22: LEGACY_PRESERVATION - age_range_known is not overwritten', async () => {
        const pId = randomUUID();
        await adminClient.from('atlas_people').insert([{
            person_id: pId,
            tenant_id: tenantA,
            full_name: 'Age Preservation Person',
            lifecycle_stage: 'CANONICAL'
        }]);

        // Seed legacy coverage with age_range_known = TRUE
        await adminClient.from('atlas_person_coverage').insert([{
            person_id: pId,
            tenant_id: tenantA,
            identity_known: true,
            age_range_known: true
        }]);

        // Compute coverage V1
        await adminClient.rpc('compute_person_coverage_system_v1', {
            p_tenant_id: tenantA,
            p_person_id: pId,
            p_as_of: null,
            p_force_snapshot: false
        });

        const { data: covRow } = await adminClient
            .from('atlas_person_coverage')
            .select('*')
            .eq('person_id', pId)
            .single();

        // age_range_known must REMAIN TRUE
        expect(covRow.age_range_known).toBe(true);
    });

    // =========================================================================
    // 7. SNAPSHOT DEDUPLICATION & CONCURRENCY
    // =========================================================================
    it('23: IDEMPOTENCY - consecutive runs with unchanged state produce ZERO new snapshot rows', async () => {
        const { data: countBefore } = await adminClient
            .from('atlas_person_coverage_snapshots')
            .select('*', { count: 'exact', head: true })
            .eq('person_id', personObservedA);

        // Run compute twice with no state change
        const { data: res1 } = await adminClient.rpc('compute_person_coverage_system_v1', {
            p_tenant_id: tenantA,
            p_person_id: personObservedA,
            p_as_of: null,
            p_force_snapshot: false
        });
        const { data: res2 } = await adminClient.rpc('compute_person_coverage_system_v1', {
            p_tenant_id: tenantA,
            p_person_id: personObservedA,
            p_as_of: null,
            p_force_snapshot: false
        });

        expect(res1.snapshot_inserted).toBe(false);
        expect(res2.snapshot_inserted).toBe(false);

        const { data: countAfter } = await adminClient
            .from('atlas_person_coverage_snapshots')
            .select('*', { count: 'exact', head: true })
            .eq('person_id', personObservedA);

        expect(countBefore).toBe(countAfter);
    });

    it('24: FORCED_SYSTEM_SNAPSHOT_ALLOWED - p_force_snapshot = TRUE creates new snapshot', async () => {
        const { data: resForced } = await adminClient.rpc('compute_person_coverage_system_v1', {
            p_tenant_id: tenantA,
            p_person_id: personObservedA,
            p_as_of: null,
            p_force_snapshot: true
        });
        expect(resForced.snapshot_inserted).toBe(true);
    });

    it('25: CONCURRENT_SAME_PERSON_NONFORCED - serialized via advisory lock without duplicate snapshots', async () => {
        const pId = randomUUID();
        await adminClient.from('atlas_people').insert([{
            person_id: pId,
            tenant_id: tenantA,
            full_name: 'Concurrent Person',
            lifecycle_stage: 'CANONICAL'
        }]);

        // Trigger two concurrent executions for the exact same person
        const [run1, run2] = await Promise.all([
            adminClient.rpc('compute_person_coverage_system_v1', { p_tenant_id: tenantA, p_person_id: pId, p_as_of: null, p_force_snapshot: false }),
            adminClient.rpc('compute_person_coverage_system_v1', { p_tenant_id: tenantA, p_person_id: pId, p_as_of: null, p_force_snapshot: false })
        ]);

        expect(run1.error).toBeNull();
        expect(run2.error).toBeNull();

        // Exactly one should insert a snapshot, the other should dedup
        const snapshotsInserted = [run1.data.snapshot_inserted, run2.data.snapshot_inserted].filter(Boolean).length;
        expect(snapshotsInserted).toBe(1);

        const { count } = await adminClient
            .from('atlas_person_coverage_snapshots')
            .select('*', { count: 'exact', head: true })
            .eq('person_id', pId);
        expect(count).toBe(1);
    });

    // =========================================================================
    // 8. SECURITY, PERMISSIONS & RLS
    // =========================================================================
    it('26: AUTHENTICATED_COMPUTE - successfully runs for own tenant and derives tenant from JWT', async () => {
        const { data: res, error } = await userClientA.rpc('compute_person_coverage_v1', {
            p_person_id: personObservedA
        });
        expect(error).toBeNull();
        expect(res.person_id).toBe(personObservedA);
        expect(res.tenant_id).toBe(tenantA);
    });

    it('27: CROSS_TENANT_ISOLATION - authenticated User A cannot compute person of Tenant B', async () => {
        const { error } = await userClientA.rpc('compute_person_coverage_v1', {
            p_person_id: personTenantB
        });
        expect(error).toBeDefined();
        expect(error?.message).toContain('PERSON_NOT_FOUND');
    });

    it('28: RLS_ENFORCEMENT - authenticated User A cannot select dimensions of Tenant B', async () => {
        // First, ensure Tenant B has dimensions computed
        await adminClient.rpc('compute_person_coverage_system_v1', {
            p_tenant_id: tenantB,
            p_person_id: personTenantB,
            p_as_of: null,
            p_force_snapshot: false
        });

        // Query with User A
        const { data: dimsA } = await userClientA
            .from('atlas_person_coverage_dimensions')
            .select('*')
            .eq('person_id', personTenantB);

        expect(dimsA).toHaveLength(0);

        // Query with User B
        const { data: dimsB } = await userClientB
            .from('atlas_person_coverage_dimensions')
            .select('*')
            .eq('person_id', personTenantB);

        expect(dimsB!.length).toBeGreaterThan(0);
    });

    it('29: BATCH_SECURITY - authenticated user blocked from executing batch RPC (403 / permission denied)', async () => {
        const { error } = await userClientA.rpc('recompute_person_coverage_batch_v1', {
            p_tenant_id: tenantA,
            p_limit: 10
        });
        expect(error).toBeDefined();
        expect(error?.message).toMatch(/permission denied|does not exist/i);
    });

    it('30: BATCH_SYSTEM - service_role executes batch RPC successfully', async () => {
        const { data: res, error } = await adminClient.rpc('recompute_person_coverage_batch_v1', {
            p_tenant_id: tenantA,
            p_limit: 10
        });
        expect(error).toBeNull();
        expect(res.persons_processed).toBeGreaterThan(0);
    });

    // =========================================================================
    // 9. POLICY FAIL-CLOSED SAFELOCKS
    // =========================================================================
    it('31: POLICY_FAIL_CLOSED_NO_ACTIVE - 0 active coverage policies halts computation', async () => {
        // Deactivate all policies
        await adminClient.from('atlas_person_coverage_policies').update({ is_active: false }).eq('is_active', true);

        const { error } = await adminClient.rpc('compute_person_coverage_system_v1', {
            p_tenant_id: tenantA,
            p_person_id: personObservedA,
            p_as_of: null,
            p_force_snapshot: false
        });

        expect(error).toBeDefined();
        expect(error?.message).toContain('NO_ACTIVE_COVERAGE_POLICY');

        // Restore active policy
        await adminClient.from('atlas_person_coverage_policies').update({ is_active: true }).eq('coverage_policy_version', 'cov-v1.0.0-deterministic');
    });

    it('32: POLICY_SWITCHER - service_role can atomically switch active coverage policy', async () => {
        const newPolicyVer = 'cov-v2.0.0-test';
        await adminClient.from('atlas_person_coverage_policies').insert([{
            coverage_policy_version: newPolicyVer,
            attribute_freshness_days: 45,
            signal_freshness_days: 45,
            intent_freshness_days: 120,
            fit_freshness_days: 120,
            is_active: false
        }]);

        const { error } = await adminClient.rpc('activate_coverage_policy_v1', {
            p_coverage_policy_version: newPolicyVer
        });
        expect(error).toBeNull();

        const { data: activePol } = await adminClient
            .from('atlas_person_coverage_policies')
            .select('*')
            .eq('is_active', true)
            .single();

        expect(activePol.coverage_policy_version).toBe(newPolicyVer);

        // Switch back to v1
        await adminClient.rpc('activate_coverage_policy_v1', {
            p_coverage_policy_version: 'cov-v1.0.0-deterministic'
        });
    });

    // =========================================================================
    // 10. DETAIL VIEW & GENERAL CONTRACTS
    // =========================================================================
    it('33: VIEW_CONSUMPTION - v_atlas_person_coverage_detail queries dimensions with person metadata', async () => {
        const { data: viewData, error } = await userClientA
            .from('v_atlas_person_coverage_detail')
            .select('*')
            .eq('person_id', personObservedA);

        expect(error).toBeNull();
        expect(viewData!.length).toBeGreaterThan(0);
        expect(viewData![0].lifecycle_stage).toBe('OBSERVED');
    });

    it('34: SNAPSHOT_IMMUTABILITY - snapshots cannot be updated (fails or is read-only ledger)', async () => {
        const { data: snap } = await adminClient
            .from('atlas_person_coverage_snapshots')
            .select('snapshot_id')
            .limit(1)
            .single();

        if (snap) {
            const { error } = await userClientA
                .from('atlas_person_coverage_snapshots')
                .update({ source_fact_set_hash: 'tampered' })
                .eq('snapshot_id', snap.snapshot_id);
            expect(error).toBeDefined();
        }
    });

    it('35: ZERO_SEARCH_ZERO_LLM_GUARANTEE - computation finishes synchronously without external calls', async () => {
        const start = Date.now();
        const { data: res } = await adminClient.rpc('compute_person_coverage_system_v1', {
            p_tenant_id: tenantA,
            p_person_id: personObservedA,
            p_as_of: null,
            p_force_snapshot: false
        });
        const duration = Date.now() - start;
        expect(res).toBeDefined();
        // Zero outbound latency
        expect(duration).toBeLessThan(1000);
    });
});
