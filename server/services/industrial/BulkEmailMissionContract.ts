/**
 * ATLAS BULK EMAIL MISSION CONTRACT
 * @server/services/industrial/BulkEmailMissionContract.ts
 *
 * Defines the thin mission contract between the Atlas Mission Architecture
 * and the frozen Industrial Email Bulk Engine.
 */

export interface BulkEmailMissionContract {
  mission_id: string;
  objective: string;
  geography?: string;
  target_count: number;
  allowed_source_roles?: string[];
  public_observed_only: boolean; // INVARIANT: Must be true in production
  external_cost_budget?: number;
  persistence_mode?: 'CORE_TABLES' | 'TEST_DRY_RUN';
}

export interface BulkEmailExecutionResult {
  mission_id: string;
  router_selected_engine: 'BULK_EMAIL_ACQUISITION';
  tesla_wheel_called: boolean;
  source: string;
  public_observed: number;

  // Engine-internal metrics (relative to historical T0 57k snapshot)
  engine_new_to_t0: number;
  engine_duplicates: number;

  // Current Atlas metrics (validated against active 558k DB authority)
  atlas_duplicates: number;
  true_new_to_atlas: number;

  // Separated persistence metrics
  ledger_persisted: number;
  canonically_persisted: number;
  authority_persisted: number;
  search_projection_persisted: number;

  // Actual searchability
  actually_searchable: number;

  duration_ms: number;
  status: 'COMPLETED' | 'FRONTIER_EXHAUSTED' | 'TARGET_REACHED';
}
