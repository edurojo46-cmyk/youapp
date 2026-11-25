/**
 * ATLAS INDUCTION WORK GENERATORS V1
 * 
 * Modular work generators that inspect system state and decide if legitimate pending work exists.
 * Each generator outputs an actionable IndustrialJob or null.
 */

import { IndustrialJob, IndustrialQueueName } from '../AtlasIndustrialQueueOrchestrator';
import { AtlasRateLimitManager } from '../AtlasRateLimitManager';
import { AtlasFieldScore } from '../AtlasFieldScore';

export interface WorkGeneratorResult {
  generator_name: string;
  has_work: boolean;
  job?: Partial<IndustrialJob>;
  field_score: number;
  reason_codes: string[];
}

export class WorkGenerators {
  /**
   * 1. BIEP_NEXT_BATCH_GENERATOR
   * Evaluates if BIEP has unpersisted persons remaining.
   */
  public static generateBiepNextBatch(
    currentProcessed: number, 
    totalDatasetUnique: number = 354745,
    searchP99Ms: number = 212
  ): WorkGeneratorResult {
    const remaining = totalDatasetUnique - currentProcessed;
    if (remaining <= 0) {
      return {
        generator_name: 'BIEP_NEXT_BATCH_GENERATOR',
        has_work: false,
        field_score: 0,
        reason_codes: ['BIEP_DATASET_EXHAUSTED']
      };
    }

    const batchIndex = Math.floor(currentProcessed / 10000) + 1;
    const batchSize = Math.min(10000, remaining);

    const { score, reason_codes } = AtlasFieldScore.calculateFieldScore({
      queue_name: 'INGESTION_QUEUE',
      source_id: 'BIEP_APN',
      net_new_verified_yield: batchSize,
      identity_confidence: 1.0,
      source_authority: 1.0,
      freshness_score: 0.95,
      queue_backlog: remaining,
      source_value_score: 95,
      search_p99_ms: searchP99Ms,
      db_latency_ms: 25,
      error_rate: 0,
      is_rate_limited: false,
      external_cost_usd: 0,
      privacy_risk_factor: 0
    });

    return {
      generator_name: 'BIEP_NEXT_BATCH_GENERATOR',
      has_work: true,
      job: {
        job_id: `job_auto_biep_batch_${batchIndex}_${Date.now()}`,
        source_id: 'BIEP_APN',
        queue_name: 'INGESTION_QUEUE',
        job_type: 'AUTONOMOUS_BATCH_INGESTION',
        priority: 85,
        checkpoint: { batch_index: batchIndex, planned_size: batchSize, remaining_after: remaining - batchSize }
      },
      field_score: score,
      reason_codes: [`Pending unpersisted: ${remaining}`, ...reason_codes]
    };
  }

  /**
   * 2. CONICET_RESOLUTION_GENERATOR
   * Evaluates if CONICET candidates can be resolved.
   * Enforces strict Rate Limit Intelligence (skips if OpenAlex is 429 rate-limited).
   */
  public static generateConicetResolution(unresolvedCount: number): WorkGeneratorResult {
    const isAllowed = AtlasRateLimitManager.isSourceAllowed('OPENALEX');
    if (!isAllowed) {
      const status = AtlasRateLimitManager.getSourceStatus('OPENALEX');
      return {
        generator_name: 'CONICET_RESOLUTION_GENERATOR',
        has_work: false,
        field_score: 0,
        reason_codes: [
          `OPENALEX_RATE_LIMITED (${status.reason})`,
          `Cooldown remaining: ${status.cooldown_seconds_remaining}s`,
          `Next attempt: ${status.next_allowed_attempt_at}`
        ]
      };
    }

    if (unresolvedCount <= 0) {
      return {
        generator_name: 'CONICET_RESOLUTION_GENERATOR',
        has_work: false,
        field_score: 0,
        reason_codes: ['NO_UNRESOLVED_CONICET_CANDIDATES']
      };
    }

    const { score, reason_codes } = AtlasFieldScore.calculateFieldScore({
      queue_name: 'IDENTITY_RESOLUTION_QUEUE',
      source_id: 'CONICET_OAI_PMH',
      net_new_verified_yield: Math.min(250, unresolvedCount),
      identity_confidence: 0.9,
      source_authority: 0.9,
      freshness_score: 0.85,
      queue_backlog: unresolvedCount,
      source_value_score: 75,
      search_p99_ms: 250,
      db_latency_ms: 30,
      error_rate: 0,
      is_rate_limited: false,
      external_cost_usd: 0,
      privacy_risk_factor: 0
    });

    return {
      generator_name: 'CONICET_RESOLUTION_GENERATOR',
      has_work: true,
      job: {
        job_id: `job_auto_conicet_resolution_${Date.now()}`,
        source_id: 'CONICET_OAI_PMH',
        queue_name: 'IDENTITY_RESOLUTION_QUEUE',
        job_type: 'CONICET_CABA_DISAMBIGUATION',
        priority: 70,
        checkpoint: { limit: 250 }
      },
      field_score: score,
      reason_codes: [`Unresolved holdout: ${unresolvedCount}`, ...reason_codes]
    };
  }

