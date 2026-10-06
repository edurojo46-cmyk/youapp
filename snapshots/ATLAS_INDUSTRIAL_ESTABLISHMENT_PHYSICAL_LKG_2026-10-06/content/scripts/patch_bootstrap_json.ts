import fs from 'fs';
import path from 'path';

const filePath = path.resolve('server/data/ontology/bootstrap_concepts.json');
const raw = fs.readFileSync(filePath, 'utf8');
const list = JSON.parse(raw);

let patched = 0;
for (const item of list) {
  if (item.concept_id === 'CLAE_9601') {
    item.synonyms = [
      'lavanderia',
      'lavanderias',
      'tintoreria',
      'tintorerias',
      'laundry',
      'dry cleaning',
      'lavado y limpieza textil',
      'lavado y limpieza, incluida la limpieza en seco, de productos textiles y de piel'
    ];
    item.aliases = ['lavanderia', 'tintoreria', 'laundry'];
    item.osm_tags = ['shop=laundry', 'shop=dry_cleaning'];
    item.wikidata_ids = ['Q863777', 'Q159265'];
    item.semantic_features.osm_tags = ['shop=laundry', 'shop=dry_cleaning'];
    item.semantic_features.wikidata_ids = ['Q863777', 'Q159265'];
    item.provenance = 'INDEC_CLAE_2010_REV4::OSM_WIKI_SHOP::v2026.1';
    patched++;
  } else if (item.concept_id === 'CLAE_9603') {
    item.synonyms = [
      'pompas funebres',
      'servicios funerarios',
      'funeraria',
      'funerarias',
      'cocheria',
      'cocherias',
      'velatorio',
      'velatorios',
      'crematorio',
      'crematorios',
      'pompas funebres y actividades conexas'
    ];
    item.aliases = ['funeraria', 'servicios funerarios'];
    item.osm_tags = ['amenity=funeral_hall', 'shop=funeral_directors', 'amenity=crematorium'];
    item.wikidata_ids = ['Q323491', 'Q4830453'];
    item.semantic_features.osm_tags = ['amenity=funeral_hall', 'shop=funeral_directors', 'amenity=crematorium'];
    item.semantic_features.wikidata_ids = ['Q323491', 'Q4830453'];
    item.provenance = 'INDEC_CLAE_2010_REV4::OSM_WIKI_SERVICES::v2026.1';
    patched++;
  } else if (item.concept_id === 'CLAE_9609') {
    item.synonyms = [
      'servicios personales',
      'actividades de servicios personales',
      'servicios personales ncp',
      'cuidado de mascotas',
      'paseador de perros',
      'astrologia y espiritismo',
      'servicios de citas',
      'tatuajes y piercings',
      'otras actividades de servicios personales'
    ];
    item.aliases = ['servicios personales ncp'];
    item.osm_tags = ['shop=tattoo', 'amenity=animal_boarding', 'amenity=animal_shelter'];
    item.wikidata_ids = ['Q1146747'];
    item.semantic_features.osm_tags = ['shop=tattoo', 'amenity=animal_boarding', 'amenity=animal_shelter'];
    item.semantic_features.wikidata_ids = ['Q1146747'];
    item.provenance = 'INDEC_CLAE_2010_REV4::OSM_WIKI_SERVICES::v2026.1';
    patched++;
  }
}

fs.writeFileSync(filePath, JSON.stringify(list, null, 2), 'utf8');
console.log(`Successfully patched ${patched} bootstrap concepts in JSON file on disk.`);
