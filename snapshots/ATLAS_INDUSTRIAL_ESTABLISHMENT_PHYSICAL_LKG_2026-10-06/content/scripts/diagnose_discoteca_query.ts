import { dbPool } from '../server/db.ts';
import { AtlasConceptRegistry } from '../server/services/industrial/AtlasConceptRegistry.ts';
import { SourceQueryTranslator } from '../server/services/industrial/SourceQueryTranslator.ts';
import type { UniversalSemanticSpec } from '../server/services/industrial/UniversalSemanticResolver.ts';

async function main() {
  const reg = AtlasConceptRegistry.getInstance();
  reg.setDbPool(dbPool);
  await reg.ensureSchema();
  await reg.loadFromDb();

  const term = 'Discoteca / Club nocturno';
  console.log(`Checking concept matches for '${term}' in AtlasConceptRegistry:`);
  const matches = reg.findMatchingConcepts(term);
  console.log('Matches count:', matches.length);
  for (const m of matches) {
    console.log(`  - Concept ID: ${m.concept.concept_id} | Name: "${m.concept.canonical_name}" | Score: ${m.score} | OSM: ${JSON.stringify(m.concept.osm_tags)}`);
  }

  // Check what SourceQueryTranslator generates
  const translator = SourceQueryTranslator.getInstance();
  const spec: UniversalSemanticSpec = {
    spec_version: '1.0',
    raw_objective: term,
    normalized_objective: term.toLowerCase(),
    entity_type: 'ESTABLISHMENT',
    geography: 'Argentina',
    target_limit: 10,
    category: 'Entretenimiento y Vida Nocturna',
    entity_subtype: 'discoteca / club nocturno',
    required_evidence: ['COMPANY_IDENTITY', 'DISCOTECA_CLUB_NOCTURNO_RELATION'],
    validation_mode: 'STRICT_CONSTITUTIONAL'
  };

  const topConcept = matches[0]?.concept || null;
  const tags = translator.translateToOverpassTags(topConcept, spec);
  console.log('\nTranslated Overpass tags:');
  console.log(tags);

  const query = translator.buildOverpassQuery(topConcept, spec, 35, '(-34.70,-58.53,-34.53,-58.35)');
  console.log('\nGenerated Overpass Query:');
  console.log(query);
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
