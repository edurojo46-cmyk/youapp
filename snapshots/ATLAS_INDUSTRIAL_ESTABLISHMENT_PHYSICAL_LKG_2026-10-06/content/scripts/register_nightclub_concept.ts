import { dbPool } from '../server/db.ts';
import { AtlasConceptRegistry, type AtlasConceptDefinition } from '../server/services/industrial/AtlasConceptRegistry.ts';
import { AtlasConceptIntegrityGate } from '../server/services/industrial/AtlasConceptIntegrityGate.ts';

const nightclubConcept: AtlasConceptDefinition = {
  concept_id: 'NIGHTCLUB_DISCOTECA',
  canonical_name: 'Discoteca / Club nocturno',
  synonyms: [
    'discoteca',
    'discotecas',
    'club nocturno',
    'clubes nocturnos',
    'boliche',
    'boliches',
    'bailanta',
    'bailantas',
    'disco',
    'nightclub',
    'night club',
    'salon de baile',
    'discoteca / club nocturno'
  ],
  aliases: [
    'discoteca',
    'club nocturno',
    'boliche',
    'disco',
    'nightclub'
  ],
  entity_types: ['ESTABLISHMENT'],
  row_units: ['ESTABLISHMENT'],
  default_row_unit: 'ESTABLISHMENT',
  categories: ['ENTERTAINMENT_NIGHTLIFE', 'NIGHTCLUB'],
  activities: ['NIGHTLIFE_ENTERTAINMENT', 'DANCE_CLUB', 'BEVERAGE_SERVICE'],
  relations: ['SERVICE_PROVIDER', 'ESTABLISHMENT_SERVICE'],
  products: [],
  services: ['BAILE_Y_MUSICA_NOCTURNA', 'SERVICIO_DE_BEBIDAS_NOCTURNO'],
  service_display: 'DISCOTECA Y ESPARCIMIENTO NOCTURNO',
  parent_concepts: ['CLAE_5630', 'CLAE_DIV_56'],
  child_concepts: [],
  negative_concepts: {
    disallowed_roles: ['MANUFACTURER', 'WHOLESALE_TRADER'],
    disallowed_categories: ['HEALTHCARE', 'PHARMACY', 'HARDWARE'],
    disallowed_keywords: ['farmacia', 'ferreteria', 'taller mecanico', 'escuela'],
    reason: 'Una discoteca / club nocturno es un establecimiento recreativo nocturno con música y baile.'
  },
  required_evidence: ['ESTABLISHMENT_IDENTITY', 'NIGHTCLUB_ACTIVITY'],
  osm_tags: ['amenity=nightclub'],
  clae_codes: ['5630', '9329'],
  wikidata_ids: ['Q1228895'],
  other_external_taxonomy_ids: {
    isic_rev4: '5630',
    clae_subclase: '563020'
  },
  source_hints: ['SRC_OSM_PUBLIC_ESTABLISHMENTS'],
  source_capability_hints: ['SPATIAL_BBOX', 'POINT_ESTABLISHMENT'],
  confidence: 1.0,
  provenance: 'OSM_WIKI_AMENITY_NIGHTCLUB::INDEC_CLAE_2010::v2026.1',
  validation_state: 'VALIDATED',
  version: 1,
  semantic_features: {
    osm_tags: ['amenity=nightclub'],
    clae_codes: ['5630', '9329'],
    wikidata_ids: ['Q1228895'],
    provenance_metadata: {
      source_taxonomy: 'OSM_WIKI_AMENITY_NIGHTCLUB::INDEC_CLAE_2010',
      source_identifier: 'amenity=nightclub::Q1228895::563020',
      source_version: '2026.1',
      ingested_at: new Date().toISOString()
    }
  }
};

async function main() {
  console.log('=== VALIDATING & REGISTERING NIGHTCLUB_DISCOTECA ===');
  const gate = AtlasConceptIntegrityGate.getInstance();
  const val = gate.validateConcept(nightclubConcept);
  console.log('Gate validation result:', val);
  if (!val.valid) {
    throw new Error('Concept failed integrity gate: ' + JSON.stringify(val.issues));
  }

  const registry = AtlasConceptRegistry.getInstance();
  registry.setDbPool(dbPool);
  await registry.ensureSchema();
  await registry.registerConceptInDb(nightclubConcept);
  await registry.loadFromDb();

  console.log('Successfully registered in DB and loaded in memory!');

  // Verify findMatchingConcepts
  const matches = registry.findMatchingConcepts('Discoteca / Club nocturno');
  console.log('\nMatches for "Discoteca / Club nocturno":', matches.length);
  if (matches.length > 0) {
    console.log(`Top match: [${matches[0].concept.concept_id}] "${matches[0].concept.canonical_name}" | OSM: ${JSON.stringify(matches[0].concept.osm_tags)}`);
  }

  const bolicheMatches = registry.findMatchingConcepts('boliche');
  console.log('\nMatches for "boliche":', bolicheMatches.length);
  if (bolicheMatches.length > 0) {
    console.log(`Top match: [${bolicheMatches[0].concept.concept_id}] "${bolicheMatches[0].concept.canonical_name}" | OSM: ${JSON.stringify(bolicheMatches[0].concept.osm_tags)}`);
  }
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
