/**
 * scripts/discovery/atlas_physical_resolution_engine.mjs
 * 
 * ATLAS — WIDE NET V3B
 * PHYSICAL RESOLUTION ENGINE: HYPOTHESIS → REAL PUBLIC NODE CONVERSION
 * 
 * CORE PRINCIPLES:
 * 1. STOP optimizing for hypothesis generation.
 * 2. Convert existing discovery hypotheses into real, traceable, unique, public nodes.
 * 3. Two-Layer Graph Model:
 *    - Layer A: Real World Entity Graph (Organizations, Bodies, Companies, Institutions).
 *    - Layer B: Public Resource Graph (Websites, Social Pages, Documents, Rosters, Registries).
 * 4. Strict Deduplication via PHYSICAL_NODE_AUTHORITY.
 * 5. Complete Provenance & Lineage:
 *    [ROOT_HYPOTHESIS_ID, QUERY, INTERMEDIATE_RESULT, PHYSICAL_NODE_ID, CANONICAL_LOCATOR, DISCOVERY_EDGE, TIMESTAMP]
 * 6. ZERO synthetic nodes, ZERO placeholders, ZERO untraceable nodes.
 * 7. FUEL STATE UNTOUCHED: 900,000 TOTAL (300,000 ENGINEERING, 600,000 FINAL HOLDOUT).
 * 8. NO BENCHMARK.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// ─── STATUS MACHINE DEFINITION (13 STATES) ──────────────────────────────────
export const RESOLUTION_STATUS = Object.freeze({
  UNRESOLVED: 'UNRESOLVED',
  QUEUED_FOR_RESOLUTION: 'QUEUED_FOR_RESOLUTION',
  RESOLVING: 'RESOLVING',
  RESULTS_FOUND: 'RESULTS_FOUND',
  PHYSICAL_NODE_CONFIRMED: 'PHYSICAL_NODE_CONFIRMED',
  MULTIPLE_PHYSICAL_NODES_CONFIRMED: 'MULTIPLE_PHYSICAL_NODES_CONFIRMED',
  NO_RESULT: 'NO_RESULT',
  RETRY_LATER: 'RETRY_LATER',
  RATE_LIMITED: 'RATE_LIMITED',
  ACCESS_NOT_PERMITTED: 'ACCESS_NOT_PERMITTED',
  PURPOSE_INCOMPATIBLE: 'PURPOSE_INCOMPATIBLE',
  DUPLICATE_PHYSICAL_NODE: 'DUPLICATE_PHYSICAL_NODE',
  EXHAUSTED: 'EXHAUSTED'
});

// ─── TWO-LAYER GRAPH CLASSIFICATION ─────────────────────────────────────────
export const LAYER_A_CLASSES = new Set([
  'COMPANY', 'BUSINESS', 'CORPORATION',
  'CHAMBER', 'BUSINESS_CHAMBER', 'TRADE_ASSOCIATION',
  'PROFESSIONAL_ASSOCIATION', 'CIVIL_ASSOCIATION', 'ASSOCIATION',
  'FOUNDATION', 'NGO',
  'COOPERATIVE',
  'CLUB', 'SPORTS_CLUB', 'CULTURAL_CLUB',
  'FEDERATION', 'CONFEDERATION',
  'PROFESSIONAL_BODY', 'PROFESSIONAL_COUNCIL',
  'UNIVERSITY', 'FACULTY', 'RESEARCH_CENTER', 'INSTITUTE',
  'PUBLIC_AGENCY', 'MUNICIPALITY', 'PROVINCE', 'PUBLIC_ENTITY'
]);

export const LAYER_B_CLASSES = new Set([
  'OFFICIAL_WEBSITE', 'PORTAL', 'DOMAIN_LOCATOR',
  'FACEBOOK_PAGE', 'FACEBOOK_GROUP', 'FACEBOOK_ENTITY',
  'INSTAGRAM_PROFILE', 'LINKEDIN_ORG', 'LINKEDIN_PERSON_REF',
  'YOUTUBE_CHANNEL', 'TIKTOK_ACCOUNT', 'X_ACCOUNT',
  'TELEGRAM_CHANNEL', 'REDDIT_COMMUNITY', 'OTHER_SOCIAL',
  'PUBLIC_DOCUMENT', 'PUBLIC_LIST', 'PUBLIC_DIRECTORY',
  'PUBLIC_DATASET', 'PUBLIC_REGISTRY'
]);

// ─── PHYSICAL NODE AUTHORITY ────────────────────────────────────────────────
export class PhysicalNodeAuthority {
  constructor() {
    this.canonicalEntities = new Map(); // entityKey -> Layer A Record
    this.canonicalResources = new Map(); // resourceLocator -> Layer B Record
    this.rejectedDuplicates = 0;
    this.provenanceLedger = [];
  }

  canonicalizeLocator(rawLocator) {
    if (!rawLocator) return null;
    let loc = rawLocator.trim();
    // Normalize scheme and trailing slashes
    loc = loc.replace(/^http:\/\//i, 'https://');
    loc = loc.replace(/\/+$/, '');
    // Lowercase domain
    try {
      if (loc.startsWith('https://')) {
        const u = new URL(loc);
        loc = `${u.protocol}//${u.host.toLowerCase()}${u.pathname}${u.search}`;
      }
    } catch {
      // Keep as sanitized string if not valid URL
    }
    return loc;
  }

  registerRealWorldEntity(entity) {
    const key = `ENTITY:${entity.entityClass}:${entity.normalizedName}:${entity.jurisdiction || 'ARG'}`;
    if (this.canonicalEntities.has(key)) {
      this.rejectedDuplicates++;
      return { status: 'DUPLICATE', entityId: key };
    }
    const record = {
      entityId: key,
      layer: 'LAYER_A_REAL_WORLD_ENTITY',
      entityClass: entity.entityClass,
      displayName: entity.displayName,
      normalizedName: entity.normalizedName,
      jurisdiction: entity.jurisdiction || 'ARG',
      primaryLocator: entity.primaryLocator,
      resourceCount: 0,
      registeredAt: new Date().toISOString()
    };
    this.canonicalEntities.set(key, record);
    return { status: 'CONFIRMED', entityId: key, record };
  }

  registerPublicResource(resource, entityId, provenance) {
    const canonicalLocator = this.canonicalizeLocator(resource.canonicalLocator);
    if (!canonicalLocator) {
      return { status: 'INVALID_LOCATOR' };
    }

    if (this.canonicalResources.has(canonicalLocator)) {
      this.rejectedDuplicates++;
      return { status: 'DUPLICATE', locator: canonicalLocator };
    }

    const resourceId = `RES_${crypto.createHash('sha256').update(canonicalLocator).digest('hex').slice(0, 16)}`;
    const record = {
      resourceId,
      layer: 'LAYER_B_PUBLIC_RESOURCE',
      resourceClass: resource.resourceClass,
      canonicalLocator,
      platform: resource.platform || 'WEB',
      entityId,
      publicAccessStatus: 'PUBLICLY_PERMITTED',
      purposeCompatibility: 'PUBLIC_DIRECTORY_INDEXING',
      contentHash: resource.contentHash || null,
      sourceDomain: resource.sourceDomain || null,
      registeredAt: new Date().toISOString()
    };

    this.canonicalResources.set(canonicalLocator, record);

    if (entityId && this.canonicalEntities.has(entityId)) {
      this.canonicalEntities.get(entityId).resourceCount++;
    }

    if (provenance) {
      this.provenanceLedger.push({
        rootHypothesisId: provenance.rootHypothesisId,
        query: provenance.query,
        intermediateResult: provenance.intermediateResult,
        physicalNodeId: resourceId,
        canonicalLocator,
        discoveryEdge: provenance.discoveryEdge,
        timestamp: new Date().toISOString()
      });
    }

    return { status: 'CONFIRMED', resourceId, canonicalLocator, record };
  }

  get stats() {
    return {
      uniqueRealWorldEntities: this.canonicalEntities.size,
      uniquePublicResourceNodes: this.canonicalResources.size,
      totalCanonicalPhysicalNodes: this.canonicalEntities.size + this.canonicalResources.size,
      duplicateLocatorsRejected: this.rejectedDuplicates,
      provenanceRecords: this.provenanceLedger.length
    };
  }
}

// ─── PATTERN LEARNER ────────────────────────────────────────────────────────
export class PhysicalResolutionPatternLearner {
  constructor() {
    this.successfulPatterns = new Map();
  }

  recordSuccess(patternTemplate, yieldRatio) {
    const current = this.successfulPatterns.get(patternTemplate) || { attempts: 0, successes: 0, totalYield: 0 };
    current.attempts++;
    current.successes++;
    current.totalYield += yieldRatio;
    this.successfulPatterns.set(patternTemplate, current);
  }

  getTopPatterns(limit = 10) {
    return Array.from(this.successfulPatterns.entries())
      .map(([pattern, data]) => ({
        pattern,
        successRate: data.successes / data.attempts,
        avgYield: data.totalYield / data.successes
      }))
      .sort((a, b) => b.avgYield - a.avgYield)
      .slice(0, limit);
  }
}
