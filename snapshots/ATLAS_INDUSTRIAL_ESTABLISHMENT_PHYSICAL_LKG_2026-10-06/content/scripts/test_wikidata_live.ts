import fetch from 'node-fetch';

async function testWikidata() {
  const sparql = `
    SELECT ?item ?itemLabel ?occupationLabel ?workplaceLabel WHERE {
      ?item wdt:P31 wd:Q5 . # Human
      ?item wdt:P937 wd:Q1486 . # Work location: Buenos Aires
      ?item wdt:P106 ?occupation . # Has occupation
      OPTIONAL { ?item wdt:P108 ?workplace . } # Employer
      SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en". }
    }
    LIMIT 25
  `;
  const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(sparql)}&format=json`;
  console.log('Fetching Wikidata SPARQL live endpoint...');
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'AtlasPersonDiscoveryBot/1.0 (https://youapp.tv; atlas@youapp.tv)',
      'Accept': 'application/sparql-results+json'
    }
  });
  console.log('Status:', res.status);
  if (res.ok) {
    const data: any = await res.json();
    const bindings = data.results?.bindings || [];
    console.log(`Wikidata bindings returned: ${bindings.length}`);
    for (const b of bindings.slice(0, 5)) {
      console.log(`- ${b.itemLabel?.value} (QID: ${b.item?.value.split('/').pop()}) | ${b.occupationLabel?.value} | Org: ${b.workplaceLabel?.value || 'none'}`);
    }
  }
}

testWikidata().catch(console.error);
