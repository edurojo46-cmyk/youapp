import { dbPool } from '../server/db.ts';
import crypto from 'crypto';

interface ConceptRow {
  concept_id: string;
  canonical_name: string;
  synonyms: any;
  aliases: any;
  entity_types: any;
  row_units: any;
  default_row_unit: string;
  categories: any;
  activities: any;
  relations: any;
  products: any;
  services: any;
  required_evidence: any;
  semantic_features: any;
  osm_tags: any;
  clae_codes: any;
  wikidata_ids: any;
  provenance: string;
  validation_state: string;
}

function normalizeArray(arr: any): string[] {
  if (!arr) return [];
  if (Array.isArray(arr)) {
    return arr.map(x => String(x).trim().toLowerCase()).filter(Boolean).sort();
  }
  return [];
}

function hashPayload(obj: any): string {
  const norm = JSON.stringify(obj, Object.keys(obj).sort());
  return crypto.createHash('sha256').update(norm).digest('hex').slice(0, 16);
}

async function audit() {
  console.log('=== STARTING GLOBAL CONCEPT REGISTRY AUDIT ===');
  const res = await dbPool.query<ConceptRow>('SELECT * FROM public.atlas_concept_registry ORDER BY concept_id ASC');
  const concepts = res.rows;
  console.log(`Total concepts loaded: ${concepts.length}`);

  // 1. Group by payload hash
  const payloadMap = new Map<string, ConceptRow[]>();
  const osmMap = new Map<string, ConceptRow[]>();
  const claeMap = new Map<string, ConceptRow[]>();

  for (const c of concepts) {
    const syns = normalizeArray(c.synonyms);
    const aliases = normalizeArray(c.aliases);
    const osm = normalizeArray(c.osm_tags);
    const clae = normalizeArray(c.clae_codes);
    const wiki = normalizeArray(c.wikidata_ids);
    const sf = c.semantic_features || {};

    const payload = {
      synonyms: syns,
      aliases: aliases,
      osm_tags: osm,
      clae_codes: clae,
      wikidata_ids: wiki
    };

    const hash = hashPayload(payload);
    if (!payloadMap.has(hash)) {
      payloadMap.set(hash, []);
    }
    payloadMap.get(hash)!.push(c);

    for (const tag of osm) {
      if (!osmMap.has(tag)) osmMap.set(tag, []);
      osmMap.get(tag)!.push(c);
    }

    for (const code of clae) {
      if (!claeMap.has(code)) claeMap.set(code, []);
      claeMap.get(code)!.push(c);
    }
  }

  // Find duplicated payloads
  console.log('\n--- DUPLICATE PAYLOAD GROUPS (Payload hash collisions > 1) ---');
  let dupPayloadCount = 0;
  for (const [hash, group] of payloadMap.entries()) {
    if (group.length > 1) {
      dupPayloadCount++;
      console.log(`\nGroup Hash [${hash}] (${group.length} concepts):`);
      for (const item of group) {
        console.log(`  - [${item.concept_id}] "${item.canonical_name}" | OSM: ${JSON.stringify(item.osm_tags)} | CLAE: ${JSON.stringify(item.clae_codes)}`);
      }
    }
  }

  // 2. Audit CLAE neighbor consistency
  console.log('\n--- CLAE NEIGHBOR AND NUMERICAL CONSISTENCY ---');
  const claeConcepts = concepts.filter(c => c.concept_id.startsWith('CLAE_'));
  // Sort numerically by CLAE code
  claeConcepts.sort((a, b) => {
    const na = parseInt(a.concept_id.replace('CLAE_', ''), 10) || 0;
    const nb = parseInt(b.concept_id.replace('CLAE_', ''), 10) || 0;
    return na - nb;
  });

  const suspiciousNeighbors: any[] = [];
  for (let i = 0; i < claeConcepts.length - 1; i++) {
    const curr = claeConcepts[i];
    const next = claeConcepts[i + 1];

    const currNum = parseInt(curr.concept_id.replace('CLAE_', ''), 10);
    const nextNum = parseInt(next.concept_id.replace('CLAE_', ''), 10);

    // If consecutive numbers
    if (nextNum - currNum <= 2) {
      const currSyns = normalizeArray(curr.synonyms).join('|');
      const nextSyns = normalizeArray(next.synonyms).join('|');
      const currOsm = normalizeArray(curr.osm_tags).join('|');
      const nextOsm = normalizeArray(next.osm_tags).join('|');

      if ((currSyns.length > 0 && currSyns === nextSyns) || (currOsm.length > 0 && currOsm === nextOsm)) {
        suspiciousNeighbors.push({
          a: { id: curr.concept_id, name: curr.canonical_name, osm: curr.osm_tags, syns: curr.synonyms },
          b: { id: next.concept_id, name: next.canonical_name, osm: next.osm_tags, syns: next.synonyms }
        });
      }
    }
  }

  console.log(`Suspicious consecutive CLAE neighbors sharing exact syns or OSM tags: ${suspiciousNeighbors.length}`);
  for (const s of suspiciousNeighbors) {
    console.log(`  [${s.a.id}] "${s.a.name}" <---> [${s.b.id}] "${s.b.name}"`);
    console.log(`    A OSM: ${JSON.stringify(s.a.osm)} | B OSM: ${JSON.stringify(s.b.osm)}`);
  }

  // 3. Cross-dimension consistency (name vs tags)
  console.log('\n--- CROSS-DIMENSION CONTRADICTIONS ---');
  const contradictions: any[] = [];
  for (const c of concepts) {
    const nameLower = (c.canonical_name || '').toLowerCase();
    const osm = normalizeArray(c.osm_tags);
    const syns = normalizeArray(c.synonyms);

    // Check specific known taxonomy collisions
    // e.g., Laundry vs Hairdresser
    if ((nameLower.includes('lavad') || nameLower.includes('tintorer')) && osm.some(t => t.includes('hairdresser') || t.includes('beauty'))) {
      contradictions.push({ id: c.concept_id, name: c.canonical_name, reason: 'Laundry with Hairdresser tags', osm });
    }
    // e.g., Hairdresser vs Laundry
    if ((nameLower.includes('peluquer') || nameLower.includes('barber')) && osm.some(t => t.includes('laundry') || t.includes('dry_cleaning'))) {
      contradictions.push({ id: c.concept_id, name: c.canonical_name, reason: 'Hairdresser with Laundry tags', osm });
    }
    // e.g., Pharmacy with hotel tags
    if (nameLower.includes('farmacia') && osm.some(t => t.includes('hotel') || t.includes('tourism'))) {
      contradictions.push({ id: c.concept_id, name: c.canonical_name, reason: 'Pharmacy with Hotel tags', osm });
    }
    // e.g., Metal / Torneria with food tags
    if ((nameLower.includes('torner') || nameLower.includes('metalurg')) && osm.some(t => t.includes('restaurant') || t.includes('bakery') || t.includes('food'))) {
      contradictions.push({ id: c.concept_id, name: c.canonical_name, reason: 'Metallurgy with Food tags', osm });
    }
  }
  console.log(`Cross-dimension contradictions found: ${contradictions.length}`);
  for (const ct of contradictions) {
    console.log(`  - [${ct.id}] "${ct.name}": ${ct.reason} (OSM: ${JSON.stringify(ct.osm)})`);
  }

  console.log('\n=== AUDIT SUMMARY ===');
  console.log(`TOTAL_CONCEPTS_AUDITED: ${concepts.length}`);
  console.log(`SUSPICIOUS_DUPLICATE_PAYLOAD_GROUPS: ${dupPayloadCount}`);
  console.log(`SUSPICIOUS_CONSECUTIVE_CLAE_NEIGHBORS: ${suspiciousNeighbors.length}`);
  console.log(`CROSS_DIMENSION_CONTRADICTIONS: ${contradictions.length}`);
}

audit()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Audit failed:', err);
    process.exit(1);
  });
