import fetch from 'node-fetch';

async function testWikidataQueries() {
  const queries = [
    {
      name: 'Public Officials CABA/PBA',
      sparql: `
        SELECT ?person ?personLabel ?roleLabel ?locationLabel WHERE {
          ?person wdt:P31 wd:Q5;
                  wdt:P27 wd:Q414;
                  wdt:P106 ?role.
          VALUES ?role { wd:Q82955 wd:Q14212 wd:Q30461 wd:Q7188 wd:Q40348 wd:Q193391 wd:Q212238 }
          SERVICE wikibase:label { bd:serviceParam wikibase:language "es". }
        } LIMIT 2000
      `
    },
    {
      name: 'Scientists & Professors Argentina',
      sparql: `
        SELECT ?person ?personLabel ?roleLabel ?employerLabel WHERE {
          ?person wdt:P31 wd:Q5;
                  wdt:P27 wd:Q414;
                  wdt:P106 ?role.
          VALUES ?role { wd:Q901 wd:Q1650915 wd:Q170790 wd:Q169470 }
          SERVICE wikibase:label { bd:serviceParam wikibase:language "es". }
        } LIMIT 2000
      `
    },
    {
      name: 'Physicians & Health Professionals',
      sparql: `
        SELECT ?person ?personLabel ?roleLabel WHERE {
          ?person wdt:P31 wd:Q5;
                  wdt:P27 wd:Q414;
                  wdt:P106 ?role.
          VALUES ?role { wd:Q39631 wd:Q1114448 wd:Q1700624 wd:Q205370 }
          SERVICE wikibase:label { bd:serviceParam wikibase:language "es". }
        } LIMIT 2000
      `
    }
  ];

  for (const q of queries) {
    const t0 = Date.now();
    const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(q.sparql)}&format=json`;
    const res = await fetch(url, { headers: { 'User-Agent': 'AtlasAutonomousDiscovery/2.0 (+https://youapp.com)' } });
    if (res.ok) {
      const json = await res.json();
      console.log(`- ${q.name}: ${json.results?.bindings?.length} people in ${Date.now() - t0}ms`);
      if (json.results?.bindings?.length > 0) {
        console.log(`  Sample: ${json.results.bindings[0].personLabel?.value} (${json.results.bindings[0].roleLabel?.value})`);
      }
    } else {
      console.log(`- ${q.name}: HTTP ${res.status}`);
    }
  }
}

testWikidataQueries().catch(console.error);
