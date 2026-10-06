import { dbPool } from '../server/db.ts';

interface ConceptDetail {
  concept_id: string;
  canonical_name: string;
  osm_tags: string[];
  synonyms: string[];
  aliases: string[];
  clae_codes: string[];
  wikidata_ids: string[];
  categories: string[];
  semantic_features: any;
}

// Map of canonical taxonomy expectations to detect cross-domain contamination
const INCOMPATIBLE_PAIRS: Array<{
  domain: string;
  namePatterns: RegExp[];
  incompatibleOsmPatterns: RegExp[];
  incompatibleSynonymPatterns: RegExp[];
  correctOsmTags: string[];
  provenance: {
    taxonomy: string;
    version: string;
  };
}> = [
  {
    domain: 'FUNERAL_SERVICES',
    namePatterns: [/pompas f[uú]nebres/i, /servicios funerarios/i, /velatorio/i, /cementerio/i, /crematorio/i],
    incompatibleOsmPatterns: [/hairdresser/i, /beauty/i, /laundry/i, /dry_cleaning/i],
    incompatibleSynonymPatterns: [/peluquer[ií]a/i, /corte de pelo/i, /peinado/i, /tintorer[ií]a/i],
    correctOsmTags: ['amenity=funeral_hall', 'shop=funeral_directors', 'amenity=crematorium'],
    provenance: { taxonomy: 'OSM_WIKI_HEALTHCARE_AND_SERVICES', version: '2026.1' }
  },
  {
    domain: 'LAUNDRY_TEXTILE',
    namePatterns: [/lavado y limpieza.*textil/i, /lavander[ií]a/i, /tintorer[ií]a/i],
    incompatibleOsmPatterns: [/hairdresser/i, /beauty/i, /funeral/i, /car_wash/i],
    incompatibleSynonymPatterns: [/peluquer[ií]a/i, /barber[ií]a/i, /manicur/i],
    correctOsmTags: ['shop=laundry', 'shop=dry_cleaning'],
    provenance: { taxonomy: 'OSM_WIKI_SHOP_LAUNDRY', version: '2026.1' }
  },
  {
    domain: 'BEAUTY_HAIRDRESSER',
    namePatterns: [/peluquer[ií]a/i, /tratamientos de belleza/i, /barber[ií]a/i],
    incompatibleOsmPatterns: [/funeral/i, /crematorium/i, /dry_cleaning/i],
    incompatibleSynonymPatterns: [/pompas f[uú]nebres/i, /velatorio/i, /ata[uú]d/i, /tintorer[ií]a/i],
    correctOsmTags: ['shop=hairdresser', 'shop=beauty'],
    provenance: { taxonomy: 'OSM_WIKI_SHOP_HAIRDRESSER', version: '2026.1' }
  },
  {
    domain: 'PHARMACY',
    namePatterns: [/farmacia/i, /medicamentos/i],
    incompatibleOsmPatterns: [/tourism=hotel/i, /shop=hairdresser/i, /amenity=restaurant/i],
    incompatibleSynonymPatterns: [/hotel/i, /alojamiento/i, /peluquer[ií]a/i],
    correctOsmTags: ['amenity=pharmacy', 'healthcare=pharmacy'],
    provenance: { taxonomy: 'OSM_WIKI_AMENITY_PHARMACY', version: '2026.1' }
  },
  {
    domain: 'HOTEL_LODGING',
    namePatterns: [/alojamiento/i, /hotel/i, /hospedaje/i],
    incompatibleOsmPatterns: [/amenity=pharmacy/i, /shop=hairdresser/i, /shop=hardware/i],
    incompatibleSynonymPatterns: [/farmacia/i, /remedio/i, /ferreter[ií]a/i],
    correctOsmTags: ['tourism=hotel', 'tourism=hostel', 'tourism=guest_house', 'tourism=motel'],
    provenance: { taxonomy: 'OSM_WIKI_TOURISM_HOTEL', version: '2026.1' }
  },
  {
    domain: 'HARDWARE_FERRETERIA',
    namePatterns: [/ferreter[ií]a/i, /art[ií]culos de ferreter[ií]a/i],
    incompatibleOsmPatterns: [/amenity=pharmacy/i, /shop=hairdresser/i, /tourism=hotel/i, /amenity=restaurant/i],
    incompatibleSynonymPatterns: [/farmacia/i, /peluquer[ií]a/i, /restaurante/i],
    correctOsmTags: ['shop=hardware', 'shop=doityourself'],
    provenance: { taxonomy: 'OSM_WIKI_SHOP_HARDWARE', version: '2026.1' }
  },
  {
    domain: 'BAKERY_PANADERIA',
    namePatterns: [/panader[ií]a/i, /productos de panader[ií]a/i],
    incompatibleOsmPatterns: [/shop=hairdresser/i, /tourism=hotel/i, /shop=hardware/i],
    incompatibleSynonymPatterns: [/peluquer[ií]a/i, /ferreter[ií]a/i],
    correctOsmTags: ['shop=bakery'],
    provenance: { taxonomy: 'OSM_WIKI_SHOP_BAKERY', version: '2026.1' }
  },
  {
    domain: 'BUTCHER_CARNICERIA',
    namePatterns: [/carnicer[ií]a/i, /comercio de carnes/i],
    incompatibleOsmPatterns: [/shop=hairdresser/i, /tourism=hotel/i, /shop=bakery/i],
    incompatibleSynonymPatterns: [/peluquer[ií]a/i, /panader[ií]a/i],
    correctOsmTags: ['shop=butcher'],
    provenance: { taxonomy: 'OSM_WIKI_SHOP_BUTCHER', version: '2026.1' }
  },
  {
    domain: 'ICE_CREAM_HELADERIA',
    namePatterns: [/helader[ií]a/i, /fabricaci[oó]n de helados/i, /venta de helados/i],
    incompatibleOsmPatterns: [/shop=hairdresser/i, /shop=hardware/i, /amenity=funeral_hall/i],
    incompatibleSynonymPatterns: [/peluquer[ií]a/i, /ferreter[ií]a/i],
    correctOsmTags: ['shop=ice_cream', 'amenity=ice_cream'],
    provenance: { taxonomy: 'OSM_WIKI_SHOP_ICE_CREAM', version: '2026.1' }
  }
];

