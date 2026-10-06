async function testRdfsLabelSpeed() {
  const t0 = Date.now();
  const sparql = `
    SELECT DISTINCT ?person ?personLabel ?desc ?image WHERE {
      ?person wdt:P31 wd:Q5;
              wdt:P106 wd:Q1650915;
              wdt:P27 wd:Q414.
      OPTIONAL { ?person rdfs:label ?personLabel. FILTER(LANG(?personLabel) = "es" || LANG(?personLabel) = "en") }
      OPTIONAL { ?person schema:description ?desc. FILTER(LANG(?desc) = "es") }
      OPTIONAL { ?person wdt:P18 ?image. }
    }
    LIMIT 100 OFFSET 0
  `;

  const response = await fetch('https://query.wikidata.org/sparql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/sparql-results+json',
      'User-Agent': 'AtlasPersonSearch/2.0'
    },
    body: new URLSearchParams({ query: sparql })
  });

  console.log(`Fetch took ${Date.now() - t0}ms, status: ${response.status}`);
  if (response.ok) {
    const json = await response.json();
    console.log(`Results returned: ${json.results.bindings.length}`);
    console.log('Sample 1:', json.results.bindings[0]?.personLabel?.value, json.results.bindings[0]?.desc?.value);
  }
}

testRdfsLabelSpeed();
