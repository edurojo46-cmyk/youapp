import https from 'https';

async function test() {
  const query = `
    SELECT ?person ?personLabel WHERE {
      ?person wdt:P31 wd:Q5;
              wdt:P27 wd:Q414;
              wdt:P106 wd:Q43845.
      SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en". }
    } LIMIT 10
  `;
  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`;
  
  const data = await new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'AtlasTeslaWheel/1.0 (mailto:discovery@youapp.internal)',
        'Accept': 'application/sparql-results+json'
      }
    }, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => resolve(JSON.parse(buf)));
    }).on('error', reject);
  });

  console.log('Wikidata Businessperson results:', data.results.bindings.length);
  for (const b of data.results.bindings.slice(0, 3)) {
    console.log(`- ${b.personLabel?.value} (${b.person?.value})`);
  }
}

test().catch(console.error);
