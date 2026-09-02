/**
 * index.ts — Módulo Principal de Atlas Discovery AI V1
 */

export * from './types';
export * from './atlasGapAnalyzer';
export * from './discoveryBudget';
export * from './discoveryPlanner';
export * from './discoveryExecutor';
export * from './discoveryBrain';
export * from './discoveryMissionQueue';
export * from './discoveryFeedback';
export * from './discoveryTelemetry';
export * from './v2';

let activeDiscoveryAiVersion: 'v1_1' | 'v2' = 'v2';

export function getDiscoveryAIVersion(): 'v1_1' | 'v2' {
  if (typeof process !== 'undefined' && process.env?.DISCOVERY_AI_VERSION) {
    return process.env.DISCOVERY_AI_VERSION === 'v1_1' ? 'v1_1' : 'v2';
  }
  return activeDiscoveryAiVersion;
}

export function setDiscoveryAIVersion(version: 'v1_1' | 'v2') {
  activeDiscoveryAiVersion = version;
}

