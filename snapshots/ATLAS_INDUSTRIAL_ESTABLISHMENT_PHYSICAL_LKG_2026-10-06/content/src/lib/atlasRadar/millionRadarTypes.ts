/**
 * src/lib/atlasRadar/millionRadarTypes.ts
 * 
 * Type definitions for Atlas Million Radar, Source Brain V2,
 * Autonomous Aspirator, Depletion Predictor, and Discovery Frontier.
 */

export type SourceState =
  | 'RADAR_CANDIDATE'
  | 'PROBING'
  | 'HOT'
  | 'WARM'
  | 'COLD'
  | 'DEPLETING'
  | 'EXHAUSTED'
  | 'RATE_LIMITED'
  | 'BROKEN'
  | 'BLOCKED';

export type ProtocolType =
  | 'OAI_PMH'
  | 'CKAN'
  | 'REST_API'
  | 'OFFICIAL_REGISTRY'
  | 'SPARQL'
  | 'HTML_SCRAPE'
  | 'CSV_STREAM';

export interface RadarSourceCandidate {
  SOURCE_ID: string;
  DISCOVERY_ORIGIN: string;
  SOURCE_NAME: string;
  CANONICAL_URL: string;
  HOST: string;
  PROTOCOL: ProtocolType;
  GEOGRAPHIC_SCOPE: string;

  PUBLIC_ACCESS: boolean;
  PERMITTED_ACCESS: boolean;

  PERSON_LEVEL_CAPABLE: boolean;
  PARSER_AVAILABLE: boolean;

  RAW_RECORDS_ESTIMATE: number;

  SAMPLE_SIZE: number;
  PERSON_YIELD_RATIO: number;
  KNOWN_COLLISION_RATIO: number;
  TRUE_NET_NEW_RATIO: number;

  ESTIMATED_TRUE_NET_NEW_REMAINING: number;

  TRUE_NET_NEW_PER_REMOTE_SECOND: number;
  TRUE_NET_NEW_PER_REQUEST: number;

  P50_LATENCY: number;
  P95_LATENCY: number;

  RATE_LIMIT_429_RATE: number;
  SERVER_5XX_RATE: number;
  TIMEOUT_RATE: number;

  PAGINATION_TYPE: 'CURSOR' | 'PAGE' | 'OFFSET' | 'DATE_RANGE' | 'RESUMPTION_TOKEN' | 'STREAM';
  PAGINATION_DEPTH: string;

  SOURCE_STATE: SourceState;
  PROBE_CONFIDENCE: number; // 0.0 to 1.0

  // Source Brain ranking score
  SCORE_NET_NEW_SEC: number;

  // High-Capacity Entity Universe Strategy extensions
  ARCHETYPE?: SourceArchetype;
  META_SOURCE_TYPE?: MetaSourceType;
  ENTITY_UNIVERSE_SECTOR?: string;
  ENTITY_UNIVERSE_SIZE?: number;
  CONTACT_DENSITY?: number;
  EXPECTED_NET_NEW_RATE?: number;
  ACCESSIBILITY_SCORE?: number;
  EXTRACTION_SPEED_SCORE?: number;
  STRUCTURAL_DEPTH?: number;
  GLOBAL_OVERLAP_SAMPLED?: number;
  SOURCE_SATURATION?: number;
  SURFACE_COLLISION_DETECTED?: boolean;
  ALTERNATIVE_PAGINATION_URLS?: string[];
}

export type SourceArchetype = 
  | 'SURFACE_SOURCE' 
  | 'HIGH_CAPACITY_ENTITY_UNIVERSE' 
  | 'META_SOURCE';

export type MetaSourceType =
  | 'CATALOG_OF_CATALOGS'
  | 'DATA_PORTAL'
  | 'DATASET_INDEX'
  | 'API_INDEX'
  | 'REPOSITORY_INDEX'
  | 'SITEMAP_NETWORK'
  | 'DIRECTORY_OF_DIRECTORIES'
  | 'NONE';

export interface JurisdictionHeatMapEntry {
  JURISDICTION: string;
  KNOWN_HUMANS: number;
  DISCOVERED_NET_NEW: number;
  AVAILABLE_PERSON_SOURCES: number;
  UNEXPLORED_SOURCE_CANDIDATES: number;
  VERIFIED_NET_NEW_REMAINING: number;
  ESTIMATED_NET_NEW_REMAINING: number;
  CURRENT_NET_NEW_SEC: number;
}

export interface AspiratorWorker {
  id: number;
  assignedSourceId: string | null;
  state: 'IDLE' | 'BUSY' | 'COOLDOWN';
  lastHarvestAt: number;
  recordsHarvested: number;
  netNewHarvested: number;
  errors: number;
}

export interface DepletionMetrics {
  sourceId: string;
  currentNetNewSec: number;
  rolling60sNetNewSec: number;
  rolling300sNetNewSec: number;
  netNewPerPage: number;
  collisionRatioTrend: number; // Slope
  estimatedRemainingRecords: number;
  estimatedRemainingNetNew: number;
  secondsToExhaustion: number;
}

export interface DiscoveryFrontierState {
  sourceId: string;
  nextPage?: number;
  nextCursor?: string;
  nextOffset?: number;
  resumptionToken?: string | null;
  nextDate?: string;
  nextGeoPartition?: string;
  lastRecordId?: string;
  lastSuccessfulFetchAt?: string;
  lastProbeAt?: string;
  isExhausted: boolean;
}

export interface MillionFuelReserveSummary {
  TOTAL_VERIFIED_RESERVE: number;
  TOTAL_HIGH_CONFIDENCE_RESERVE: number;
  VERIFIED_REACHABLE_NET_NEW: number;
  CONFIDENCE_THRESHOLD: number;
  RESERVE_HEADROOM_RATIO: number; // e.g. 1.50 for 50% headroom
  MILLION_REACHABLE: boolean;
}
