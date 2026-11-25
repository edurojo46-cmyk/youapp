/**
 * ATLAS — RECURSIVE ECOSYSTEM HARVESTER TYPES
 * Transforms Tesla Wheel from ONE WINNER = ONE URL to ONE WINNER = ONE PUBLIC ECOSYSTEM
 */

import type { PublicEmailContact } from '../atlasIndustrialEmail/types.ts';

export type EcosystemProtocol =
  | 'HTML_RECURSIVE'
  | 'SITEMAP'
  | 'CKAN'
  | 'OAI_PMH'
  | 'REST'
  | 'CSV_JSON';

export interface FrontierUrl {
  url: string;
  depth: number;
  priorityScore: number;
  discoveredFrom: string;
}

export interface EcosystemJob {
  ecosystemId: string;
  sourceFamily: string;
  rootUrl: string;
  domain: string;
  sector: string;
  jurisdiction: string;
  protocol: EcosystemProtocol;
  maxPages: number;
  maxDepth: number;
  
  // State
  frontier: FrontierUrl[];
  visited: Set<string>;
  discoveredUrls: Set<string>;
  
  // Metrics
  reachableUrlsDiscovered: number;
  urlsHarvested: number;
  productivePages: number;
  rawEmailsHarvested: number;
  uniqueEmails: Set<string>;
  rawTrueNetNewCount: number;
  preexistingInDbCount: number;
  certifiedTrueNetNewCount: number;
  
  // Protocol specific cursors
  paginationCursor?: string | number;
  hasMorePages: boolean;
  isExhausted: boolean;
  stopReason?: string;
  
  startedAt?: number;
  completedAt?: number;
}

export interface HarvestedPageResult {
  url: string;
  httpStatus: number;
  latencyMs: number;
  bytesReceived: number;
  discoveredLinks: string[];
  extractedEmails: string[];
  validEmails: string[];
  netNewEmails: string[];
}

export interface EcosystemHarvestReport {
  ecosystemId: string;
  domain: string;
  protocol: EcosystemProtocol;
  reachableUrlsDiscovered: number;
  urlsHarvested: number;
  harvestCoverage: number;
  productivePages: number;
  productivePagesLeUrlsHarvested: boolean;
  rawEmailsHarvested: number;
  uniqueEmailsHarvested: number;
  rawTrueNetNewFound: number;
  preexistingInDb: number;
  certifiedTrueNetNew: number;
  missionQualified: number;
  persisted: number;
  searchable: number;
  unaccountedEmails: number;
  estimatedSupply: number;
  realizedSupply: number;
  realizationRatio: number;
  industrialWinnerScore: number;
  durationMs: number;
  isExhausted: boolean;
  stopReason: string;
}
