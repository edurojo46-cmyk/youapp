/**
 * MERCERIAS PIPELINE VERIFICATION
 * @scripts/test_mercerias_pipeline.ts
 */

import { AtlasConceptRegistry } from '../server/services/industrial/AtlasConceptRegistry.ts';
import { AtlasSemanticCompiler } from '../server/services/industrial/AtlasSemanticCompiler.ts';
import { AtlasOneCallMissionIntelligence } from '../server/services/industrial/AtlasOneCallMissionIntelligence.ts';
import { SourceQueryTranslator } from '../server/services/industrial/SourceQueryTranslator.ts';
import { AutonomousSourceDiscovery } from '../server/services/industrial/AutonomousSourceDiscovery.ts';
import { dbPool } from '../server/db.ts';

async function verifyMercerias() {
  console.log(`========================================================`);
  console.log(`VERIFYING MERCERIAS PIPELINE (TARGET=20)`);
  console.log(`========================================================`);

  const registry = AtlasConceptRegistry.getInstance();
  await registry.ensureInitialized();

  // 1. Initial concept match check: must NOT match CLAE_4782 or mercados
  const matches = registry.findMatchingConcepts('mercerias');
  const falsePositiveCLAE4782 = matches.some(m => 
    (m.concept.concept_id === 'CLAE_4782' || m.concept.canonical_name.toLowerCase().includes('mercados')) &&
    m.resolution_admissible && !m.stem_only_match
  );

  console.log(`FALSE_POSITIVE_CLAAE_4782: ${falsePositiveCLAE4782}`);
  if (falsePositiveCLAE4782) {
    throw new Error('VIOLATION: mercerias still false-matched CLAE_4782!');
  }

  // 2. Initial compile without AI: should detect TAXONOMY_GAP / ONTOLOGY_GAP
  const compiler = AtlasSemanticCompiler.getInstance();
  const rawIR = compiler.compile('mercerias en CABA', 20);
  console.log(`RAW COMPILER RESOLUTION STATE: ${rawIR.resolution_state}`);
  console.log(`EXECUTION READY BEFORE AI: ${rawIR.resolution_state === 'EXECUTION_READY'}`);

  // 3. CompileAsync with OneCall: should invoke OneCall at most once, validate taxonomy, and persist
  const oneCall = AtlasOneCallMissionIntelligence.getInstance();
  const callsBefore = oneCall.total_gemini_calls;

  const asyncIR = await compiler.compileAsync('mercerias en CABA', 20);
  const callsFirstUse = oneCall.total_gemini_calls - callsBefore;

  console.log(`MERCERIAS_AI_CALLS_FIRST_USE: ${callsFirstUse}`);
  console.log(`ASYNC IR RESOLUTION STATE: ${asyncIR.resolution_state}`);
  console.log(`DYNAMIC PUBLIC TAXONOMY:`, asyncIR.public_taxonomy);

  // 4. Source query translator receives dynamic taxonomy
  const translator = SourceQueryTranslator.getInstance();
  const tags = translator.translateToOverpassTags(null, asyncIR as any);
  console.log(`MERCERIAS_OSM_FILTERS:`, tags);

  // 5. Test probe against Overpass
  console.log(`Executing Overpass probe with dynamic filters...`);
  const discovery = AutonomousSourceDiscovery.getInstance();
  const probeCandidates = await discovery.fetchEstablishmentsFromOverpass(20, asyncIR as any);
  console.log(`MERCERIAS_HTTP_SENT: TRUE`);
  console.log(`MERCERIAS_SCANNED: ${probeCandidates.length}`);
  if (probeCandidates.length > 0) {
    console.log(`SAMPLE FOUND:`, probeCandidates[0].company_name, '—', probeCandidates[0].address);
  }

  // 6. Test Second-Use Learning: second identical search must produce AI_CALLS = 0
  const callsBeforeSecond = oneCall.total_gemini_calls;
  const secondIR = await compiler.compileAsync('mercerias en CABA', 20);
  const callsSecondUse = oneCall.total_gemini_calls - callsBeforeSecond;

  console.log(`MERCERIAS_AI_CALLS_SECOND_USE: ${callsSecondUse}`);

  console.log(`========================================================`);
  console.log(`SUMMARY:`);
  console.log(`FALSE_POSITIVE_CLAAE_4782 = ${falsePositiveCLAE4782}`);
  console.log(`MERCERIAS_AI_CALLS_FIRST_USE = ${callsFirstUse}`);
  console.log(`MERCERIAS_AI_CALLS_SECOND_USE = ${callsSecondUse}`);
  console.log(`MERCERIAS_OSM_FILTERS = ${JSON.stringify(tags)}`);
  console.log(`MERCERIAS_SCANNED = ${probeCandidates.length}`);
  console.log(`========================================================`);

  process.exit(0);
}

verifyMercerias().catch(err => {
  console.error(err);
  process.exit(1);
});
