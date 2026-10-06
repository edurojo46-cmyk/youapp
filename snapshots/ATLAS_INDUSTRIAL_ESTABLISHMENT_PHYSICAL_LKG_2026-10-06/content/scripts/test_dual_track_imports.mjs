import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';
import { EMAIL_EXTRACTION_REGEX, EmailNormalizerAndClassifier } from '../src/lib/atlasIndustrialEmail/EmailNormalizerAndClassifier.ts';
import { PreexistingEmailAuthority } from '../src/lib/atlasIndustrialEmail/PreexistingEmailAuthority.ts';
import { IndustrialEmailSearchIndex } from '../src/lib/atlasIndustrialEmail/IndustrialEmailSearchIndex.ts';
import { SourceUniverseGenerator } from '../src/lib/atlasDiscoveryFabric/SourceUniverseGenerator.ts';
import { CheapProbeEngine } from '../src/lib/atlasDiscoveryFabric/CheapProbeEngine.ts';
import { SecondStageCanary } from '../src/lib/atlasDiscoveryFabric/SecondStageCanary.ts';
import { AdaptiveHostManager } from '../src/lib/atlasDiscoveryFabric/AdaptiveHostManager.ts';
import { CanonicalSourceDeduper } from '../src/lib/atlasDiscoveryFabric/CanonicalSourceDeduper.ts';

console.log('All modules loaded successfully!');
