import { createHash } from 'crypto';
import { AtlasExecutionRequest } from '../types';
import { PlatformAdapter } from '../PlatformAdapter';
import { computeLogicalExecutionIdentity } from '../ExecutionIdentity';
import { SimulationRepository } from './SimulationRepository';
import { SimulationLifecycle } from './SimulationLifecycle';
import { SimulationFaultProfile, PrepareSimulationResult } from './types';

export class ExecutionSimulator {

  public static readonly VERSION = 'ATLAS_EXEC_SIM_V1';

  private static hashPayload(payload: any): string {
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  private static hashDestination(dest: any): string {
    return createHash('sha256').update(JSON.stringify(dest)).digest('hex');
  }

  /**
   * Step 1: Prepares the simulation idempotently.
   */
  static async prepare(
    request: AtlasExecutionRequest,
    adapter: PlatformAdapter<any>
  ): Promise<PrepareSimulationResult> {
    const logicalId = computeLogicalExecutionIdentity(request);
    const providerPayload = adapter.buildProviderPayload(request);
    
    return SimulationRepository.prepareSimulation({
      logical_execution_identity: logicalId,
      execution_request_id: request.execution_request_id,
      action_type: request.action_type,
      channel: request.channel,
      message_certification_id: request.message_certification_id,
      certification_snapshot_hash: request.certification_snapshot_hash,
      destination_hash: this.hashDestination(request.destination_ref),
      prepared_payload_hash: this.hashPayload(providerPayload),
      simulator_version: this.VERSION
    });
  }

  /**
   * Step 2: Executes a simulation attempt mechanically.
   */
  static async execute(
    simulationId: string,
    request: AtlasExecutionRequest,
    adapter: PlatformAdapter<any>,
    faultProfile: SimulationFaultProfile
  ) {
    const providerPayload = adapter.buildProviderPayload(request);
    const payloadHash = this.hashPayload(providerPayload);

    // 1. Create durable attempt (Must exist BEFORE outcome)
    const startRes = await SimulationRepository.startAttempt({
      simulation_id: simulationId,
      fault_profile: faultProfile,
      payload_hash: payloadHash,
      lease_seconds: 30
    });

    if (!startRes.success) {
      return { success: false, reason: startRes.reason, current_status: startRes.current_status };
    }

    const attemptId = startRes.attempt_id!;

    // 2. Resolve fault profile locally
    const resolution = SimulationLifecycle.resolveFaultProfile(faultProfile);

    // 3. Simulate CRASH_AFTER_ATTEMPTING by abandoning execution right here
    if (resolution.terminal_status === null) {
      return { success: true, simulated_crash: true, attempt_id: attemptId };
    }

    // 4. Complete terminal outcome durably
    const completeRes = await SimulationRepository.completeAttempt({
      simulation_id: simulationId,
      attempt_id: attemptId,
      status: resolution.terminal_status,
      simulated_provider_id: resolution.simulated_provider_id ?? undefined
    });

    if (!completeRes.success) {
      return { success: false, reason: completeRes.reason };
    }

    return { 
      success: true, 
      terminal_status: resolution.terminal_status, 
      simulated_provider_id: resolution.simulated_provider_id 
    };
  }
}
