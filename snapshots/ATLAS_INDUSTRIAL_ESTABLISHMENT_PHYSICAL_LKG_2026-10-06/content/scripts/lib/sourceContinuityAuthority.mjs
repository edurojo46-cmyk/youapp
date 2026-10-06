import fs from 'fs';
import path from 'path';

export class GlobalConsumedSourceAuthority {
  constructor() {
    this.consumedResources = new Map();
    this.consumedLocators = new Set();
    this.exhaustedResourceCount = 0;
    this.historicalSourcesCount = 0;
    this.historicalResourcesCount = 0;
    this.initializeKnownSources();
  }

  initializeKnownSources() {
    // 1. Register historical IGJ corporate governance authority
    const igjHash = '9fc208f83c442ed880f035b483a4477686b08d4945ec78c1ef419212cbf3e59e';
    this.registerResource({
      resourceId: 'RES_30558188-9c77-41cb-8c83-06f3bb84b0bf',
      urlKeywords: ['igj-autoridades-genero', '30558188-9c77-41cb-8c83-06f3bb84b0bf'],
      sha256: igjHash,
      sourceId: 'src_ckan_datos_ar_igj',
      organization: 'Inspección General de Justicia',
      historicalRowsConsumed: 1853471,
      maxRowLocator: 'row:1853472',
      humansCreditedHistorically: 1006570,
      exhaustedForNetNewAcquisition: true,
      expectedNetNewValue: 0
    });

    // 2. Register Historical Search Projections V1 & V2
    this.registerResource({
      resourceId: 'RES_ATLAS_PROJECTION_V1',
      urlKeywords: ['atlas_canonical_people_projection_v1'],
      sha256: '39908083e21081938fe85d13ecd010de0c1f56cee1e0b9818f8d527143fc936d',
      sourceId: 'atlas_internal_proj_v1',
      historicalRowsConsumed: 658000,
      maxRowLocator: 'doc:424429',
      humansCreditedHistorically: 424429,
      exhaustedForNetNewAcquisition: true,
      expectedNetNewValue: 0
    });

    this.registerResource({
      resourceId: 'RES_ATLAS_PROJECTION_V2',
      urlKeywords: ['atlas_canonical_people_projection_v2'],
      sha256: '6a6ca1d6745b59d417a0684270a327285b2be6e597f0a2f4dce748063d03f446',
      sourceId: 'atlas_internal_proj_v2',
      historicalRowsConsumed: 1276656,
      maxRowLocator: 'doc:1001007',
      humansCreditedHistorically: 1001007,
      exhaustedForNetNewAcquisition: true,
      expectedNetNewValue: 0
    });
  }

  registerResource(meta) {
    this.historicalResourcesCount++;
    if (meta.exhaustedForNetNewAcquisition) {
      this.exhaustedResourceCount++;
    }
    this.consumedResources.set(meta.resourceId, meta);
    if (meta.sha256) {
      this.consumedResources.set(meta.sha256.toLowerCase(), meta);
    }
    for (const kw of (meta.urlKeywords || [])) {
      this.consumedResources.set(kw.toLowerCase(), meta);
    }
  }

  isResourceExhausted(url, sha256 = null, resourceId = null) {
    if (resourceId && this.consumedResources.has(resourceId)) {
      return this.consumedResources.get(resourceId).exhaustedForNetNewAcquisition;
    }
    if (sha256 && this.consumedResources.has(sha256.toLowerCase())) {
      return this.consumedResources.get(sha256.toLowerCase()).exhaustedForNetNewAcquisition;
    }
    if (url) {
      const lower = url.toLowerCase();
      for (const [key, meta] of this.consumedResources.entries()) {
        if (lower.includes(key)) {
          return meta.exhaustedForNetNewAcquisition;
        }
      }
    }
    return false;
  }

  getExpectedNetNew(url, estimatedTotalRows = 0) {
    if (this.isResourceExhausted(url)) {
      return 0;
    }
    return Math.floor(estimatedTotalRows * 0.85);
  }
}

/**
 * Phase 4: Source Brain Novelty Scorer
 */
export function scoreResourceNovelty(resource, continuityAuthority) {
  const isExhausted = continuityAuthority.isResourceExhausted(resource.url, resource.sha256, resource.resourceId);
  if (isExhausted) {
    return {
      expectedNetNewHumans: 0,
      priorityScore: -1.0,
      isEligibleForAcquisition: false,
      reason: 'EXHAUSTED_HISTORICAL_RESOURCE'
    };
  }

  const estimatedRows = resource.estimatedRows || 50000;
  const personRatio = resource.personSampleRatio || 0.90;
  const noveltyRatio = resource.noveltySampleRatio || 0.85;

  const expectedNetNewHumans = Math.floor(estimatedRows * personRatio * noveltyRatio);
  const latency = resource.latencyMs || 500;
  const cost = (resource.contentLengthBytes || 10000000) / (1024 * 1024); // MB

  // Source value = expected net new humans per unit of expected time/cost
  const priorityScore = expectedNetNewHumans / (1.0 + (cost * 0.1) + (latency * 0.001));

  return {
    expectedNetNewHumans,
    priorityScore,
    isEligibleForAcquisition: true,
    reason: 'FRESH_HIGH_NOVELTY_FRONTIER'
  };
}
