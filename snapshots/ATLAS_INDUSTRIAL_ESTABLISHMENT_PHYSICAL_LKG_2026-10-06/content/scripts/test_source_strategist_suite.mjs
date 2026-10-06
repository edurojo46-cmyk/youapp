import fs from 'fs';
import path from 'path';
import { AtlasSourceGraph } from './lib/atlasSourceGraph.mjs';
import { SourceStrategyMemory } from './lib/sourceStrategyMemory.mjs';
import { SourceStrategist } from './lib/sourceStrategist.mjs';

async function testSourceStrategistSuite() {
  console.log('================================================================');
  console.log('  TESTING ATLAS SOURCE STRATEGIST + LIVING SOURCE MAP SUITE     ');
  console.log('================================================================\n');

  const testGraphFile = 'scratch/test_atlas_source_graph.json';
  const testMemoryFile = 'scratch/test_source_strategy_memory.json';
  if (fs.existsSync(testGraphFile)) fs.unlinkSync(testGraphFile);
  if (fs.existsSync(testMemoryFile)) fs.unlinkSync(testMemoryFile);

  const graph = new AtlasSourceGraph(testGraphFile);
  const memory = new SourceStrategyMemory(testMemoryFile);
  const strategist = new SourceStrategist(graph, memory);

  // TEST 1: Source Map Persistent
  console.log('-> Testing Invariant 1: SOURCE_MAP_PERSISTENT...');
  graph.addSourceNode({
    sourceId: 'SRC_TEST_UNIV',
    sourceFamily: 'UNIVERSITY_DIRECTORY',
    sourceName: 'Universidad Nacional de La Plata',
    url: 'https://unlp.edu.ar'
  });
  graph.save();
  const graph2 = new AtlasSourceGraph(testGraphFile);
  const pass1 = graph2.nodes.has('SRC_TEST_UNIV');
  console.log(`   SOURCE_MAP_PERSISTENT: ${pass1}`);

  // TEST 2: Source Map Grows Across Runs
  console.log('-> Testing Invariant 2: SOURCE_MAP_GROWS_ACROSS_RUNS...');
  const beforeCount = graph2.nodes.size;
  graph2.addSourceNode({
    sourceId: 'SRC_TEST_BAR_ASSOCIATION',
    sourceFamily: 'PROFESSIONAL_COLLEGE',
    sourceName: 'Colegio de Abogados de Córdoba',
    url: 'https://abogadoscordoba.org.ar'
  });
  graph2.save();
  const graph3 = new AtlasSourceGraph(testGraphFile);
  const afterCount = graph3.nodes.size;
  const pass2 = afterCount > beforeCount;
  console.log(`   Before: ${beforeCount} | After: ${afterCount} | Grows: ${pass2}`);

  // TEST 3: Source Yield Memory Persistent
  console.log('-> Testing Invariant 3: SOURCE_YIELD_MEMORY_PERSISTENT...');
  memory.recordObservation('SRC_TEST_UNIV', 'TARGET_EMAIL', {
    validResults: 1200,
    netNewResults: 1200,
    yieldPerSecond: 45
  });
  memory.save();
  const memory2 = new SourceStrategyMemory(testMemoryFile);
  const stats = memory2.getStats('SRC_TEST_UNIV', 'TARGET_EMAIL');
  const pass3 = stats && stats.validResults === 1200;
  console.log(`   SOURCE_YIELD_MEMORY_PERSISTENT: ${pass3}`);

  // TEST 4: Objective-Specific Memory
  console.log('-> Testing Invariant 4: OBJECTIVE_SPECIFIC_MEMORY...');
  memory.recordObservation('SRC_TEST_ENERGY', 'TARGET_EMAIL', { validResults: 0, netNewResults: 0 });
  memory.recordObservation('SRC_TEST_ENERGY', 'TARGET_COMPANY', { validResults: 500, netNewResults: 500 });
  const isZeroEmail = memory.isZeroYield('SRC_TEST_ENERGY', 'TARGET_EMAIL');
  const isZeroCompany = memory.isZeroYield('SRC_TEST_ENERGY', 'TARGET_COMPANY');
  const pass4 = isZeroEmail === true && isZeroCompany === false;
  console.log(`   Zero for Email: ${isZeroEmail} | Zero for Company: ${isZeroCompany} | Pass: ${pass4}`);

  // TEST 5: AI Uses Existing Map
  console.log('-> Testing Invariant 5: AI_USES_EXISTING_MAP...');
  const consultation = strategist.consultSourceMap('TARGET_EMAIL');
  const pass5 = consultation.totalSourcesKnown > 0 && consultation.frontiers !== null;
  console.log(`   Consulted Sources: ${consultation.totalSourcesKnown} | Pass: ${pass5}`);

  // TEST 6: AI Generates New Source Hypotheses
  console.log('-> Testing Invariant 6: AI_CAN_ADD_NEW_HYPOTHESES...');
  const hypotheses = strategist.generateAiHypotheses('TARGET_EMAIL', consultation);
  const pass6 = Array.isArray(hypotheses) && hypotheses.length >= 3;
  console.log(`   Generated Hypotheses Count: ${hypotheses.length} | Pass: ${pass6}`);

  // TEST 7: Radar Validates AI Hypotheses
  console.log('-> Testing Invariant 7: RADAR_VALIDATES_AI_HYPOTHESES...');
  const radarValidation = await strategist.validateHypothesesWithRadar(hypotheses);
  const pass7 = radarValidation.validated.length > 0 || radarValidation.rejected.length > 0;
  console.log(`   Validated: ${radarValidation.validated.length} | Rejected: ${radarValidation.rejected.length} | Pass: ${pass7}`);

  // TEST 8: Graph Expansion Adds New Sources
  console.log('-> Testing Invariant 8: GRAPH_EXPANSION_ADDS_NEW_SOURCES...');
  const productiveNodes = Array.from(graph.nodes.values()).filter(n => n.sourceFamily === 'PROCUREMENT_REGISTRY');
  const expansions = strategist.expandByAnalogy(productiveNodes, 'TARGET_EMAIL');
  const pass8 = expansions.length > 0;
  console.log(`   Analogies generated: ${expansions.length} | Pass: ${pass8}`);

  // TEST 9: Exhausted Sources Not Reused As New
  console.log('-> Testing Invariant 9: EXHAUSTED_SOURCES_NOT_REUSED_AS_NEW...');
  const exhaustedScore = strategist.calculatePriority(
    { sourceId: 'SRC_IGJ', sourceFamily: 'GOVERNMENT_CATALOG' },
    { resourceId: 'RES_IGJ_AUTORIDADES_202603' },
    'TARGET_PEOPLE'
  );
  const pass9 = exhaustedScore === -1.0;
  console.log(`   Exhausted Score: ${exhaustedScore} (Expected -1.0) | Pass: ${pass9}`);

  // TEST 10: Zero-Yield Memory Reduces Repeat Waste
  console.log('-> Testing Invariant 10: ZERO_YIELD_MEMORY_REDUCES_REPEAT_WASTE...');
  const energyScore = strategist.calculatePriority(
    { sourceId: 'SRC_ENERGIA', sourceFamily: 'ENERGY_REGISTRY' },
    { resourceId: 'RES_ENERGIA_POZOS_PRODUCCION' },
    'TARGET_EMAIL'
  );
  const siproScore = strategist.calculatePriority(
    { sourceId: 'SRC_SIPRO_NACION', sourceFamily: 'PROCUREMENT_REGISTRY', features: { hasMemberDirectory: true } },
    { resourceId: 'RES_SIPRO_LEGACY_CSV' },
    'TARGET_EMAIL'
  );
  const pass10 = energyScore < 0.1 && siproScore > 1000;
  console.log(`   Energy Email Score: ${energyScore} | SIPRO Email Score: ${siproScore} | Pass: ${pass10}`);

  const allPass = pass1 && pass2 && pass3 && pass4 && pass5 && pass6 && pass7 && pass8 && pass9 && pass10;
  console.log('\n================================================================');
  console.log(`SOURCE STRATEGIST 10-INVARIANT SUITE: ${allPass ? 'ALL TESTS PASSED (10/10)' : 'FAILED'}`);
  console.log('================================================================\n');

  return allPass;
}

testSourceStrategistSuite().catch(console.error);
