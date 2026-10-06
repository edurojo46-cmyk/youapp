import { dbPool } from '../server/db.ts';
import { AtlasConceptRegistry } from '../server/services/industrial/AtlasConceptRegistry.ts';
import { SourceQueryTranslator } from '../server/services/industrial/SourceQueryTranslator.ts';
import type { UniversalSemanticSpec } from '../server/services/industrial/UniversalSemanticResolver.ts';

const REGRESSION_TERMS = [
  'lavanderia',
  'peluqueria',
  'tintoreria',
  'barberia',
  'farmacia',
  'ferreteria',
  'heladeria',
  'carniceria',
  'panaderia',
  'torneria',
  'herrería',
  'mueblería'
];

async function main() {
  console.log('=== RUNNING ATLAS REGRESSION SET (TRANSLATION & PLAN ONLY, NO ACQUISITION) ===\n');

  const registry = AtlasConceptRegistry.getInstance();
  registry.setDbPool(dbPool);
  await registry.ensureSchema();
  await registry.loadFromDb();

  const translator = SourceQueryTranslator.getInstance();
  const sampleBBox = { south: -34.7, west: -58.53, north: -34.53, east: -58.35 };

  let allPassed = true;

  for (const term of REGRESSION_TERMS) {
    // 1. Resolve matching concept in registry
    const matches = registry.findMatchingConcepts(term);
    const topMatch = matches[0];

    const concept = topMatch?.concept || null;
    const conceptId = concept?.concept_id || 'FALLBACK_CATEGORY';
    const canonicalName = concept?.canonical_name || 'NO_EXACT_CONCEPT';
    const osmTags = concept?.osm_tags || [];
    const claeCodes = concept?.clae_codes || [];
    const relations = concept?.relations || [];

    // 2. Generate Source Query via SourceQueryTranslator
    const spec: UniversalSemanticSpec = {
      spec_version: '1.0',
      raw_objective: term,
      normalized_objective: term,
      entity_type: 'ESTABLISHMENT',
      geography: 'CABA',
      target_limit: 10,
      category: canonicalName,
      entity_subtype: term,
      required_evidence: ['BUSINESS_IDENTITY', 'ACTIVITY_EVIDENCE'],
      validation_mode: 'STRICT_CONSTITUTIONAL'
    };

    const queryStr = translator.buildOverpassQuery(concept, spec, 35, '(-34.70,-58.53,-34.53,-58.35)');

    // Cross-contamination audit
    let hasContamination = false;
    let contaminationReason = '';

    const queryLower = queryStr.toLowerCase();

    if ((term === 'lavanderia' || term === 'tintoreria') && (queryStr.includes('hairdresser') || queryStr.includes('beauty'))) {
      hasContamination = true;
      contaminationReason = 'Laundry contains hairdresser tags';
    }
    if ((term === 'peluqueria' || term === 'barberia') && (queryStr.includes('laundry') || queryStr.includes('dry_cleaning'))) {
      hasContamination = true;
      contaminationReason = 'Hairdresser contains laundry tags';
    }
    if (term === 'farmacia' && (queryStr.includes('hotel') || queryStr.includes('hairdresser'))) {
      hasContamination = true;
      contaminationReason = 'Pharmacy contains hotel/hairdresser tags';
    }

    console.log(`TERM: "${term.toUpperCase()}"`);
    console.log(`  CONCEPT_ID:      ${conceptId}`);
    console.log(`  CANONICAL_NAME:  "${canonicalName}"`);
    console.log(`  OSM_TAGS:        ${JSON.stringify(osmTags)}`);
    console.log(`  CLAE_CODES:      ${JSON.stringify(claeCodes)}`);
    console.log(`  SEMANTIC_ROLE:   ${JSON.stringify(relations)}`);
    console.log(`  OVERPASS_FILTER: ${queryStr.split('\n')[2]?.trim() || queryStr}`);
    console.log(`  CROSS_CONTAMINATION: ${hasContamination ? 'FAIL: ' + contaminationReason : 'NONE (PASS)'}`);
    console.log('------------------------------------------------------------');

    if (hasContamination) {
      allPassed = false;
    }
  }

  console.log(`\nREGRESSION RESULT: ${allPassed ? 'ALL PASSED (100% CLEAN)' : 'FAILED'}`);
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
