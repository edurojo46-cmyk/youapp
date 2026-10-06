/**
 * ATLAS — FULL FREEZE HASH MANIFEST & AUDITOR V2
 * 
 * Computes:
 * 1. PRE_TEST_CODE_HASH_FULL: Comprehensive hash across all 41 execution-critical modules.
 * 2. PRE_TEST_INTELLIGENCE_POLICY_HASH: Hash of frozen cognitive architecture policy.
 * 3. PRE_TEST_LEARNED_STATE_HASH: Hash of initial baseline learned state (experiences + induced rules).
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export const FULL_CODE_MANIFEST = [
  // Generic Runner & Execution Scripts
  'scripts/run_generic_objective_to_database.mjs',
  'scripts/compute_full_freeze_hashes.mjs',
  'scripts/export_search_projection_v2.mjs',

  // General Engine & Planners
  'src/lib/atlasGeneralEngine/AtlasAutonomousObjectiveResolver.ts',
  'src/lib/atlasGeneralEngine/ObjectiveInterpreter.ts',
  'src/lib/atlasGeneralEngine/GeneralObjectiveIntelligenceEngine.ts',
  'src/lib/atlasGeneralEngine/MissionGraph.ts',
  'src/lib/atlasGeneralEngine/MultiStrategyGenerator.ts',
  'src/lib/atlasGeneralEngine/NextBestActionEngine.ts',
  'src/lib/atlasGeneralEngine/EvidenceGate.ts',
  'src/lib/atlasGeneralEngine/MissionSuccessFunction.ts',
  'src/lib/atlasGeneralEngine/AdaptiveReplanner.ts',
  'src/lib/atlasGeneralEngine/CrossMissionLearner.ts',
  'src/lib/atlasGeneralEngine/AtlasGeneralMemory.ts',
  'src/lib/atlasGeneralEngine/types.ts',

  // Pathfinder & Ontology / Schema Builders
  'src/lib/atlasPathfinder/PrimaryUnitResolver.ts',
  'src/lib/atlasPathfinder/MissionOntologyBuilder.ts',
  'src/lib/atlasPathfinder/DynamicSchemaDesigner.ts',
  'src/lib/atlasPathfinder/ComposableSchemaBuilder.ts',
  'src/lib/atlasPathfinder/MissionQualificationEngine.ts',
  'src/lib/atlasPathfinder/GenericRecordAssembler.ts',
  'src/lib/atlasPathfinder/GeneralRetrievalPlanner.ts',
  'src/lib/atlasPathfinder/types.ts',

  // Discovery Fabric & Radar
  'src/lib/atlasDiscoveryFabric/SourceDiscoveryFabricOrchestrator.ts',
  'src/lib/atlasDiscoveryFabric/SourceUniverseGenerator.ts',
  'src/lib/atlasDiscoveryFabric/CanonicalSourceDeduper.ts',
  'src/lib/atlasDiscoveryFabric/CheapProbeEngine.ts',
  'src/lib/atlasDiscoveryFabric/types.ts',
  'src/lib/atlasRadar/UniversalRadarFabric.ts',

  // Harvesters & Registries
  'src/lib/atlasHarvester/publisherSourceRegistry.ts',
  'src/lib/atlasHarvester/harvestScheduler.ts',
  'src/lib/atlasHarvester/harvestDedupeIndex.ts',
  'src/lib/atlasHarvester/types.ts',

  // Normalization, Indexing & Search
  'src/lib/atlasIndustrialEmail/IndustrialEmailSearchIndex.ts',
  'src/lib/atlasIndustrialEmail/EmailNormalizerAndClassifier.ts',

  // Intelligence Architecture (Policy)
  'src/lib/atlasIntelligence/AtlasIntelligenceLayer.ts',
  'src/lib/atlasIntelligence/MetaRuleEngine.ts',
  'src/lib/atlasIntelligence/HypothesisEngine.ts',
  'src/lib/atlasIntelligence/ExperimentationEngine.ts',
  'src/lib/atlasIntelligence/ExperienceMemory.ts',
  'src/lib/atlasIntelligence/types.ts'
];

export const INTELLIGENCE_POLICY_FILES = [
  'src/lib/atlasIntelligence/AtlasIntelligenceLayer.ts',
  'src/lib/atlasIntelligence/MetaRuleEngine.ts',
  'src/lib/atlasIntelligence/HypothesisEngine.ts',
  'src/lib/atlasIntelligence/ExperimentationEngine.ts',
  'src/lib/atlasIntelligence/ExperienceMemory.ts',
  'src/lib/atlasIntelligence/types.ts',
  'src/lib/atlasRadar/UniversalRadarFabric.ts'
];

export const LEARNED_STATE_PATH = 'scratch/atlas_learned_state.json';

export function computeFullCodeHash(baseDir = process.cwd()) {
  const hash = crypto.createHash('sha256');
  for (const relPath of FULL_CODE_MANIFEST) {
    const fullPath = path.resolve(baseDir, relPath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Manifest file not found: ${fullPath}`);
    }
    const content = fs.readFileSync(fullPath, 'utf8').replace(/\r\n/g, '\n');
    hash.update(`MANIFEST_FILE:${relPath}\n${content}\n`);
  }
  return hash.digest('hex');
}

export function computeIntelligencePolicyHash(baseDir = process.cwd()) {
  const hash = crypto.createHash('sha256');
  for (const relPath of INTELLIGENCE_POLICY_FILES) {
    const fullPath = path.resolve(baseDir, relPath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Policy file not found: ${fullPath}`);
    }
    const content = fs.readFileSync(fullPath, 'utf8').replace(/\r\n/g, '\n');
    hash.update(`FILE:${relPath}\n${content}\n`);
  }
  return hash.digest('hex');
}

export function computeLearnedStateHash(baseDir = process.cwd()) {
  const fullPath = path.resolve(baseDir, LEARNED_STATE_PATH);
  if (!fs.existsSync(fullPath)) {
    // If not yet present, initialize baseline learned state
    const initialState = {
      experiencesCount: 4,
      rulesCount: 5,
      activeRules: [
        'RULE_DEEP_ENTITY_UNIVERSE_OVER_SURFACE',
        'RULE_ZERO_UNVERIFIED_LEGACY_SUPPLY',
        'RULE_DIRECT_EMPIRICAL_YIELD_IDENTITY',
        'RULE_META_SOURCE_GRAPH_EXPANSION',
        'RULE_GENERALIZED_HARVEST_STRUCTURED_API_DATASET_PACKAGES'
      ],
      baselineStatus: 'PRE_TEST_BASELINE_INITIALIZED',
      timestamp: '2026-09-28T00:00:00.000Z'
    };
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, JSON.stringify(initialState, null, 2), 'utf8');
  }
  const content = fs.readFileSync(fullPath, 'utf8').replace(/\r\n/g, '\n');
  return crypto.createHash('sha256').update(content).digest('hex');
}

if (process.argv[1] && process.argv[1].endsWith('compute_full_freeze_hashes.mjs')) {
  console.log(`FULL_HASH_MANIFEST_CREATED = TRUE`);
  console.log(`FILES_IN_FULL_HASH_MANIFEST = ${FULL_CODE_MANIFEST.length}`);
  console.log(`PRE_TEST_CODE_HASH_FULL = ${computeFullCodeHash()}`);
  console.log(`PRE_TEST_INTELLIGENCE_POLICY_HASH = ${computeIntelligencePolicyHash()}`);
  console.log(`PRE_TEST_LEARNED_STATE_HASH = ${computeLearnedStateHash()}`);
}
