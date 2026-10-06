import { supabase } from '../../supabase';
import { JitAuthorizationService } from '../jit/JitAuthorizationService';
import { JitAuthorizationRequest } from '../jit/types';
import { CanaryProviderBoundary, ProviderResult } from './ProviderBoundary';

export interface CanaryExecutionRequest {
  logical_execution_identity: string;
  execution_request_id: string; // Used as nba_id
  subject_type: any;
  subject_id: string;
  action_type: any;
  channel: string;
  message_certification_id: string;
  certification_snapshot_hash: string;
  destination_hash: string;
  prepared_payload_hash: string;
  email_hash: string;
  payload: any;
  cost_id: string;
  amount_reserved: number;
}

export class CanaryExecutionService {
  /**
   * Executes a controlled canary run.
   * Ensures exactly-once semantics, JIT verification, and budget control.
   */
  static async executeCanary(req: CanaryExecutionRequest, provider: CanaryProviderBoundary): Promise<ProviderResult> {
    
    // 1. JIT Pre-Flight
    const jitReq: any = { // Use any to bypass TS complaints in case of mismatch
      logical_execution_identity: req.logical_execution_identity,
      execution_request_id: req.execution_request_id,
      subject_type: req.subject_type,
      subject_id: req.subject_id,
      action_type: req.action_type,
      channel: req.channel,
      certification_id: req.message_certification_id,
      certification_hash: req.certification_snapshot_hash,
      destination_hash: req.destination_hash,
      prepared_payload_hash: req.prepared_payload_hash,
      email_hash: req.email_hash,
      nba_id: req.execution_request_id
    };

    const jitAuth = await JitAuthorizationService.authorize(jitReq);
    if (jitAuth.status !== 'AUTHORIZED') {
      const client = (process.env.SUPABASE_SECRET_KEY && process.env.VITE_SUPABASE_URL)
        ? (await import('@supabase/supabase-js')).createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY)
        : supabase;
      await client.from('atlas_execution_budget_reservations')
        .update({ status: 'RELEASED' })
        .eq('logical_execution_identity', req.logical_execution_identity);
      return { status: 'FAILED_PRE_ACCEPT', reason: `JIT_DENIED: ${jitAuth.status}` };
    }

    // 2. Final Boundary Transaction (Atomic Reserve & Enqueue Attempt)
    const { data: beginData, error: beginErr } = await supabase.rpc('begin_real_execution', {
      p_logical_execution_identity: req.logical_execution_identity,
      p_execution_request_id: req.execution_request_id,
      p_subject_type: req.subject_type,
      p_subject_id: req.subject_id,
      p_email_hash: req.email_hash,
      p_action_type: req.action_type,
      p_channel: req.channel,
      p_message_certification_id: req.message_certification_id,
      p_certification_snapshot_hash: req.certification_snapshot_hash,
      p_destination_hash: req.destination_hash,
      p_prepared_payload_hash: req.prepared_payload_hash,
      p_cost_id: req.cost_id,
      p_amount_reserved: req.amount_reserved
    });

    if (beginErr) throw beginErr;

    if (!beginData.success) {
      // Could be ALREADY_ACCEPTED, AMBIGUOUS_HOLD, or ACTIVE_ATTEMPT_EXISTS (Race lost)
      return { status: 'FAILED_PRE_ACCEPT', reason: beginData.reason };
    }

    const attemptId = beginData.attempt_id;

    // 3. Cross Provider Boundary
    let providerResult: ProviderResult;
    try {
      providerResult = await provider.execute(req.payload);
    } catch (e: any) {
      // Uncaught errors during boundary crossing default to AMBIGUOUS to be safe
      providerResult = { status: 'AMBIGUOUS', reason: e.message };
    }

    // 4. Complete Execution Transaction (Outcome & Budget Resolution)
    const { error: completeErr } = await supabase.rpc('complete_real_execution', {
      p_logical_execution_identity: req.logical_execution_identity,
      p_attempt_id: attemptId,
      p_outcome: providerResult.status,
      p_provider_message_id: providerResult.provider_message_id || null,
      p_error_details: providerResult.reason ? { reason: providerResult.reason } : null
    });

    if (completeErr) throw completeErr;

    return providerResult;
  }
}
