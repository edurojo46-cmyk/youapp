import { dbPool } from '../server/db.ts';

interface RemediationEntry {
  concept_id: string;
  canonical_name: string;
  synonyms: string[];
  aliases: string[];
  osm_tags: string[];
  clae_codes: string[];
  wikidata_ids: string[];
  categories: string[];
  provenance_metadata: {
    source_taxonomy: string;
    source_identifier: string;
    source_version: string;
    ingested_at: string;
  };
}

const REMEDIATION_CATALOG: RemediationEntry[] = [
  {
    concept_id: 'CLAE_9601',
    canonical_name: 'Lavado y limpieza, incluida la limpieza en seco, de productos textiles y de piel',
    synonyms: [
      'lavanderia',
      'lavanderias',
      'tintoreria',
      'tintorerias',
      'laundry',
      'dry cleaning',
      'lavado y limpieza textil',
      'lavado y limpieza, incluida la limpieza en seco, de productos textiles y de piel'
    ],
    aliases: [
      'lavanderia',
      'tintoreria',
      'laundry'
    ],
    osm_tags: ['shop=laundry', 'shop=dry_cleaning'],
    clae_codes: ['9601'],
    wikidata_ids: ['Q863777', 'Q159265'],
    categories: ['PERSONAL_SERVICES', 'CLAE_9601'],
    provenance_metadata: {
      source_taxonomy: 'INDEC_CLAE_2010_REV4::OSM_WIKI_SHOP',
      source_identifier: 'CLAE_9601::shop=laundry::Q863777',
      source_version: '2026.1',
      ingested_at: new Date().toISOString()
    }
  },
  {
    concept_id: 'CLAE_9603',
    canonical_name: 'Pompas fúnebres y actividades conexas',
    synonyms: [
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
    ],
    aliases: [
      'funeraria',
      'servicios funerarios'
    ],
    osm_tags: ['amenity=funeral_hall', 'shop=funeral_directors', 'amenity=crematorium'],
    clae_codes: ['9603'],
    wikidata_ids: ['Q323491', 'Q4830453'],
    categories: ['PERSONAL_SERVICES', 'CLAE_9603'],
    provenance_metadata: {
      source_taxonomy: 'INDEC_CLAE_2010_REV4::OSM_WIKI_SERVICES',
      source_identifier: 'CLAE_9603::amenity=funeral_hall::Q323491',
      source_version: '2026.1',
      ingested_at: new Date().toISOString()
    }
  },
  {
    concept_id: 'CLAE_9609',
    canonical_name: 'Otras actividades de servicios personales n.c.p.',
    synonyms: [
      'servicios personales',
      'actividades de servicios personales',
      'servicios personales ncp',
      'cuidado de mascotas',
      'paseador de perros',
      'astrologia y espiritismo',
      'servicios de citas',
      'tatuajes y piercings',
      'otras actividades de servicios personales'
    ],
    aliases: [
      'servicios personales ncp'
    ],
    osm_tags: ['shop=tattoo', 'amenity=animal_boarding', 'amenity=animal_shelter'],
    clae_codes: ['9609'],
    wikidata_ids: ['Q1146747'],
    categories: ['PERSONAL_SERVICES', 'CLAE_9609'],
    provenance_metadata: {
      source_taxonomy: 'INDEC_CLAE_2010_REV4::OSM_WIKI_SERVICES',
      source_identifier: 'CLAE_9609::shop=tattoo::Q1146747',
      source_version: '2026.1',
      ingested_at: new Date().toISOString()
    }
  },
  {
    concept_id: 'CLAE_DIV_96',
    canonical_name: 'Otras actividades de servicios personales',
    synonyms: [
      'otras actividades de servicios personales',
      'servicios personales',
      'servicios a personas'
    ],
    aliases: [
      'servicios personales'
    ],
    osm_tags: ['shop=laundry', 'shop=hairdresser', 'shop=beauty', 'shop=funeral_directors'],
    clae_codes: ['DIV_96'],
    wikidata_ids: ['Q1146747'],
    categories: ['PERSONAL_SERVICES', 'CLAE_DIV_96'],
    provenance_metadata: {
      source_taxonomy: 'INDEC_CLAE_2010_REV4',
      source_identifier: 'CLAE_DIV_96::Q1146747',
      source_version: '2026.1',
      ingested_at: new Date().toISOString()
    }
  },
  {
    concept_id: 'CLAE_GRP_960',
    canonical_name: 'Otras actividades de servicios personales',
    synonyms: [
      'otras actividades de servicios personales',
      'servicios personales',
      'servicios a personas'
    ],
    aliases: [
      'servicios personales'
    ],
    osm_tags: ['shop=laundry', 'shop=hairdresser', 'shop=beauty', 'shop=funeral_directors'],
    clae_codes: ['GRP_960'],
    wikidata_ids: ['Q1146747'],
    categories: ['PERSONAL_SERVICES', 'CLAE_GRP_960'],
    provenance_metadata: {
      source_taxonomy: 'INDEC_CLAE_2010_REV4',
      source_identifier: 'CLAE_GRP_960::Q1146747',
      source_version: '2026.1',
      ingested_at: new Date().toISOString()
    }
  }
];

async function main() {
  console.log('=== STARTING PROVENANCE-TRACKED CONCEPT REMEDIATION ===');

  for (const entry of REMEDIATION_CATALOG) {
    const provStr = `${entry.provenance_metadata.source_taxonomy}::v${entry.provenance_metadata.source_version}`;

    await dbPool.query(`
      UPDATE public.atlas_concept_registry
      SET
        canonical_name = $1,
        synonyms = $2::jsonb,
        aliases = $3::jsonb,
        osm_tags = $4::jsonb,
        clae_codes = $5::jsonb,
        wikidata_ids = $6::jsonb,
        categories = $7::jsonb,
        provenance = $8,
        semantic_features = jsonb_build_object(
          'osm_tags', $4::jsonb,
          'clae_codes', $5::jsonb,
          'wikidata_ids', $6::jsonb,
          'provenance_metadata', $9::jsonb
        ),
        updated_at = NOW()
      WHERE concept_id = $10;
    `, [
      entry.canonical_name,
      JSON.stringify(entry.synonyms),
      JSON.stringify(entry.aliases),
      JSON.stringify(entry.osm_tags),
      JSON.stringify(entry.clae_codes),
      JSON.stringify(entry.wikidata_ids),
      JSON.stringify(entry.categories),
      provStr,
      JSON.stringify(entry.provenance_metadata),
      entry.concept_id
    ]);

    console.log(`Remediated [${entry.concept_id}] "${entry.canonical_name}" with provenance.`);
  }

  console.log('\nRemediation complete. Verifying updated rows:');
  const res = await dbPool.query(`
    SELECT concept_id, canonical_name, osm_tags, synonyms, wikidata_ids, provenance
    FROM public.atlas_concept_registry
    WHERE concept_id IN ('CLAE_9601', 'CLAE_9602', 'CLAE_9603', 'CLAE_9609', 'CLAE_DIV_96', 'CLAE_GRP_960')
    ORDER BY concept_id ASC;
  `);

  for (const r of res.rows) {
    console.log(`\n[${r.concept_id}] "${r.canonical_name}"`);
    console.log(`  OSM: ${JSON.stringify(r.osm_tags)}`);
    console.log(`  Syns: ${JSON.stringify(r.synonyms)}`);
    console.log(`  Wiki: ${JSON.stringify(r.wikidata_ids)}`);
    console.log(`  Provenance: ${r.provenance}`);
  }
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
