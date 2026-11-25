import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { calculatePersonState } from '../lib/atlasBrain/InterestIntentEngine';
import { AtlasBehaviorEvent, AtlasScoringPolicy } from '../lib/atlasBrain/types';
import { supabase } from '../lib/supabase';
import { recordBehaviorEvent } from '../lib/atlasBrain/InterestIntentService';

function generateRandomId() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const TEST_PERSON_ID = '00000000-0000-0000-0000-000000000002';

const mockPolicy: AtlasScoringPolicy = {
  policy_version: 'test-v1',
  weights_json: {
    INTEREST: {
      CONTENT_ENGAGEMENT: 5,
      PUBLIC_COMMENT: 10,
      PUBLIC_POST: 15,
      INTERNAL_SEARCH: 20,
      PRODUCT_VIEW: 20,
      PRICE_CHECK: 25,
      REQUEST_FOR_INFO: 30,
      CART_ACTIVITY: 35,
      PURCHASE: 40,
      REPEAT_PURCHASE: 50
    },
    INTENT: {
      CONTENT_ENGAGEMENT: 1,
      PUBLIC_COMMENT: 2,
      PUBLIC_POST: 5,
      INTERNAL_SEARCH: 15,
      PRODUCT_VIEW: 20,
      PRICE_CHECK: 30,
      REQUEST_FOR_INFO: 40,
      CART_ACTIVITY: 50,
      PURCHASE: 20,
      REPEAT_PURCHASE: 25
    }
  },
  decay_json: {
    half_life_days: {
      INTEREST: 90,
      INTENT: 14
    }
  },
  thresholds_json: {
    INTEREST: { LOW: 10, MEDIUM: 30, HIGH: 60 },
    INTENT: { LOW: 15, MEDIUM: 35, HIGH: 65 }
  }
};

