import { SupabaseClient } from '@supabase/supabase-js';
import { calculateProductFit } from './ProductFitEngine';
import { AtlasBehaviorEvent, AtlasInterestState, AtlasIntentState, AtlasPersonContext, AtlasProduct, AtlasProductFitPolicy, AtlasProductOffer } from './types';

export async function recalculatePersonProductFit(
  supabaseClient: SupabaseClient,
  tenant_id: string,
  person_id: string,
  product_id: string,
  offer_id: string,
  context: AtlasPersonContext
): Promise<void> {
  let retries = 0;
  while (retries < 5) {
    try {
      const evaluationTime = new Date().toISOString();

      // Load Active Policy
      const { data: policyData, error: policyError } = await supabaseClient
        .from('atlas_product_fit_policies')
        .select('*')
        .eq('status', 'ACTIVE')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (policyError || !policyData) {
        throw new Error('Active product fit policy not found');
      }

      const policy = policyData as AtlasProductFitPolicy;

      // Load Product & Offer
      const { data: offerData, error: offerError } = await supabaseClient
        .from('atlas_product_offers')
        .select(`
          *,
          atlas_products (*)
        `)
        .eq('offer_id', offer_id)
        .eq('tenant_id', tenant_id)
        .single();

      if (offerError || !offerData || !offerData.atlas_products) {
        throw new Error(`Offer or Product not found: ${offer_id}`);
      }

      const offer = offerData as AtlasProductOffer;
      const product = offerData.atlas_products as AtlasProduct;

      // Load Interest and Intent states for this specific topic
      const topic = product.category;
      
      const { data: interestData } = await supabaseClient
        .from('atlas_person_interest_state')
        .select('*')
        .eq('tenant_id', tenant_id)
        .eq('person_id', person_id)
        .eq('topic', topic)
        .single();

      const { data: intentData } = await supabaseClient
        .from('atlas_person_intent_state')
        .select('*')
        .eq('tenant_id', tenant_id)
        .eq('person_id', person_id)
        .eq('topic', topic)
        .eq('product_ref', product_id)
        .single();
        
      // If specific intent doesn't exist, try topic intent
      let finalIntentData = intentData;
      if (!finalIntentData) {
        const { data: topicIntentData } = await supabaseClient
          .from('atlas_person_intent_state')
          .select('*')
          .eq('tenant_id', tenant_id)
          .eq('person_id', person_id)
          .eq('topic', topic)
          .eq('product_ref', '*')
          .single();
        finalIntentData = topicIntentData;
      }

      // Load all behavior events
      const { data: eventsData } = await supabaseClient
        .from('atlas_person_behavior_events')
        .select('*')
        .eq('tenant_id', tenant_id)
        .eq('person_id', person_id);
        
      const events = (eventsData || []) as AtlasBehaviorEvent[];

      // Calculate Product Fit
      const fitState = calculateProductFit(
        tenant_id,
        person_id,
        product,
        offer,
        interestData as AtlasInterestState | null,
        finalIntentData as AtlasIntentState | null,
        events,
        context,
        policy,
        evaluationTime
      );

      const { error: upsertError } = await supabaseClient
        .from('atlas_person_product_fit_state')
        .upsert({
          tenant_id: fitState.tenant_id,
          person_id: fitState.person_id,
          product_id: fitState.product_id,
          offer_id: fitState.offer_id,
          context_hash: fitState.context_hash,
          fit_score: fitState.fit_score,
          fit_level: fitState.fit_level,
          component_scores: fitState.component_scores,
          reason_codes: fitState.reason_codes,
          coverage: fitState.coverage,
          evidence_count: fitState.evidence_count,
          policy_version: fitState.policy_version,
          input_snapshot_hash: fitState.input_snapshot_hash,
          evidence_snapshot_hash: fitState.evidence_snapshot_hash,
          calculated_at: fitState.calculated_at,
          expires_at: fitState.expires_at
        }, { onConflict: 'tenant_id, person_id, product_id, offer_id' });

      if (upsertError) {
        if (upsertError.message?.includes('Concurrency conflict') || upsertError.code === 'P0001') {
          throw new Error('Concurrency conflict in Product Fit Service');
        }
        throw upsertError;
      }
      break; // Success!
    } catch (err: any) {
      if (err?.message?.includes('Concurrency conflict')) {
        retries++;
        if (retries >= 5) {
          throw new Error(`Failed to recalculate fit state after 5 retries due to high concurrency for ${person_id}`);
        }
        await new Promise(r => setTimeout(r, 50 + Math.random() * 100));
        continue; // Retry the full loop
      }
      throw err;
    }
  }
}
