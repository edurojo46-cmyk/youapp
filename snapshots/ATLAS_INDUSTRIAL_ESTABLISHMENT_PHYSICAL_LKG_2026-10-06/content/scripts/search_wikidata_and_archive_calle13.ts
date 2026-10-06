async function searchWikidataAndBroadcasters() {
  console.log('Querying Wikidata and public musical sitemaps for Calle 13 La Perla:');

  // 1. Wikidata SPARQL query for YouTube / media links of Calle 13 La Perla
  const sparql = `
    SELECT ?item ?itemLabel ?youtubeId ?spotifyId WHERE {
      ?item rdfs:label ?label.
      FILTER(CONTAINS(LCASE(?label), "la perla")).
      ?item wdt:P175 ?artist.
      ?artist rdfs:label ?artistLabel.
      FILTER(CONTAINS(LCASE(?artistLabel), "calle 13")).
      OPTIONAL { ?item wdt:P1651 ?youtubeId. }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en". }
    } LIMIT 10
  `;

  try {
    const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(sparql)}&format=json`;
    const res = await fetch(url, { headers: { 'User-Agent': 'YouAppTV/1.0' } });
    if (res.ok) {
      const data = await res.json();
      console.log('Wikidata items:', data?.results?.bindings);
    }
  } catch (e: any) {
    console.log('Wikidata SPARQL error:', e.message);
  }

  // 2. Query Internet Archive for all items with "Calle 13" "La Perla"
  try {
    const iaUrl = 'https://archive.org/advancedsearch.php?q=%28%22calle+13%22+AND+%22la+perla%22%29&fl[]=identifier,title,description,mediatype,year&rows=20&output=json';
    const res = await fetch(iaUrl);
    if (res.ok) {
      const data = await res.json();
      console.log('Archive.org docs:', data?.response?.docs);
    }
  } catch (e: any) {
    console.log('Archive.org error:', e.message);
  }
}

searchWikidataAndBroadcasters();
