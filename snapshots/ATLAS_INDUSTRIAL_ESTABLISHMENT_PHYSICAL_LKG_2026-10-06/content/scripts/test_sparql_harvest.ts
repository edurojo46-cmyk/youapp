import https from 'https';

const agent = new https.Agent({ rejectUnauthorized: false });

async function testTotalCabaWorld() {
  const countAll = `
    SELECT (COUNT(DISTINCT ?p) AS ?total) WHERE {
      ?p wdt:P31 wd:Q5 .
      { ?p wdt:P937 wd:Q1486 } UNION { ?p wdt:P551 wd:Q1486 }
    }
  `;
  const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(countAll)}&format=json`;
  const res = await fetch(url, {
    agent,
    headers: {
      'User-Agent': 'AtlasHarvester/1.0 (https://github.com/edurojo46-cmyk/youapp; contact@youapp.com)'
    }
  } as any);
  console.log('Status:', res.status);
  if (res.ok) {
    const json = await res.json();
    console.log('Total CABA persons worldwide (any citizenship):', json.results?.bindings[0]?.total?.value);
  } else {
    console.log('Error text:', (await res.text()).slice(0, 300));
  }
}

testTotalCabaWorld().catch(console.error);
