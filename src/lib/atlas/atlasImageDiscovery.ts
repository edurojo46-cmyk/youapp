/**
 * ATLAS — IMAGE DISCOVERY ENGINE V1
 * TypeScript Facade & Contract Definitions
 */
// @ts-ignore
import { AtlasImageDiscovery, AtlasImageDiscoveryEngine, ENGINE_NAME, DISPLAY_NAME, PROFILE_REGISTRY } from './atlasImageDiscoveryEngine.mjs';

export interface ImageDiscoveryOptions {
  objective?: string;
  SEARCH_OBJECTIVE?: string;
  target?: number;
  TARGET_COUNT?: number;
  profile?: 'NATURE_PREMIUM' | 'GENERAL_IMAGE' | 'TRAVEL' | 'ARCHITECTURE' | 'PEOPLE' | 'PRODUCT' | 'HISTORICAL' | 'CUSTOM' | string;
  PROFILE?: string;
  quality?: number;
  MIN_QUALITY?: number;
  licensePolicy?: string;
  LICENSE_POLICY?: string;
  outputCollection?: string;
  OUTPUT_COLLECTION?: string;
}

export interface DiscoveredAsset {
  assetId: string;
  collectionId: string;
  objective: string;
  profile: string;
  source: string;
  sourceId: string;
  sourceUrl: string;
  mediaUrl: string;
  thumbUrl: string;
  title: string;
  creator: string;
  license: string;
  licenseUrl: string | null;
  attributionRequired: boolean;
  width: number;
  height: number;
  aspectRatio: string;
  sha256: string;
  visualQualityScore: number;
  scores: Record<string, any>;
}

export interface ImageDiscoveryResult {
  engineName: string;
  displayName: string;
  objective: string;
  profile: string;
  target: number;
  acceptedCount: number;
  averageQualityScore: number;
  outputCollection: string;
  readbackVerifiedCount: number;
  discoveredAssets: DiscoveredAsset[];
  routesState: Record<string, any>;
}

export { AtlasImageDiscovery, AtlasImageDiscoveryEngine, ENGINE_NAME, DISPLAY_NAME, PROFILE_REGISTRY };
export default AtlasImageDiscovery;