async function runDeepAudit() {
  console.log('=== RUNNING DEEP TAXONOMY AUDIT ===');
  const res = await dbPool.query('SELECT concept_id, canonical_name, osm_tags, synonyms, aliases, clae_codes, wikidata_ids, categories, semantic_features FROM public.atlas_concept_registry ORDER BY concept_id ASC');
  const all = res.rows as ConceptDetail[];
  console.log(`Auditing ${all.length} registered concepts.`);

  const anomalies: Array<{
    concept_id: string;
    canonical_name: string;
    domain: string;
    detectedIssues: string[];
    suggestedFix: {
      osm_tags: string[];
      provenance: any;
    };
  }> = [];

  for (const c of all) {
    const name = c.canonical_name || '';
    const osm = Array.isArray(c.osm_tags) ? c.osm_tags : [];
    const syns = Array.isArray(c.synonyms) ? c.synonyms : [];

    for (const rule of INCOMPATIBLE_PAIRS) {
      const nameMatches = rule.namePatterns.some(p => p.test(name));
      if (!nameMatches) continue;

      const issues: string[] = [];

      // Check OSM tags
      for (const tag of osm) {
        for (const badTagPat of rule.incompatibleOsmPatterns) {
          if (badTagPat.test(tag)) {
            issues.push(`Incompatible OSM tag '${tag}' for domain ${rule.domain}`);
          }
        }
      }

      // Check Synonyms
      for (const syn of syns) {
        for (const badSynPat of rule.incompatibleSynonymPatterns) {
          if (badSynPat.test(syn)) {
            issues.push(`Incompatible synonym '${syn}' for domain ${rule.domain}`);
          }
        }
      }

      if (issues.length > 0) {
        anomalies.push({
          concept_id: c.concept_id,
          canonical_name: name,
          domain: rule.domain,
          detectedIssues: issues,
          suggestedFix: {
            osm_tags: rule.correctOsmTags,
            provenance: rule.provenance
          }
        });
      }
    }
  }

  console.log(`\nFound ${anomalies.length} high-severity domain contradictions:`);
  for (const a of anomalies) {
    console.log(`\n[${a.concept_id}] "${a.canonical_name}" (Domain: ${a.domain})`);
    for (const iss of a.detectedIssues) {
      console.log(`  - ISSUE: ${iss}`);
    }
    console.log(`  - SUGGESTED FIX: OSM: ${JSON.stringify(a.suggestedFix.osm_tags)} (Provenance: ${a.suggestedFix.provenance.taxonomy})`);
  }

  // Also check consecutive CLAE codes with identical payloads
  console.log('\n--- SCANNING ALL CLAE CODES FOR NEIGHBOR LEAKS ---');
  const claeOnly = all.filter(c => c.concept_id.startsWith('CLAE_'));
  claeOnly.sort((a, b) => parseInt(a.concept_id.slice(5)) - parseInt(b.concept_id.slice(5)));

  const neighborLeaks: any[] = [];
  for (let i = 0; i < claeOnly.length - 1; i++) {
    const a = claeOnly[i];
    const b = claeOnly[i + 1];
    const diff = parseInt(b.concept_id.slice(5)) - parseInt(a.concept_id.slice(5));
    if (diff === 1) {
      const aOsm = (a.osm_tags || []).join(',');
      const bOsm = (b.osm_tags || []).join(',');
      const aSyn = (a.synonyms || []).join(',');
      const bSyn = (b.synonyms || []).join(',');

      // If exact same synonyms or tags between consecutive codes but drastically different names
      if (aSyn && aSyn === bSyn && a.canonical_name !== b.canonical_name) {
        neighborLeaks.push({
          leakType: 'EXACT_SYNONYMS_LEAK',
          a: { id: a.concept_id, name: a.canonical_name, syns: a.synonyms },
          b: { id: b.concept_id, name: b.canonical_name, syns: b.synonyms }
        });
      }
      if (aOsm && aOsm === bOsm && aOsm.includes('hairdresser') && !b.canonical_name.toLowerCase().includes('belleza') && !b.canonical_name.toLowerCase().includes('peluquer')) {
        neighborLeaks.push({
          leakType: 'HAIRDRESSER_TAG_LEAK',
          a: { id: a.concept_id, name: a.canonical_name, osm: a.osm_tags },
          b: { id: b.concept_id, name: b.canonical_name, osm: b.osm_tags }
        });
      }
    }
  }

  console.log(`Neighbor Leaks Detected: ${neighborLeaks.length}`);
  for (const nl of neighborLeaks) {
    console.log(`  Leak [${nl.leakType}]: ${nl.a.id} ("${nl.a.name}") -> ${nl.b.id} ("${nl.b.name}")`);
  }

  return { anomalies, neighborLeaks };
}

runDeepAudit()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
