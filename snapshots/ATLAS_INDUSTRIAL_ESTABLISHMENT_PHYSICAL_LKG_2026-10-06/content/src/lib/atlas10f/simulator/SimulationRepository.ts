import { supabase } from '../../supabase';
import { PrepareSimulationResult, StartAttemptResult, CompleteAttemptResult, RecoverAttemptResult } from './types';

/**
 * Encapsulates the Database atomic RPC calls for 10F-B Execution Simulator.
 * By design, it delegates authorization and atomicity entirely to PostgreSQL.
 */
export class SimulationRepository {
  
  static async prepareSimulation(args: {
    logical_execution_identity: string;
    execution_request_id: string;
    action_type: string;
    channel: string;
    message_certification_id: string;
    certification_snapshot_hash: string;
    destination_hash: string;
    prepared_payload_hash: string;
    simulator_version: string;
  }): Promise<PrepareSimulationResult> {
    const { data, error } = await supabase.rpc('prepare_execution_simulation', {
      p_logical_execution_identity: args.logical_execution_identity,
      p_execution_request_id: args.execution_request_id,
      p_action_type: args.action_type,
      p_channel: args.channel,
      p_message_certification_id: args.message_certification_id,
      p_certification_snapshot_hash: args.certification_snapshot_hash,
      p_destination_hash: args.destination_hash,
      p_prepared_payload_hash: args.prepared_payload_hash,
      p_simulator_version: args.simulator_version
    });

    if (error) throw error;
    return data as PrepareSimulationResult;
  }

  static async startAttempt(args: {
    simulation_id: string;
    fault_profile: string;
    payload_hash: string;
    lease_seconds?: number;
  }): Promise<StartAttemptResult> {
    const { data, error } = await supabase.rpc('start_execution_simulation_attempt', {
      p_simulation_id: args.simulation_id,
      p_fault_profile: args.fault_profile,
      p_payload_hash: args.payload_hash,
      p_lease_seconds: args.lease_seconds ?? 30
    });

    if (error) throw error;
    return data as StartAttemptResult;
  }

  static async completeAttempt(args: {
    simulation_id: string;
    attempt_id: string;
    status: string;
    simulated_provider_id?: string;
    result_code?: string;
    reason_code?: string;
  }): Promise<CompleteAttemptResult> {
    const { data, error } = await supabase.rpc('complete_execution_simulation_attempt', {
      p_simulation_id: args.simulation_id,
      p_attempt_id: args.attempt_id,
      p_status: args.status,
      p_simulated_provider_id: args.simulated_provider_id ?? null,
      p_result_code: args.result_code ?? null,
      p_reason_code: args.reason_code ?? null
    });

    if (error) throw error;
    return data as CompleteAttemptResult;
  }

  static async recoverStaleAttempt(args: {
    simulation_id: string;
    attempt_id: string;
  }): Promise<RecoverAttemptResult> {
    const { data, error } = await supabase.rpc('recover_stale_simulation_attempt', {
      p_simulation_id: args.simulation_id,
      p_attempt_id: args.attempt_id
    });

    if (error) throw error;
    return data as RecoverAttemptResult;
  }
}
