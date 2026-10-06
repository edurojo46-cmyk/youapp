import { SupabaseClient } from '@supabase/supabase-js';
import { calculatePersonState } from './InterestIntentEngine';
import { AtlasBehaviorEvent, AtlasScoringPolicy } from './types';

/**
 * Service to orchestrate the persistence and atomic update of Interest and Intent states.
 */
export async function recordBehaviorEvent(
  supabaseClient: SupabaseClient,
  tenant_id: string,
  person_id: string,
  event: Omit<AtlasBehaviorEvent, 'id' | 'created_at' | 'tenant_id' | 'person_id'>
): Promise<void> {
  
  // 1. Resolve Person (Identity Gate - must be ACTIVE/RESOLVED)
  const { data: personData, error: personError } = await supabaseClient
    .from('atlas_people')
    .select('status')
    .eq('person_id', person_id)
    .eq('tenant_id', tenant_id)
    .single();

  if (personError || !personData) {
    throw new Error(`Person not found or tenant mismatch: ${person_id}`);
  }

  if (personData.status !== 'ACTIVE') {
    throw new Error(`Person ${person_id} is not ACTIVE (status: ${personData.status}). Behavior event rejected.`);
  }

  // 2. Persist the raw behavior event
  const { data: insertedEvent, error: eventInsertError } = await supabaseClient
    .from('atlas_person_behavior_events')
    .insert({
      tenant_id,
      person_id,
      ...event
    })
    .select('*')
    .single();

  if (eventInsertError) {
    // If it's a unique constraint violation (event_hash duplicate), we can just ignore or proceed to recalculate
    if (eventInsertError.code !== '23505') {
      throw eventInsertError;
    }
  }

  // 3. Recalculate State with retry logic for concurrency conflicts
  let retries = 0;
  while (retries < 5) {
    try {
      await recalculatePersonState(supabaseClient, tenant_id, person_id, event.topic, event.product_ref || null);
      break; // Success
    } catch (err: any) {
      if (err?.message?.includes('Concurrency conflict') || err?.code === 'P0001') {
        retries++;
        if (retries >= 5) {
          throw new Error(`Failed to recalculate state after 5 retries due to high concurrency for ${person_id}`);
        }
        // Random backoff between 50ms and 150ms
        await new Promise(r => setTimeout(r, 50 + Math.random() * 100));
        continue;
      }
      throw err;
    }
  }
}

/**
 * Recalculates and atomically persists the Interest and Intent state for a given person and topic.
 */
export async function recalculatePersonState(
  supabaseClient: SupabaseClient,
  tenant_id: string,
  person_id: string,
  topic: string,
  product_ref: string | null = null
): Promise<void> {
  const evaluationTime = new Date().toISOString();

  // Load Active Policy
  const { data: policyData, error: policyError } = await supabaseClient
    .from('atlas_scoring_policies')
    .select('*')
    .eq('status', 'ACTIVE')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (policyError || !policyData) {
    throw new Error('Active scoring policy not found');
  }
  
  const policy = policyData as AtlasScoringPolicy;

  // Load all events for this person and topic
  const { data: eventsData, error: eventsError } = await supabaseClient
    .from('atlas_person_behavior_events')
    .select('*')
    .eq('tenant_id', tenant_id)
    .eq('person_id', person_id)
    .eq('topic', topic);

  if (eventsError) {
    throw eventsError;
  }

  const events = (eventsData || []) as AtlasBehaviorEvent[];

  // Calculate new state using deterministic engine
  const { interest, intent } = calculatePersonState(
    tenant_id,
    person_id,
    topic,
    product_ref,
    events,
    policy,
    evaluationTime
  );

  // Atomic Persist via Supabase Upsert
  // Upsert Interest State
  const { error: interestUpsertError } = await supabaseClient
    .from('atlas_person_interest_state')
    .upsert({
      tenant_id: interest.tenant_id,
      person_id: interest.person_id,
      topic: interest.topic,
      interest_level: interest.interest_level,
      interest_score: interest.interest_score,
      evidence_count: interest.evidence_count,
      last_signal_at: interest.last_signal_at,
      policy_version: interest.policy_version,
      evidence_snapshot_hash: interest.evidence_snapshot_hash,
      calculated_at: interest.calculated_at
    }, { onConflict: 'tenant_id, person_id, topic' });

  if (interestUpsertError) {
    throw interestUpsertError;
  }

  // Upsert Intent State
  const { error: intentUpsertError } = await supabaseClient
    .from('atlas_person_intent_state')
    .upsert({
      tenant_id: intent.tenant_id,
      person_id: intent.person_id,
      topic: intent.topic,
      product_ref: intent.product_ref,
      intent_level: intent.intent_level,
      intent_score: intent.intent_score,
      evidence_count: intent.evidence_count,
      last_signal_at: intent.last_signal_at,
      policy_version: intent.policy_version,
      evidence_snapshot_hash: intent.evidence_snapshot_hash,
      calculated_at: intent.calculated_at
    }, { onConflict: 'tenant_id, person_id, topic, product_ref' });

  if (intentUpsertError) {
    throw intentUpsertError;
  }
}
