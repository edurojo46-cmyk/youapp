import fetch from 'node-fetch';

async function testAlternatives() {
  console.log('Testing Alternative Sources in Source Map...\n');

  // 1. SEDICI OAI-PMH
  try {
    const t0 = Date.now();
    const res = await fetch('http://sedici.unlp.edu.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc');
    console.log(`[1] SEDICI UNLP OAI-PMH: status ${res.status} in ${Date.now() - t0}ms`);
  } catch (e) {
    console.log(`[1] SEDICI Error: ${e.message}`);
  }

  // 2. INTA OAI-PMH
  try {
    const t0 = Date.now();
    const res = await fetch('https://repositorio.inta.gob.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc');
    console.log(`[2] INTA Digital OAI-PMH: status ${res.status} in ${Date.now() - t0}ms`);
  } catch (e) {
    console.log(`[2] INTA Error: ${e.message}`);
  }

  // 3. UNS Digital OAI-PMH
  try {
    const t0 = Date.now();
    const res = await fetch('https://repositoriodigital.uns.edu.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc');
    console.log(`[3] UNS Digital OAI-PMH: status ${res.status} in ${Date.now() - t0}ms`);
  } catch (e) {
    console.log(`[3] UNS Error: ${e.message}`);
  }

  // 4. Wikidata SPARQL for CABA & PBA Public Officials
  try {
    const t0 = Date.now();
    const sparql = `
      SELECT ?person ?personLabel ?roleLabel ?partyLabel WHERE {
        ?person wdt:P31 wd:Q5;
                wdt:P27 wd:Q414;
                wdt:P106 ?role.
        VALUES ?role { wd:Q82955 wd:Q14212 wd:Q30461 wd:Q7188 wd:Q40348 }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "es". }
      } LIMIT 500
    `;
    const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(sparql)}&format=json`;
    const res = await fetch(url, { headers: { 'User-Agent': 'AtlasAutonomousDiscovery/2.0 (+https://youapp.com)' } });
    console.log(`[4] Wikidata SPARQL Officials: status ${res.status} in ${Date.now() - t0}ms`);
    if (res.ok) {
      const json = await res.json();
      console.log(`    Returned: ${json.results?.bindings?.length} people`);
    }
  } catch (e) {
    console.log(`[4] Wikidata Error: ${e.message}`);
  }

  // 5. BA Data Open Data Portal
  try {
    const t0 = Date.now();
    const res = await fetch('https://data.buenosaires.gob.ar/api/datasets?limit=10');
    console.log(`[5] BA Data Portal: status ${res.status} in ${Date.now() - t0}ms`);
  } catch (e) {
    console.log(`[5] BA Data Error: ${e.message}`);
  }
}

testAlternatives().catch(console.error);
