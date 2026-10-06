import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const outDir = path.resolve('reports/atlas/general_engine/baselines');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const PEOPLE_SEARCH_FILES = [
  'src/lib/search/AtlasPeopleSearchV2.ts',
  'src/lib/search/FederatedPersonSearch.ts',
  'src/lib/search/classification/AtlasPeopleClassifier.ts',
  'src/lib/search/GlobalFilterPredicates.ts',
  'src/lib/search/AtlasPeopleScaleMetrics.ts',
  'src/lib/search/PublicContactDiscovery.ts',
  'scripts/lib/canonicalIdentityResolver.mjs',
  'scripts/build_global_identity_authority_v4.mjs'
];

const VIDEO_SEARCH_FILES = [
  'src/lib/search/searchEngine.ts',
  'src/lib/search/rankingEngine.ts',
  'src/lib/search/queryEngine.ts',
  'src/lib/search/intentDetector.ts',
  'src/lib/search/retrievalEngine.ts',
  'src/lib/search/types.ts',
  'src/lib/youappRanking.ts',
  'src/lib/youtube.ts'
];

const SOURCE_INTELLIGENCE_FILES = [
  'scripts/lib/atlasSourceGraph.mjs',
  'scripts/lib/sourceStrategyMemory.mjs',
  'scripts/lib/sourceStrategist.mjs',
  'scripts/lib/acquisitionIntelligenceEngine.mjs'
];

function hashFile(relPath) {
  const fullPath = path.resolve(relPath);
  if (!fs.existsSync(fullPath)) return null;
  const content = fs.readFileSync(fullPath);
  return {
    path: relPath,
    bytes: content.length,
    sha256: crypto.createHash('sha256').update(content).digest('hex')
  };
}

const peopleManifest = PEOPLE_SEARCH_FILES.map(hashFile).filter(Boolean);
const videoManifest = VIDEO_SEARCH_FILES.map(hashFile).filter(Boolean);
const sourceManifest = SOURCE_INTELLIGENCE_FILES.map(hashFile).filter(Boolean);

const baselineReport = {
  BASELINE_TIMESTAMP: new Date().toISOString(),
  PEOPLE_ENGINE_BASELINE_CAPTURED: peopleManifest.length === PEOPLE_SEARCH_FILES.length,
  VIDEO_ENGINE_BASELINE_CAPTURED: videoManifest.length === VIDEO_SEARCH_FILES.length,
  SOURCE_INTELLIGENCE_BASELINE_CAPTURED: sourceManifest.length === SOURCE_INTELLIGENCE_FILES.length,
  PEOPLE_SEARCH_INVENTORY: peopleManifest,
  VIDEO_SEARCH_INVENTORY: videoManifest,
  SOURCE_INTELLIGENCE_INVENTORY: sourceManifest,
  CANONICAL_AUTHORITY_INVENTORY: [
    hashFile('scratch/global_identity_authority_v4.bin'),
    hashFile('scratch/global_preexisting_public_email_authority.bin'),
    hashFile('scratch/canonical_human_alias_map.json')
  ].filter(Boolean)
};

const outputFile = path.join(outDir, 'existing_systems_baseline_freeze.json');
fs.writeFileSync(outputFile, JSON.stringify(baselineReport, null, 2), 'utf8');

console.log('════════════════════════════════════════════════════════════════');
console.log('  ATLAS — PHASE 0: EXISTING SYSTEMS ARCHITECTURAL FREEZE        ');
console.log('════════════════════════════════════════════════════════════════');
console.log(`PEOPLE_ENGINE_BASELINE_CAPTURED = ${baselineReport.PEOPLE_ENGINE_BASELINE_CAPTURED}`);
console.log(`VIDEO_ENGINE_BASELINE_CAPTURED = ${baselineReport.VIDEO_ENGINE_BASELINE_CAPTURED}`);
console.log(`SOURCE_INTELLIGENCE_BASELINE_CAPTURED = ${baselineReport.SOURCE_INTELLIGENCE_BASELINE_CAPTURED}`);
console.log(`Baseline report written to: ${outputFile}`);
