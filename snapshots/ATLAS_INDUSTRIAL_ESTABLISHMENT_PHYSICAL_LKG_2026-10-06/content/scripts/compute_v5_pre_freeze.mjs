import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

export const FULL_CODE_MANIFEST = [
  'scripts/run_generic_autonomous_source_expansion.mjs',
  'src/lib/atlasRadar/UniversalRadarFabric.ts',
  'src/lib/atlasRadar/atlasSourceBrainV2.ts',
  'src/lib/atlasRadar/atlasDepletionPredictor.ts',
  'src/lib/atlasRadar/atlasDiscoveryFrontier.ts',
  'src/lib/atlasRadar/atlasAutonomousAspirator.ts',
  'src/lib/atlasRadar/millionRadarTypes.ts',
  'src/lib/atlasRadar/atlasMillionRadar.ts',
  'src/lib/atlasRadar/atlasTargetController.ts',
  'src/lib/atlasRadar/nationalInventoryHeatMap.ts',
  'src/lib/atlasRadar/radarDashboard.ts',
  'src/lib/atlasDiscoveryFabric/SourceUniverseGenerator.ts',
  'src/lib/atlasDiscoveryFabric/SourceDiscoveryFabricOrchestrator.ts',
  'src/lib/atlasDiscoveryFabric/CheapProbeEngine.ts',
  'src/lib/atlasDiscoveryFabric/SecondStageCanary.ts',
  'src/lib/atlasDiscoveryFabric/AdaptiveHostManager.ts',
  'src/lib/atlasDiscoveryFabric/CanonicalSourceDeduper.ts',
  'src/lib/atlasDiscoveryFabric/AIStrategistHypotheses.ts',
  'src/lib/atlasDiscoveryFabric/types.ts',
  'src/lib/search/repositories/IndustrialSearchRepository.ts',
  'src/pages/BuscaIndustrial.tsx',
  'src/pages/BuscaIndustrialResultados.tsx',
  'src/pages/BuscaIndustrial.css',
  'src/pages/BuscaIndustrialResultados.css',
  'src/lib/atlasPathfinder/sourceIntelligence/SourceKnowledgeMap.ts',
  'src/lib/atlasPathfinder/sourceIntelligence/SourceFamilyGapEngine.ts',
  'src/lib/atlasPathfinder/sourceIntelligence/TeslaWheelStream.ts',
  'src/lib/atlasRecursiveHarvest/RecursiveEcosystemEngine.ts',
  'src/lib/atlasIndustrialEmail/PreexistingEmailAuthority.ts',
  'src/lib/atlasIndustrialEmail/IndustrialEmailSearchIndex.ts',
  'src/lib/atlasIndustrialEmail/EmailNormalizerAndClassifier.ts',
  'scripts/export_search_projection_v2.mjs',
  'scripts/deploy_catalog_stats_rpc.mjs',
  'server.ts'
];

export const INTELLIGENCE_POLICY_FILES = [
  'src/lib/atlasDiscoveryFabric/AIStrategistHypotheses.ts',
  'src/lib/atlasRadar/atlasSourceBrainV2.ts',
  'src/lib/atlasRadar/atlasDepletionPredictor.ts',
  'src/lib/atlasRadar/atlasDiscoveryFrontier.ts',
  'src/lib/atlasRadar/atlasAutonomousAspirator.ts'
];

export function hashFileList(files) {
  const hash = crypto.createHash('sha256');
  for (const f of files) {
    const full = path.resolve(process.cwd(), f);
    if (fs.existsSync(full)) {
      const content = fs.readFileSync(full, 'utf8').replace(/\r\n/g, '\n');
      hash.update(`FILE:${f}\n${content}\n`);
    } else {
      console.warn('File in manifest not found:', f);
    }
  }
  return hash.digest('hex');
}

