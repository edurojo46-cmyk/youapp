async function testOrcidSearch() {
  const query = `affiliation-org-name:(CONICET OR "Universidad de Buenos Aires" OR UBA) AND (Calvo OR Cassiodoro OR Tinnefeld OR Musso)`;
  const url = `https://pub.orcid.org/v3.0/expanded-search/?q=${encodeURIComponent(query)}&rows=5`;
  console.log('Fetching ORCID:', url);
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json', 'User-Agent': 'YouAppAtlas/1.0' }
  });
  console.log('Status:', res.status);
  const data = await res.json();
  console.log('Total results:', data['num-found']);
  console.log('Results:', JSON.stringify(data['expanded-result'], null, 2));
}

testOrcidSearch().catch(console.error);
