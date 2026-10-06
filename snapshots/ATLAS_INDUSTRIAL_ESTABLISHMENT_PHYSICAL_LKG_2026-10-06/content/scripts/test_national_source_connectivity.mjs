import crypto from 'crypto';

const testSources = [
  {
    id: 'SRC_OAI_UNC_CORDOBA',
    name: 'Universidad Nacional de Córdoba (RDU UNC)',
    province: 'Córdoba',
    url: 'https://rdu.unc.edu.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc'
  },
  {
    id: 'SRC_OAI_UNR_ROSARIO',
    name: 'Universidad Nacional de Rosario (RepHipUNR)',
    province: 'Santa Fe',
    url: 'https://rephip.unr.edu.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc'
  },
  {
    id: 'SRC_OAI_UNCUYO_MENDOZA',
    name: 'Universidad Nacional de Cuyo (SID UNCuyo)',
    province: 'Mendoza',
    url: 'https://bdigital.uncuyo.edu.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc'
  },
  {
    id: 'SRC_OAI_UNL_LITORAL',
    name: 'Universidad Nacional del Litoral (Santa Fe)',
    province: 'Santa Fe',
    url: 'https://bibliotecavirtual.unl.edu.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc'
  },
  {
    id: 'SRC_OAI_UNNE_NORDESTE',
    name: 'Universidad Nacional del Nordeste (Corrientes / Chaco)',
    province: 'Corrientes',
    url: 'https://repositorio.unne.edu.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc'
  },
  {
    id: 'SRC_OAI_UNT_TUCUMAN',
    name: 'Universidad Nacional de Tucumán',
    province: 'Tucumán',
    url: 'https://ri.unt.edu.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc'
  },
  {
    id: 'SRC_OAI_UNCOMA_COMAHUE',
    name: 'Universidad Nacional del Comahue (Neuquén / Río Negro)',
    province: 'Neuquén',
    url: 'https://rdi.uncoma.edu.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc'
  },
  {
    id: 'SRC_OAI_UNER_ENTRERIOS',
    name: 'Universidad Nacional de Entre Ríos (SciELO / UNER)',
    province: 'Entre Ríos',
    url: 'https://cienciaergosum.uner.edu.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc'
  },
  {
    id: 'SRC_OA_OPENALEX_AR_CORDOBA',
    name: 'OpenAlex Academic Authors - UNC Córdoba',
    province: 'Córdoba',
    url: 'https://api.openalex.org/authors?filter=last_known_institutions.country_code:AR,last_known_institutions.ror:https://ror.org/004bvx049&per-page=50'
  },
  {
    id: 'SRC_OA_OPENALEX_AR_ROSARIO',
    name: 'OpenAlex Academic Authors - UNR Rosario',
    province: 'Santa Fe',
    url: 'https://api.openalex.org/authors?filter=last_known_institutions.country_code:AR,last_known_institutions.ror:https://ror.org/01t8f8j08&per-page=50'
  },
  {
    id: 'SRC_OA_OPENALEX_AR_MENDOZA',
    name: 'OpenAlex Academic Authors - UNCuyo Mendoza',
    province: 'Mendoza',
    url: 'https://api.openalex.org/authors?filter=last_known_institutions.country_code:AR,last_known_institutions.ror:https://ror.org/03scb1e56&per-page=50'
  },
  {
    id: 'SRC_OA_OPENALEX_AR_NATIONAL',
    name: 'OpenAlex Academic Authors - National Argentina',
    province: 'Argentina',
    url: 'https://api.openalex.org/authors?filter=last_known_institutions.country_code:AR&per-page=50'
  },
  {
    id: 'SRC_SPARQL_WIKIDATA_AR_LEADERS',
    name: 'Wikidata Argentina Citizens with Public Roles',
    province: 'Argentina',
    url: `https://query.wikidata.org/sparql?query=${encodeURIComponent(`
      SELECT ?person ?personLabel ?birthPlaceLabel WHERE {
        ?person wdt:P31 wd:Q5 .
        ?person wdt:P27 wd:Q414 .
        ?person wdt:P106 ?occ .
        SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en". }
      } LIMIT 100
    `)}&format=json`
  }
];

async function main() {
  console.log('Testing National Public Endpoints across 24 Jurisdictions...\n');
  
  for (const s of testSources) {
    const t0 = performance.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(s.url, {
        headers: {
          'User-Agent': 'AtlasAutonomousDiscovery/2.0 (+https://youapp.com; Argentine National Public Index)',
          'Accept': '*/*'
        },
        signal: controller.signal
      });
      clearTimeout(timeout);
      const dt = performance.now() - t0;

      if (!res.ok) {
        console.log(`[HTTP ${res.status}] ${s.name} (${s.province}): FAIL in ${dt.toFixed(0)}ms`);
        continue;
      }

      const body = await res.text();
      let extractedCount = 0;

      if (body.includes('<record>')) {
        const records = body.split('<record>').slice(1);
        extractedCount = records.length;
      } else if (s.url.includes('openalex.org')) {
        try {
          const json = JSON.parse(body);
          extractedCount = json.results?.length || 0;
        } catch {}
      } else if (s.url.includes('wikidata.org')) {
        try {
          const json = JSON.parse(body);
          extractedCount = json.results?.bindings?.length || 0;
        } catch {}
      }

      console.log(`[✓ ${res.status}] ${s.name} (${s.province}): ${extractedCount} records in ${dt.toFixed(0)}ms (Size: ${(body.length / 1024).toFixed(1)} KB)`);
    } catch (e) {
      const dt = performance.now() - t0;
      console.log(`[ERR] ${s.name} (${s.province}): ${e.message} in ${dt.toFixed(0)}ms`);
    }
  }
}

main().catch(console.error);
