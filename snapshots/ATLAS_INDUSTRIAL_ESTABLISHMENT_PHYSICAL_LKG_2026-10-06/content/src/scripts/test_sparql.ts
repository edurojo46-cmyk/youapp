async function test() {
  const q = `SELECT ?person ?personLabel WHERE {
    ?person wdt:P31 wd:Q5;
            wdt:P106 wd:Q508846.
    SERVICE wikibase:label { bd:serviceParam wikibase:language "es". }
  } LIMIT 5`;
  
  const r = await fetch('https://query.wikidata.org/sparql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/sparql-results+json',
      'User-Agent': 'AtlasPersonSearch/1.0'
    },
    body: new URLSearchParams({query: q})
  });
  
  const json = await r.json();
  console.log(json.results.bindings);
}

test();