describe('10P-B Interest and Intent Engine - UNIT', () => {
  const evalTime = '2026-09-06T12:00:00.000Z';

  it('1 PRODUCT_VIEW raises interest', () => {
    const events: AtlasBehaviorEvent[] = [{
      id: '1', tenant_id: TEST_TENANT_ID, person_id: TEST_PERSON_ID,
      event_type: 'PRODUCT_VIEW', topic: 'TANGO', polarity: 'POSITIVE',
      confidence: 1.0, observed_at: evalTime, event_hash: 'hash1',
      created_at: evalTime, source_type: 'web'
    }];
    const { interest, intent } = calculatePersonState(TEST_TENANT_ID, TEST_PERSON_ID, 'TANGO', null, events, mockPolicy, evalTime);
    
    // Interest: 20 -> LOW
    expect(interest.interest_score).toBe(20);
    expect(interest.interest_level).toBe('LOW');
    // Intent: 20 -> LOW
    expect(intent.intent_score).toBe(20);
    expect(intent.intent_level).toBe('LOW');
  });

  it('4 REQUEST_FOR_INFO raises intent strongly', () => {
    const events: AtlasBehaviorEvent[] = [{
      id: '1', tenant_id: TEST_TENANT_ID, person_id: TEST_PERSON_ID,
      event_type: 'REQUEST_FOR_INFO', topic: 'TANGO', polarity: 'POSITIVE',
      confidence: 1.0, observed_at: evalTime, event_hash: 'hash2',
      created_at: evalTime, source_type: 'web'
    }];
    const { intent } = calculatePersonState(TEST_TENANT_ID, TEST_PERSON_ID, 'TANGO', null, events, mockPolicy, evalTime);
    
    // Intent: 40 -> MEDIUM
    expect(intent.intent_score).toBe(40);
    expect(intent.intent_level).toBe('MEDIUM');
  });

  it('6 old evidence decays', () => {
    // Event is 14 days old. Intent half life is 14 days. Score should be halved.
    const oldEval = '2026-08-23T12:00:00.000Z'; // 14 days before evalTime
    const events: AtlasBehaviorEvent[] = [{
      id: '1', tenant_id: TEST_TENANT_ID, person_id: TEST_PERSON_ID,
      event_type: 'CART_ACTIVITY', topic: 'TANGO', polarity: 'POSITIVE',
      confidence: 1.0, observed_at: oldEval, event_hash: 'hash3',
      created_at: oldEval, source_type: 'web'
    }];
    const { intent } = calculatePersonState(TEST_TENANT_ID, TEST_PERSON_ID, 'TANGO', null, events, mockPolicy, evalTime);
    
    // Base is 50. Halved is 25.
    expect(intent.intent_score).toBe(25); 
  });

  it('7 historical purchase != current HIGH intent', () => {
    // 2 years old
    const veryOld = '2024-09-06T12:00:00.000Z'; 
    const events: AtlasBehaviorEvent[] = [{
      id: '1', tenant_id: TEST_TENANT_ID, person_id: TEST_PERSON_ID,
      event_type: 'PURCHASE', topic: 'TANGO', polarity: 'POSITIVE',
      confidence: 1.0, observed_at: veryOld, event_hash: 'hash4',
      created_at: veryOld, source_type: 'web'
    }];
    const { interest, intent } = calculatePersonState(TEST_TENANT_ID, TEST_PERSON_ID, 'TANGO', null, events, mockPolicy, evalTime);
    
    // Decay for 2 years (730 days). Interest half life 90 -> very small. Intent half life 14 -> ~0.
    expect(interest.interest_level).toBe('UNKNOWN'); // score approaches 0
    expect(intent.intent_level).toBe('UNKNOWN');
  });

  it('8 negative evidence reduces intent', () => {
    const events: AtlasBehaviorEvent[] = [
      {
        id: '1', tenant_id: TEST_TENANT_ID, person_id: TEST_PERSON_ID,
        event_type: 'CART_ACTIVITY', topic: 'TANGO', polarity: 'POSITIVE',
        confidence: 1.0, observed_at: evalTime, event_hash: 'hash5',
        created_at: evalTime, source_type: 'web'
      },
      {
        id: '2', tenant_id: TEST_TENANT_ID, person_id: TEST_PERSON_ID,
        event_type: 'PUBLIC_COMMENT', topic: 'TANGO', polarity: 'NEGATIVE',
        confidence: 1.0, observed_at: evalTime, event_hash: 'hash6',
        created_at: evalTime, source_type: 'web'
      }
    ];
    // CART_ACTIVITY intent = 50. PUBLIC_COMMENT intent = 2, with NEGATIVE multiplier (-2) = -4. Total 46.
    const { intent } = calculatePersonState(TEST_TENANT_ID, TEST_PERSON_ID, 'TANGO', null, events, mockPolicy, evalTime);
    expect(intent.intent_score).toBe(46);
  });
  
  it('16 deterministic replay', () => {
    const events: AtlasBehaviorEvent[] = [{
      id: '1', tenant_id: TEST_TENANT_ID, person_id: TEST_PERSON_ID,
      event_type: 'PRODUCT_VIEW', topic: 'TANGO', polarity: 'POSITIVE',
      confidence: 1.0, observed_at: evalTime, event_hash: 'hash1',
      created_at: evalTime, source_type: 'web'
    }];
    const r1 = calculatePersonState(TEST_TENANT_ID, TEST_PERSON_ID, 'TANGO', null, events, mockPolicy, evalTime);
    const r2 = calculatePersonState(TEST_TENANT_ID, TEST_PERSON_ID, 'TANGO', null, events, mockPolicy, evalTime);
    
    expect(r1.intent.intent_score).toBe(r2.intent.intent_score);
    expect(r1.intent.evidence_snapshot_hash).toBe(r2.intent.evidence_snapshot_hash);
  });
});

import { createGuardedTestClient as createClient } from '../lib/testDbGuard';

// Get URL from the existing supabase client (or env) and the secret key from env
const supabaseUrl = (typeof process !== 'undefined' && process.env.VITE_SUPABASE_URL) || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const supabaseServiceKey = (typeof process !== 'undefined' && process.env.SUPABASE_SECRET_KEY) || '';

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

