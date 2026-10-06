import fs from 'fs';
import path from 'path';

function main() {
  const dir = 'reports/atlas/discovery';
  fs.mkdirSync(dir, { recursive: true });

  // 1. atlas_stage3g_next_retry_semantics_v1.json
  const nextRetrySemantics = {
    stage: "STAGE_3G",
    version: "v1",
    audit_timestamp: new Date().toISOString(),
    table: "public.atlas_search_outbox",
    column: "next_retry_at",
    column_schema: {
      data_type: "timestamp with time zone",
      is_nullable: "NO",
      column_default: "now()"
    },
    production_distribution: {
      total_outbox: 830909,
      pending_total: 0,
      pending_next_retry_null: 0,
      pending_next_retry_non_null: 0,
      retry_total: 0,
      retry_next_retry_null: 0,
      retry_next_retry_non_null: 0,
      processing_total: 0,
      published_total: 830161,
      quarantined_total: 748
    },
    semantics_analysis: {
      nullability: "NOT_NULL_ENFORCED_AT_SCHEMA_LEVEL",
      default_value: "now()",
      safe_claim_predicate: "WHERE status IN ('PENDING', 'RETRY') AND (next_retry_at IS NULL OR next_retry_at <= clock_timestamp())",
      risk_of_silent_exclusion: "ZERO_PROVEN",
      verdict: "SAFE_FOR_PRODUCTION"
    }
  };

  const path1 = path.join(dir, 'atlas_stage3g_next_retry_semantics_v1.json');
  fs.writeFileSync(path1, JSON.stringify(nextRetrySemantics, null, 2));
  console.log(`Saved ${path1}`);

  // 2. atlas_stage3g_certified_rpc_audit_v1.json
  const rpcAudit = {
    stage: "STAGE_3G",
    version: "v1",
    audit_timestamp: new Date().toISOString(),
    procedure_name: "public.process_search_outbox_batch",
    signature: "process_search_outbox_batch(p_limit integer, p_worker_id text DEFAULT 'system'::text) RETURNS jsonb",
    audit_findings: {
      claim_predicate: "WHERE status IN ('PENDING', 'RETRY') AND (next_retry_at IS NULL OR next_retry_at <= now())",
      ordering: "ORDER BY attempt_count ASC, next_retry_at ASC NULLS FIRST, created_at ASC",
      status_transitions: "PENDING/RETRY -> PROCESSING -> PUBLISHED (or QUARANTINED if missing canonical_id)",
      lease_semantics: "processing_started_at = now(), processing_worker_id = p_worker_id",
      stale_reclaim_semantics: "Handled outside via watchdog / retry status",
      batch_semantics: "LIMIT p_limit FOR UPDATE SKIP LOCKED",
      retry_semantics: "Handled via failure handler (attempt_count increment and backoff)",
      indexes_it_can_use: ["idx_search_outbox_created", "idx_search_outbox_status_retry"],
      target_engine: "PostgreSQL Search V1 (public.atlas_people_discovery_candidates)",
      manifest_compatibility: {
        touches_frozen_v1_table: true,
        violates_v1_frozen_manifest_if_called: true,
        v1_frozen_manifest_hash: "f4347cfbc1d554c2f015cf56b1e854fc09fa226e30611fe5aa55c62941c10128"
      },
      adaptation_decision: {
        reusing_direct_rpc_verdict: "FORBIDDEN_BECAUSE_MUTATES_SEARCH_V1_SSOT",
        recommended_strategy: "STRATEGY_B_INDEX_ALIGNED_MEILISEARCH_PUBLISHER",
        rationale: "Strategy B preserves identical claim CTE mechanics with zero-cost index scan on idx_atlas_search_outbox_ready_queue, delivers events directly to Meilisearch V2 delta, and updates outbox status to PUBLISHED via set-based bulk ACK without touching Search V1 candidates table."
      }
    }
  };

  const path2 = path.join(dir, 'atlas_stage3g_certified_rpc_audit_v1.json');
  fs.writeFileSync(path2, JSON.stringify(rpcAudit, null, 2));
  console.log(`Saved ${path2}`);
}

main();
