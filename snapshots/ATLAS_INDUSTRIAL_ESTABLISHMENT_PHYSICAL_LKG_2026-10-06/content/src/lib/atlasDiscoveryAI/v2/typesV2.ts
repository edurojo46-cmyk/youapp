/**
 * typesV2.ts — Definiciones de Tipos para Atlas Discovery AI V2
 */

import type { DiscoveryChannel, DiscoveryPlan, DiscoveryRequest } from '../types';

export interface GraphGap {
  entityId: string;
  entityName: string;
  category: 'music' | 'interview' | 'news' | 'documentary' | 'culture';
  weakEra?: string;          // e.g. "1980-1987"
  missingWorkTypes: string[]; // e.g. ["entrevista_tv", "recital_vivo", "acustico"]
  urgencyScore: number;       // 0.0 to 1.0
  proactiveSuggestedKeywords: string[];
}

export interface SearchCluster {
  clusterId: string;
  clusterTopic: string;        // e.g. "Spinetta TV histórica década 80"
  primaryEntity: string;
  relatedQueries: string[];    // Array of queries in this cluster
  accumulatedGaps: number;
  firstSeenAt: number;
  lastSeenAt: number;
  missionAssigned?: string;
}

export interface SourcePerformanceRecord {
  channel: DiscoveryChannel;
  publisherId: string;
  publisherName: string;
  sampleSize: number;                   // Total missions executed on this source
  totalScanned: number;                 // Total reference candidates inspected
  netNew: number;                       // Net-new physical assets persisted
  historicalYieldRatio: number;         // netNew / totalScanned
  noveltyScore: number;                 // 0.0 to 1.0 (unseen vs repeated ratio)
  rolling7dYield: number;               // 7-day rolling window yield
  rolling30dYield: number;              // 30-day rolling window yield
  confidence: number;                   // Statistical confidence based on sampleSize
  freshnessWeight: number;              // Temporal decay factor (1.0 = recent, degrades to 0.4)
  effectiveScore: number;               // yield * confidence * freshnessWeight
  reliabilityScore: number;             // 0.0 to 1.0
  lastHarvestedAt: string;              // ISO timestamp
}

export type ResidualGapReason =
  | 'freshness_realtime'          // Events/breaking in last hours
  | 'entity_missing'              // Unindexed entity/artist
  | 'work_missing'                // Specific work not in catalog
  | 'archive_deep_cut'            // Rare 70s/80s bootleg or unreleased reel
  | 'provider_unavailable'        // Restricted/geoblocked/exclusive
  | 'metadata_weak'               // Misleading title or missing tags
  | 'ranking_failure'             // Candidate in Atlas but scored low
  | 'no_known_open_source'        // No permissible open web source exists
  | 'genuinely_unavailable';      // Lost media / nonexistent

export interface ResidualGapItem {
  query: string;
  category: 'easy' | 'medium' | 'difficult' | 'longtail';
  detectedAtlasCoverage: number;
  funnelFinalCount: number;
  primaryReason: ResidualGapReason;
  rootCauseDescription: string;
  recommendedV3Remedy: string;
}

export interface ResidualGapAuditReport {
  totalResidualGaps: number;
  targetConversionCount: number;       // 42 queries to reach 95%
  distributionByReason: Record<ResidualGapReason, number>;
  topActionableRemedies: Array<{ reason: ResidualGapReason; count: number; percentage: number; remedy: string }>;
}

export interface DiscoveryPlanV2 extends DiscoveryPlan {
  version: 'v2';
  clusterId?: string;
  clusterQueriesAffected: number;
  graphGapOrigin?: boolean;
  sourceEmpiricalWeights: Record<string, number>;
}

