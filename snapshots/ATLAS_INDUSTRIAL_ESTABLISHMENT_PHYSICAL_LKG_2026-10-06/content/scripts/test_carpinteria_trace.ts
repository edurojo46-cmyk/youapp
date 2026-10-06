import { AtlasSemanticCompiler } from '../server/services/industrial/AtlasSemanticCompiler.ts';
import { UniversalSemanticResolver } from '../server/services/industrial/UniversalSemanticResolver.ts';
import { AtlasConceptRegistry } from '../server/services/industrial/AtlasConceptRegistry.ts';

async function traceCarpinteria() {
  const query = 'carpinteria';
  console.log('=== TRACE FOR "carpinteria" ===');

  // 1. Concept Registry check
  const conceptReg = AtlasConceptRegistry.getInstance();
  const directMatch = conceptReg.matchConcept(query);
  console.log('ConceptRegistry direct match:', directMatch ? {
    id: directMatch.concept_id,
    canonical_name: directMatch.canonical_name,
    clae: directMatch.clae_codes,
    osm: directMatch.osm_tags
  } : 'NULL');

  // 2. Legacy UniversalSemanticResolver
  const legacyResolver = UniversalSemanticResolver.getInstance();
  const legacyResult = legacyResolver.resolve(query);
  console.log('\nLEGACY UniversalSemanticResolver:');
  console.log({
    row_unit: legacyResult.row_unit,
    entity_type: legacyResult.entity_type,
    relation_type: legacyResult.relation_type,
    needs_ontology_resolution: legacyResult.needs_ontology_resolution,
    matched_clae_terms: legacyResult.matched_clae_terms,
    clae_code: legacyResult.clae_code,
    osm_tag: legacyResult.osm_tag,
    is_hard_novelty: legacyResult.is_hard_novelty
  });

  // 3. AtlasSemanticCompiler V1
  const compiler = AtlasSemanticCompiler.getInstance();
  const compilerResult = compiler.compile(query);
  console.log('\nATLAS SEMANTIC COMPILER V1:');
  console.log({
    resolution_state: compilerResult.resolution_state,
    target: compilerResult.target,
    intent: compilerResult.intent,
    object: {
      concept_id: compilerResult.object.concept_id,
      canonical_name: compilerResult.object.canonical_name,
      raw_term: compilerResult.object.raw_term,
      raw_object_phrase: compilerResult.object.raw_object_phrase,
      native_taxonomy_ids: compilerResult.object.native_taxonomy_ids
    },
    execution_layers: compilerResult.execution_layers,
    evidence_contract: compilerResult.evidence_contract.map(e => e.evidence_type),
    confidence: compilerResult.semantic_confidence.overall
  });
}

traceCarpinteria().catch(console.error);
