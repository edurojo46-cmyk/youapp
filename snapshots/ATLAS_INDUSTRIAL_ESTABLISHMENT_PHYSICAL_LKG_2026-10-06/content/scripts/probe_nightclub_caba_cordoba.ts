import { dbPool } from '../server/db.ts';
import { AtlasConceptRegistry } from '../server/services/industrial/AtlasConceptRegistry.ts';
import { SourceQueryTranslator } from '../server/services/industrial/SourceQueryTranslator.ts';
import type { UniversalSemanticSpec } from '../server/services/industrial/UniversalSemanticResolver.ts';

const PROBE_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter'
];

async function executeProbe(name: string, query: string) {
  console.log(`\n========================================`);
  console.log(`PROBE: ${name}`);
  console.log(`========================================`);
  console.log('QUERY:');
  console.log(query);

  let status = 0;
  let rawCount = 0;
  let parsedElements: any[] = [];

  for (const ep of PROBE_ENDPOINTS) {
    try {
      console.log(`Connecting to mirror: ${ep}...`);
      const res = await fetch(ep, {
        method: 'POST',
        body: query,
        headers: { 'User-Agent': 'Atlas-Diagnostic-Probe/1.0' },
        signal: AbortSignal.timeout(12000)
      });
      status = res.status;
      console.log(`HTTP STATUS: ${status}`);
      if (res.ok) {
        const text = await res.text();
        const json = JSON.parse(text);
        parsedElements = (json.elements || []).map((el: any) => ({
          id: el.id,
          type: el.type,
          name: el.tags?.name || 'SIN_NOMBRE',
          amenity: el.tags?.amenity,
          street: el.tags?.['addr:street'] ? `${el.tags['addr:street']} ${el.tags['addr:housenumber'] || ''}`.trim() : null,
          lat: el.lat || el.center?.lat,
          lon: el.lon || el.center?.lon
        }));
        rawCount = (json.elements || []).length;
        break;
      }
    } catch (err: any) {
      console.warn(`Mirror ${ep} error:`, err.message);
    }
  }

  console.log(`RAW_ROWS = ${rawCount}`);
  console.log(`PARSED_ROWS = ${parsedElements.length}`);
  if (parsedElements.length > 0) {
    console.log('Sample parsed establishments:');
    for (const el of parsedElements.slice(0, 5)) {
      console.log(`  - [ID ${el.id}] "${el.name}" | ${el.amenity} | Address: ${el.street || 'N/D'} (${el.lat}, ${el.lon})`);
    }
  }

  return { name, query, status, rawCount, parsedElements };
}

async function main() {
  const reg = AtlasConceptRegistry.getInstance();
  reg.setDbPool(dbPool);
  await reg.ensureSchema();
  await reg.loadFromDb();

  const translator = SourceQueryTranslator.getInstance();
  const concept = reg.getConcept('NIGHTCLUB_DISCOTECA');

  const specCaba: UniversalSemanticSpec = {
    spec_version: '1.0',
    raw_objective: 'Discoteca / Club nocturno en CABA',
    normalized_objective: 'discoteca / club nocturno',
    entity_type: 'ESTABLISHMENT',
    geography: 'CABA',
    target_limit: 35,
    category: 'Entretenimiento y Vida Nocturna',
    entity_subtype: 'discoteca / club nocturno',
    required_evidence: ['ESTABLISHMENT_IDENTITY', 'NIGHTCLUB_ACTIVITY'],
    validation_mode: 'STRICT_CONSTITUTIONAL'
  };

  const cabaBBox = '(-34.70,-58.53,-34.53,-58.35)';
  const cabaQuery = translator.buildOverpassQuery(concept, specCaba, 35, cabaBBox);

  const specCba: UniversalSemanticSpec = {
    spec_version: '1.0',
    raw_objective: 'Discoteca / Club nocturno en Córdoba Capital',
    normalized_objective: 'discoteca / club nocturno',
    entity_type: 'ESTABLISHMENT',
    geography: 'Córdoba Capital',
    target_limit: 35,
    category: 'Entretenimiento y Vida Nocturna',
    entity_subtype: 'discoteca / club nocturno',
    required_evidence: ['ESTABLISHMENT_IDENTITY', 'NIGHTCLUB_ACTIVITY'],
    validation_mode: 'STRICT_CONSTITUTIONAL'
  };

  const cbaBBox = '(-31.47,-64.25,-31.35,-64.12)';
  const cbaQuery = translator.buildOverpassQuery(concept, specCba, 35, cbaBBox);

  const cabaResult = await executeProbe('Discoteca / Club nocturno en CABA', cabaQuery);
  const cbaResult = await executeProbe('Discoteca / Club nocturno en Córdoba Capital', cbaQuery);

  console.log('\n========================================');
  console.log('PROBE CERTIFICATION SUMMARY:');
  console.log(`CABA:    HTTP ${cabaResult.status} | RAW ${cabaResult.rawCount} | PARSED ${cabaResult.parsedElements.length}`);
  console.log(`CORDOBA: HTTP ${cbaResult.status} | RAW ${cbaResult.rawCount} | PARSED ${cbaResult.parsedElements.length}`);
  console.log('========================================');
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
