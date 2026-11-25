import { SimulationAttemptStatus, SimulationFaultProfile } from './types';

export class SimulationLifecycle {
  
  /**
   * Deterministically maps a requested fault profile into a terminal simulated outcome.
   * This logic proves we handle all bounds correctly WITHOUT real networks.
   */
  static resolveFaultProfile(profile: SimulationFaultProfile): { 
    terminal_status: SimulationAttemptStatus | null, 
    simulated_provider_id: string | null 
  } {
    switch (profile) {
      case 'ACCEPT':
        return { terminal_status: 'SIMULATED_ACCEPTED', simulated_provider_id: `sim_accepted_${Date.now()}` };
      
      case 'FAIL_PRE_ACCEPT':
        return { terminal_status: 'SIMULATED_FAILED_PRE_ACCEPT', simulated_provider_id: null };
      
      case 'TIMEOUT_AFTER_BOUNDARY':
      case 'CONNECTION_RESET_AFTER_BOUNDARY':
      case 'UNKNOWN_OUTCOME':
        return { terminal_status: 'SIMULATED_AMBIGUOUS', simulated_provider_id: null };
      
      case 'CRASH_AFTER_ATTEMPTING':
        // Explicitly returns null. It crashes BEFORE resolving.
        return { terminal_status: null, simulated_provider_id: null };
      
      default:
        // Fail closed on unknown fault requests
        return { terminal_status: 'SIMULATED_FAILED_PRE_ACCEPT', simulated_provider_id: null };
    }
  }
}