describe('10P-B Interest and Intent Engine - REAL DB SMOKE', () => {
  // These tests require a real Supabase DB with the 10P-B schema applied.
  
  beforeAll(async () => {
    // Ensure test tenant and person exist, bypassing RLS using service role key
    const { error } = await supabaseAdmin.from('atlas_people').upsert({
      person_id: TEST_PERSON_ID,
      tenant_id: TEST_TENANT_ID,
      full_name: 'TEST PERSON',
      status: 'ACTIVE',
      lifecycle_stage: 'CANONICAL'
    });
    if (error) throw error;
  });

  afterAll(async () => {
    // Cleanup TEST TENANT data
    await supabaseAdmin.from('atlas_people').delete().eq('tenant_id', TEST_TENANT_ID);
    // Since atlas_people has cascade delete, behavior events and states should be deleted automatically.
  });

  it('saves an event and updates states atomically', async () => {
    const eventHash = generateRandomId();
    await recordBehaviorEvent(supabaseAdmin, TEST_TENANT_ID, TEST_PERSON_ID, {
      event_type: 'CART_ACTIVITY',
      topic: 'TANGO_SMOKE',
      source_type: 'TEST_SUITE',
      polarity: 'POSITIVE',
      confidence: 1.0,
      event_hash: eventHash,
      observed_at: new Date().toISOString()
    });

    const { data: intentData } = await supabaseAdmin
      .from('atlas_person_intent_state')
      .select('*')
      .eq('tenant_id', TEST_TENANT_ID)
      .eq('person_id', TEST_PERSON_ID)
      .eq('topic', 'TANGO_SMOKE')
      .single();

    expect(intentData).toBeTruthy();
    // 50 intent base for CART_ACTIVITY, so it should be MEDIUM at least.
    expect(intentData?.intent_score).toBeGreaterThanOrEqual(35);
  });

  it('handles concurrent events without losing updates (atomicity check)', async () => {
    
    // Repeat the test 3 times to ensure stability
    for (let i = 0; i < 3; i++) {
      const topicName = `CONCURRENCY_TEST_${i}`;
      
      const p1 = recordBehaviorEvent(supabaseAdmin, TEST_TENANT_ID, TEST_PERSON_ID, {
        event_type: 'PRICE_CHECK',
        topic: topicName,
        source_type: 'TEST',
        polarity: 'POSITIVE',
        confidence: 1.0,
        event_hash: generateRandomId(),
        observed_at: new Date().toISOString()
      });

      const p2 = recordBehaviorEvent(supabaseAdmin, TEST_TENANT_ID, TEST_PERSON_ID, {
        event_type: 'PRODUCT_VIEW',
        topic: topicName,
        source_type: 'TEST',
        polarity: 'POSITIVE',
        confidence: 1.0,
        event_hash: generateRandomId(),
        observed_at: new Date().toISOString()
      });

      await Promise.all([p1, p2]);

      // 1. Fetch ALL committed behavior events
      const { data: rawEvents } = await supabaseAdmin
        .from('atlas_person_behavior_events')
        .select('*')
        .eq('tenant_id', TEST_TENANT_ID)
        .eq('person_id', TEST_PERSON_ID)
        .eq('topic', topicName);

      expect(rawEvents?.length).toBe(2);

      // 2. Fetch the persisted final state
      const { data: intentData } = await supabaseAdmin
        .from('atlas_person_intent_state')
        .select('*')
        .eq('tenant_id', TEST_TENANT_ID)
        .eq('person_id', TEST_PERSON_ID)
        .eq('topic', topicName)
        .single();

      expect(intentData).toBeTruthy();
      
      // 3. Recompute from the exact events to verify truthfulness
      const { data: policyData } = await supabaseAdmin
        .from('atlas_scoring_policies')
        .select('*')
        .eq('status', 'ACTIVE')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
        
      const { intent: recomputedIntent } = calculatePersonState(
        TEST_TENANT_ID, 
        TEST_PERSON_ID, 
        topicName, 
        null, 
        rawEvents as any, 
        policyData as any, 
        new Date(intentData.calculated_at).toISOString() // Normalize to ensure 'Z' instead of '+00:00'
      );

      // 4. Assert
      expect(intentData?.evidence_count).toBe(2);
      expect(intentData?.evidence_snapshot_hash).toBe(recomputedIntent.evidence_snapshot_hash);
      expect(intentData?.intent_score).toBe(recomputedIntent.intent_score);
    }
  }, 30000);
});
