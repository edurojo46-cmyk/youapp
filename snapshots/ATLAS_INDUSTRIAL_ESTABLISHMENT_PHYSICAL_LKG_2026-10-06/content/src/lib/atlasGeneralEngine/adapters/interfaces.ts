/**
 * ATLAS GENERAL OBJECTIVE INTELLIGENCE ENGINE V1
 * Module: Specialized Engine Adapter Interfaces (Section 16)
 * 
 * Strict Engine Isolation Invariants:
 * - Adapters expose capabilities WITHOUT leaking internal implementation.
 * - Adapters DO NOT mutate or reproduce specialized engine indexes, ranking, or identity resolution.
 * - PEOPLE SEARCH retains sole authority for human identity, canonical resolution, and people ranking.
 * - VIDEO SEARCH retains sole authority for video retrieval, ranking, and playback quality.
 */

import type { PersonSearchResultItem } from '../../search/AtlasPeopleSearchV2';

// ── 1. People Search Adapter Interface ──────────────────────
export interface PeopleSearchCriteria {
  query?: string;
  organization?: string;
  role?: string;
  geography?: string;
  source?: string;
  evidence_state?: 'ALL_ARGENTINA' | 'NATIONAL_SSOT' | 'ALL_CABA' | 'CANONICAL';
  page?: number;
  limit?: number;
}

export interface PersonEvidenceRecord {
  personId: string;
  displayName: string;
  sources: string[];
  evidenceBadges: string[];
  evidenceState: string;
  observedAt: string;
  rawProvenance: Record<string, any>;
}

export interface PersonResolutionResult {
  resolved: boolean;
  canonicalPersonId?: string;
  confidence: number;
  authoritativeEntityKey?: string;
}

export interface IPeopleSearchAdapter {
  searchPeople(criteria: PeopleSearchCriteria): Promise<PersonSearchResultItem[]>;
  getPersonEvidence(personId: string): Promise<PersonEvidenceRecord | null>;
  resolvePerson(candidate: { displayName: string; organization?: string }): Promise<PersonResolutionResult>;
}

// ── 2. Video Search Adapter Interface ───────────────────────
export interface VideoSearchCriteria {
  query: string;
  limit?: number;
  preferDocumentary?: boolean;
}

export interface VideoSearchResultItem {
  videoId: string;
  title: string;
  channelTitle: string;
  durationFormatted: string;
  viewCount: number;
  thumbnailUrl: string;
  mediaQualityScore: number;
  specializedRank: number;
  playable: boolean;
  publishedAt?: string;
}

export interface IVideoSearchAdapter {
  searchVideos(criteria: VideoSearchCriteria): Promise<VideoSearchResultItem[]>;
  getVideoDetails(videoId: string): Promise<VideoSearchResultItem | null>;
}

// ── 3. Organization Discovery Adapter Interface ─────────────
export interface OrganizationSearchCriteria {
  sectorTopics: string[];
  geography?: string;
  limit?: number;
}

export interface OrganizationResultItem {
  organizationId: string;
  name: string;
  cuit?: string;
  registrationNumber?: string;
  sector: string;
  activityDescription?: string;
  jurisdiction: string;
  sourceRegistry: string;
  verificationConfidence: number;
  observedAt: string;
  sourceUrl?: string;
}

export interface IOrganizationDiscoveryAdapter {
  searchOrganizations(criteria: OrganizationSearchCriteria): Promise<OrganizationResultItem[]>;
  getOrganizationEvidence(cuitOrKey: string): Promise<OrganizationResultItem | null>;
}

// ── 4. Source Discovery Adapter Interface ───────────────────
export interface SourceSearchCriteria {
  domainTopics: string[];
  geography?: string;
  limit?: number;
}

export interface SourceResultItem {
  sourceId: string;
  title: string;
  description: string;
  format: 'CSV' | 'JSON' | 'API' | 'REST_API' | 'CKAN' | 'HTML';
  url: string;
  publicAccessStatus: 'PUBLIC_OPEN' | 'PUBLIC_RESTRICTED';
  jurisdiction: string;
  estimatedScale: number;
  lastUpdated?: string;
  provenanceSource: string;
}

export interface ISourceDiscoveryAdapter {
  discoverSources(criteria: SourceSearchCriteria): Promise<SourceResultItem[]>;
  probeSourceEndpoint(sourceUrl: string): Promise<{ reachable: boolean; httpStatus: number; mimeType?: string; sampleBytes?: number }>;
}

// ── 5. Public Contact Adapter Interface ─────────────────────
export interface PublicContactSearchCriteria {
  domainTopics: string[];
  targetGroup?: string;
  geography?: string;
  limit?: number;
}

export interface PublicContactResultItem {
  contactId: string;
  targetEntityName: string;
  contactChannel: string; // email, telephone, public desk url
  channelType: 'EMAIL' | 'PHONE' | 'PUBLIC_DESK' | 'FORM';
  normalizedEmail?: string;
  publishedDomain: string;
  jurisdiction: string;
  publicRegistryCitation: string;
  sourceUrl: string;
  verificationConfidence: number;
}

export interface IPublicContactAdapter {
  discoverPublicContacts(criteria: PublicContactSearchCriteria): Promise<PublicContactResultItem[]>;
  verifyPublicChannel(channel: string): Promise<{ validSyntax: boolean; publicDomainApproved: boolean; reachabilityProb: number }>;
}