async function computeV5PreFreeze() {
  console.log('========================================================================');
  console.log('🔒 COMPUTING ATLAS INDUSTRIAL V5 PRE-EXECUTION FREEZE SNAPSHOT');
  console.log('========================================================================\n');

  // 1. Full Code Hash
  const V5_PRE_FULL_CODE_HASH = hashFileList(FULL_CODE_MANIFEST);
  console.log(`V5_PRE_FULL_CODE_HASH = ${V5_PRE_FULL_CODE_HASH} (${FULL_CODE_MANIFEST.length} files)`);

  // 2. Intelligence Policy Hash
  const V5_PRE_INTELLIGENCE_POLICY_HASH = hashFileList(INTELLIGENCE_POLICY_FILES);
  console.log(`V5_PRE_INTELLIGENCE_POLICY_HASH = ${V5_PRE_INTELLIGENCE_POLICY_HASH} (${INTELLIGENCE_POLICY_FILES.length} files)`);

  // 3. Database Source Knowledge Data Snapshot
  const client = new pg.Client({ ...parseDbUrl() });
  await client.connect();

  const skRes = await client.query(`
    SELECT 
      source_id, 
      source_name, 
      source_family, 
      source_universe, 
      protocol, 
      access_method, 
      created_at as first_seen_at, 
      current_status
    FROM public.atlas_source_knowledge_map
    ORDER BY source_id ASC;
  `);

  const skHash = crypto.createHash('sha256');
  for (const r of skRes.rows) {
    const rowStr = `${r.source_id}|${r.source_name}|${r.source_family}|${r.source_universe}|${r.protocol}|${r.access_method}|${r.first_seen_at ? r.first_seen_at.toISOString() : ''}|${r.current_status}\n`;
    skHash.update(rowStr);
  }
  const V5_PRE_SOURCE_KNOWLEDGE_DATA_HASH = skHash.digest('hex');
  const V5_PRE_SOURCE_COUNT = skRes.rows.length;

  console.log(`V5_PRE_SOURCE_KNOWLEDGE_DATA_HASH = ${V5_PRE_SOURCE_KNOWLEDGE_DATA_HASH}`);
  console.log(`V5_PRE_SOURCE_COUNT = ${V5_PRE_SOURCE_COUNT}`);

  // 4. Starting Counts
  const countRes = await client.query(`
    SELECT 
      count(*) FILTER (WHERE status = 'ACTIVE') as certified_relations,
      count(distinct name) FILTER (WHERE status = 'ACTIVE') as unique_products,
      count(distinct attributes_json->>'company_name') FILTER (WHERE status = 'ACTIVE') as unique_entities
    FROM public.atlas_products;
  `);

  const START_RELATIONS = parseInt(countRes.rows[0].certified_relations, 10);
  const START_UNIQUE_PRODUCTS = parseInt(countRes.rows[0].unique_products, 10);
  const START_UNIQUE_ENTITIES = parseInt(countRes.rows[0].unique_entities, 10);

  console.log(`\nSTART_RELATIONS = ${START_RELATIONS}`);
  console.log(`START_UNIQUE_PRODUCTS = ${START_UNIQUE_PRODUCTS}`);
  console.log(`START_UNIQUE_ENTITIES = ${START_UNIQUE_ENTITIES}`);

  const snapshot = {
    timestamp: new Date().toISOString(),
    V5_PRE_FULL_CODE_HASH,
    V5_PRE_INTELLIGENCE_POLICY_HASH,
    V5_PRE_SOURCE_KNOWLEDGE_DATA_HASH,
    V5_PRE_SOURCE_COUNT,
    START_RELATIONS,
    START_UNIQUE_PRODUCTS,
    START_UNIQUE_ENTITIES,
    manifestFilesCount: FULL_CODE_MANIFEST.length
  };

  fs.writeFileSync('scratch/v5_pre_freeze_snapshot.json', JSON.stringify(snapshot, null, 2), 'utf8');
  console.log('\nSnapshot persisted to scratch/v5_pre_freeze_snapshot.json');
  console.log('========================================================================\n');

  await client.end();
}

computeV5PreFreeze().catch(console.error);