  /**
   * 3. NEWS_REFRESH_GENERATOR
   * Evaluates if any of the 11 news portals require live signal refresh.
   */
  public static generateNewsRefresh(lastNewsFetchTimestampMs: number): WorkGeneratorResult {
    const elapsedMinutes = (Date.now() - lastNewsFetchTimestampMs) / 60000;
    const NEWS_TTL_MINUTES = 15; // short TTL as instructed

    if (elapsedMinutes < NEWS_TTL_MINUTES) {
      return {
        generator_name: 'NEWS_REFRESH_GENERATOR',
        has_work: false,
        field_score: 0,
        reason_codes: [`News cache fresh (age: ${elapsedMinutes.toFixed(1)} mins, TTL: ${NEWS_TTL_MINUTES} mins)`]
      };
    }

    const { score, reason_codes } = AtlasFieldScore.calculateFieldScore({
      queue_name: 'INDEX_REFRESH_QUEUE',
      source_id: 'ARG_NEWS_PORTALS',
      net_new_verified_yield: 50, // signals
      identity_confidence: 0.8,
      source_authority: 0.7,
      freshness_score: 1.0,
      queue_backlog: 11,
      source_value_score: 65,
      search_p99_ms: 250,
      db_latency_ms: 25,
      error_rate: 0,
      is_rate_limited: false,
      external_cost_usd: 0,
      privacy_risk_factor: 0
    });

    return {
      generator_name: 'NEWS_REFRESH_GENERATOR',
      has_work: true,
      job: {
        job_id: `job_auto_news_signal_refresh_${Date.now()}`,
        source_id: 'ARG_NEWS_PORTALS',
        queue_name: 'INDEX_REFRESH_QUEUE',
        job_type: 'NEWS_LIVE_QUERY_SIGNALS',
        priority: 60,
        checkpoint: { news_sources: ['CLARIN', 'INFOBAE', 'LA_NACION', 'TN', 'PERFIL', 'AMBITO', 'EL_CRONISTA', 'PAGINA_12', 'C5N', 'RADIO_MITRE', 'RADIO_RIVADAVIA'] }
      },
      field_score: score,
      reason_codes: [`News TTL expired (${elapsedMinutes.toFixed(1)}m > ${NEWS_TTL_MINUTES}m)`, ...reason_codes]
    };
  }

  /**
   * 4. INDEX_REFRESH_GENERATOR
   * Evaluates if index projection needs refresh due to search P99 or backlog.
   */
  public static generateIndexRefresh(searchP99Ms: number, identityMapCount: number, projectionCount: number): WorkGeneratorResult {
    const delta = identityMapCount - projectionCount;
    const isElevated = searchP99Ms > 800 || delta > 5000;

    if (!isElevated) {
      return {
        generator_name: 'INDEX_REFRESH_GENERATOR',
        has_work: false,
        field_score: 0,
        reason_codes: ['Search index healthy (P99 <= 800ms, projection synchronized)']
      };
    }

    const { score, reason_codes } = AtlasFieldScore.calculateFieldScore({
      queue_name: 'INDEX_REFRESH_QUEUE',
      source_id: 'SEARCH_PROJECTION',
      net_new_verified_yield: Math.max(1000, delta),
      identity_confidence: 1.0,
      source_authority: 1.0,
      freshness_score: 1.0,
      queue_backlog: delta,
      source_value_score: 85,
      search_p99_ms: searchP99Ms,
      db_latency_ms: 30,
      error_rate: 0,
      is_rate_limited: false,
      external_cost_usd: 0,
      privacy_risk_factor: 0
    });

    return {
      generator_name: 'INDEX_REFRESH_GENERATOR',
      has_work: true,
      job: {
        job_id: `job_auto_index_projection_refresh_${Date.now()}`,
        source_id: 'SEARCH_PROJECTION',
        queue_name: 'INDEX_REFRESH_QUEUE',
        job_type: 'PROJECTION_FAST_REFRESH',
        priority: 75,
        checkpoint: { search_p99_ms: searchP99Ms, delta_identities: delta }
      },
      field_score: score,
      reason_codes: [`Index slip detected: P99=${searchP99Ms}ms, Delta=${delta}`, ...reason_codes]
    };
  }

  /**
   * 5. AUDIT_GENERATOR
   * Periodic invariant audit job generator.
   */
  public static generateAuditJob(lastAuditTimestampMs: number): WorkGeneratorResult {
    const elapsedHours = (Date.now() - lastAuditTimestampMs) / 3600000;
    if (elapsedHours < 1) {
      return {
        generator_name: 'AUDIT_GENERATOR',
        has_work: false,
        field_score: 0,
        reason_codes: ['Recent audit valid (< 1h)']
      };
    }

    return {
      generator_name: 'AUDIT_GENERATOR',
      has_work: true,
      job: {
        job_id: `job_auto_invariant_audit_${Date.now()}`,
        source_id: 'INVARIANT_AUDITOR',
        queue_name: 'AUDIT_QUEUE',
        job_type: 'FULL_INVARIANT_AUDIT',
        priority: 50,
        checkpoint: { audit_targets: ['FALSE_MERGES', 'RAW_DNI_LEAK', 'CABA_FALSE_PROMOTION', 'SYNTHETIC_PERSON'] }
      },
      field_score: 45,
      reason_codes: [`Periodic invariant verification due (${elapsedHours.toFixed(1)}h)`]
    };
  }
}
