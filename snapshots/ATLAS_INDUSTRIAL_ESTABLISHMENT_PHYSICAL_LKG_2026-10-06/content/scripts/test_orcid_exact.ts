async function testOrcidAuthor() {
  const authors = ['Gisela Eva Cassiodoro', 'Ernesto Julio Calvo', 'Mariel Fernanda Musso'];

  for (const a of authors) {
    const parts = a.split(' ');
    const family = parts.pop();
    const given = parts.join(' ');
    const query = `family-name:${family} AND given-names:${given}`;
    const url = `https://pub.orcid.org/v3.0/expanded-search/?q=${encodeURIComponent(query)}&rows=3`;
    const res = await fetch(url, { headers: { 'Accept': 'application/json', 'User-Agent': 'YouAppAtlas/1.0' } });
    if (!res.ok) {
      console.log(`[${a}] HTTP ${res.status}`);
      continue;
    }
    const data = await res.json();
    console.log(`\n=== Author: ${a} (Results: ${data['num-found']}) ===`);
    for (const it of data['expanded-result'] || []) {
      console.log(`  - ORCID: ${it['orcid-id']} | Name: ${it['given-names']} ${it['family-names']}`);
      console.log(`    Institutions: ${JSON.stringify(it['institution-name'])}`);
    }
    await new Promise(r => setTimeout(r, 200));
  }
}

testOrcidAuthor().catch(console.error);
