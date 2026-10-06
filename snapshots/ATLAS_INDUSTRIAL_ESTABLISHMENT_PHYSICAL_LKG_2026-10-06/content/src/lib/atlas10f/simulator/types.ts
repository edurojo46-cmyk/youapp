export type SimulationAggregateStatus = 
  | 'PREPARED'
  | 'ATTEMPTING'
  | 'SIMULATED_ACCEPTED'
  | 'SIMULATED_FAILED_PRE_ACCEPT'
  | 'SIMULATED_AMBIGUOUS';

export type SimulationAttemptStatus = 
  | 'ATTEMPTING'
  | 'SIMULATED_ACCEPTED'
  | 'SIMULATED_FAILED_PRE_ACCEPT'
  | 'SIMULATED_AMBIGUOUS';

export type SimulationFaultProfile = 
  | 'ACCEPT'
  | 'FAIL_PRE_ACCEPT'
  | 'TIMEOUT_AFTER_BOUNDARY'
  | 'CONNECTION_RESET_AFTER_BOUNDARY'
  | 'CRASH_AFTER_ATTEMPTING'
  | 'UNKNOWN_OUTCOME';

export interface PrepareSimulationResult {
  success: boolean;
  simulation_id?: string;
  status?: SimulationAggregateStatus;
}

export interface StartAttemptResult {
  success: boolean;
  attempt_id?: string;
  attempt_no?: number;
  reason?: string;
  current_status?: string;
}

export interface CompleteAttemptResult {
  success: boolean;
  reason?: string;
}

export interface RecoverAttemptResult {
  success: boolean;
  reason?: string;
  recover_after?: string;
}
