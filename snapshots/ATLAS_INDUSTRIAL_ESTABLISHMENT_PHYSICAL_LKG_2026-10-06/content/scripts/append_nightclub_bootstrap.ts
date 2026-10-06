import fs from 'fs';
import path from 'path';

const filePath = path.resolve('server/data/ontology/bootstrap_concepts.json');
const raw = fs.readFileSync(filePath, 'utf8');
const list = JSON.parse(raw);

const exists = list.some((x: any) => x.concept_id === 'NIGHTCLUB_DISCOTECA');
if (!exists) {
  list.push({
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
  });

  fs.writeFileSync(filePath, JSON.stringify(list, null, 2), 'utf8');
  console.log('Appended NIGHTCLUB_DISCOTECA to bootstrap_concepts.json');
} else {
  console.log('NIGHTCLUB_DISCOTECA already present in bootstrap_concepts.json');
}
