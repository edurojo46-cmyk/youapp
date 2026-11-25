/**
 * ATLAS SOURCE GENOME V1
 * Module: AtlasSourceGenome.ts
 * Path: src/lib/atlas/sources/AtlasSourceGenome.ts
 * 
 * Core entity model for Source Genome V1.
 * Unifies Source Knowledge, Routes, and Performance Memory.
 * 
 * Architectural Invariant:
 * Genome != Evidence
 * Genome != Truth
 * Genome != Result
 * Genome learns WHERE to look, WHAT can be obtained, and WHAT yield was observed.
 */

import type { AtlasSourceCapability } from './AtlasSourceCapability.ts';
import type { MetricNature } from './AtlasSourcePerformance.ts';

export type SourceStatus = 
  | 'ACTIVE' 
  | 'DEGRADED' 
  | 'QUARANTINED' 
  | 'DISCOVERED_NOT_EXECUTABLE';

export type CostClass = 'FREE' | 'LOW' | 'MEDIUM' | 'HIGH';

export interface AtlasSource {
  source_id: string;
  source_family: string;
  domain: string;
  access_method: string;
  format: string;

  entity_types: string[];
  geo_coverage: string[];
  attributes: string[];

  supports_person: boolean;
  supports_company: boolean;
  supports_email: boolean;
  supports_phone: boolean;
  supports_linkedin: boolean;
  supports_geo_levels: string[];

  quality_score: number;
  quality_nature: MetricNature;
  yield_history: number[];
  yield_nature: MetricNature;
  success_rate: number | null;
  success_rate_nature: MetricNature;
  latency: number | null;
  latency_nature: MetricNature;
  cost_class: CostClass;

  first_seen: string;
  last_seen: string;
  last_probe: string | null;
  last_success: string | null;

  status: SourceStatus;
  physical_origin?: string;
  source_exists_physically?: boolean;
}

export interface AtlasSourceRoute {
  route_id: string;
  source_id: string;
  endpoint: string;
  adapter_id: string;
  capabilities: AtlasSourceCapability;
  executable: boolean;
  last_probe: string | null;
  yield: number | null;
  yield_nature: MetricNature;
  attempts: number;
  errors: string[];
  cost_class?: CostClass;
  latency?: number | null;
  quality_score?: number;
  physical_origin?: string;
  source_exists_physically?: boolean;
}

export interface RankedRouteMatch {
  route: AtlasSourceRoute;
  source: AtlasSource;
  score: number;
  reasons: string[];
}

/**
 * FUTURE-PROOF STUB INTERFACES (Preparation only; not executed in V1)
 */
export interface ISourceFactory {
  createSourceCandidate(domain: string, discoveryTrace: any): Promise<AtlasSource>;
  synthesizeRoutes(source: AtlasSource): Promise<AtlasSourceRoute[]>;
}

export interface ITruthGraph {
  corroborateFact(entityId: string, attribute: string, value: any, provenance: string): Promise<boolean>;
  getAuthorityConfidence(entityId: string): number;
}

export interface ITemporalGraph {
  trackStateTransition(entityId: string, field: string, oldValue: any, newValue: any, observedAt: string): void;
  getHistoricalObservation(entityId: string, timestamp: string): any;
}

export interface IOpportunityEngine {
  evaluateCommercialIntent(entityId: string, signalDelta: any): { opportunityScore: number; reason: string };
}
