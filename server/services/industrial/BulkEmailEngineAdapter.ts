/**
 * ATLAS BULK EMAIL ENGINE ADAPTER
 * @server/services/industrial/BulkEmailEngineAdapter.ts
 *
 * Thin adapter connecting the new Atlas mission architecture to the
 * frozen historical bulk email engine (IndustrialEmailTeslaWheel).
 *
 * STRICT INVARIANTS:
 * - DO NOT MODIFY TESLA WHEEL INTERNAL ENGINE.
 * - Treat src/lib/atlasIndustrialEmail/ as protected frozen black box.
 * - PRODUCTION_BULK_EMAIL -> GENERATED_EMAILS = 0, INFERRED_EMAILS = 0.
 * - public_observed_only = TRUE.
 * - Uses BulkSourceFrontierCoordinator for external source continuation.
 * - Uses CurrentAtlasEmailAuthorityGate to evaluate true novelty against active Atlas DB.
 * - Never conflates ENGINE_NEW_TO_T0 with TRUE_NET_NEW_TO_ATLAS.
 * - Distinguishes LEDGER_PERSISTED vs CANONICALLY_PERSISTED vs AUTHORITY_PERSISTED.
 */

import type pg from 'pg';
import type { BulkEmailMissionContract, BulkEmailExecutionResult } from './BulkEmailMissionContract.ts';
import { BulkSourceFrontierCoordinator } from './BulkSourceFrontierCoordinator.ts';

export class BulkEmailEngineAdapter {
  private dbPool: pg.Pool;
  private coordinator: BulkSourceFrontierCoordinator;

  constructor(dbPool: pg.Pool) {
    this.dbPool = dbPool;
    this.coordinator = new BulkSourceFrontierCoordinator(dbPool);
  }

  /**
   * Executes a bulk email acquisition mission through the frozen Tesla Wheel engine,
   * coordinating bounded source continuation outside the engine and applying the
   * Current Atlas Authority Gate to translate historical outcomes into strict current Atlas truth.
   */
  public async executeMission(contract: BulkEmailMissionContract): Promise<BulkEmailExecutionResult> {
    const t0 = Date.now();

    // 1. Strict Contract Validation
    if (contract.public_observed_only !== true) {
      throw new Error('CONSTITUTIONAL_SAFETY_BLOCK: public_observed_only must be true for production bulk acquisition.');
    }

    const target = Math.max(1, Math.min(contract.target_count || 100, 100000));

    // 2. Mark mission as RUNNING in Atlas Core Mission Ledger if mission_id is provided
    if (contract.mission_id) {
      await this.dbPool.query(`
        UPDATE public.atlas_discovery_missions
        SET status = 'RUNNING',
            updated_at = NOW()
        WHERE mission_id = $1;
      `, [contract.mission_id]);
    }

    // 3. Execute bounded source continuation via external coordinator
    const coordResult = await this.coordinator.executeContinuation({
      target,
      missionId: contract.mission_id
    });

    const durationMs = Date.now() - t0;

    // 4. Update Mission Ledger in public.atlas_discovery_missions
    if (contract.mission_id) {
      await this.dbPool.query(`
        UPDATE public.atlas_discovery_missions
        SET status = 'COMPLETED',
            terminal_reason = $2,
            certified_new_searchable = $3,
            true_net_new_count = $3,
            duplicate_existing_count = $4,
            scanned_count = $5,
            updated_at = NOW()
        WHERE mission_id = $1;
      `, [
        contract.mission_id,
        coordResult.terminal_reason,
        coordResult.total_true_net_new_to_atlas,
        coordResult.total_atlas_duplicates,
        coordResult.total_public_observed
      ]);
    }

    const sourceNames = coordResult.source_results.map(s => s.source_id).join(' -> ');

    return {
      mission_id: contract.mission_id,
      router_selected_engine: 'BULK_EMAIL_ACQUISITION',
      tesla_wheel_called: true,
      source: sourceNames || 'BULK_SOURCE_FRONTIER',
      public_observed: coordResult.total_public_observed,
      engine_new_to_t0: coordResult.total_engine_new_to_t0,
      engine_duplicates: coordResult.total_atlas_duplicates - (coordResult.total_engine_new_to_t0 - coordResult.total_true_net_new_to_atlas),
      atlas_duplicates: coordResult.total_atlas_duplicates,
      true_new_to_atlas: coordResult.total_true_net_new_to_atlas,
      ledger_persisted: coordResult.total_ledger_persisted,
      canonically_persisted: coordResult.total_canonically_persisted,
      authority_persisted: coordResult.total_authority_persisted,
      search_projection_persisted: 0,
      actually_searchable: 0,
      duration_ms: durationMs,
      status: coordResult.target_reached ? 'TARGET_REACHED' : 'FRONTIER_EXHAUSTED'
    };
  }
}
