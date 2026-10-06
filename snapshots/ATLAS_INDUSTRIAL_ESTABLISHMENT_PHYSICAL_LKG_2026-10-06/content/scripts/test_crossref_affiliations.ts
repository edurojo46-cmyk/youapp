async function testCrossrefAffiliations() {
  const sampleAuthors = [
    'Gisela Eva Cassiodoro',
    'Philip Tinnefeld',
    'Ernesto Julio Calvo',
    'Santiago Anibal Disalvo',
    'Maria Di Pasquo Lartigue'
  ];

  for (const name of sampleAuthors) {
    const url = `https://api.crossref.org/works?query.author=${encodeURIComponent(name)}&rows=3&mailto=edurojo46@gmail.com`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'YouAppAtlas/1.0 (mailto:edurojo46@gmail.com)' }
    });
    if (!res.ok) {
      console.log(`[${name}] HTTP Error ${res.status}`);
      continue;
    }
    const data = await res.json();
    const items = data.message?.items || [];
    console.log(`\n=== Author: ${name} (Works found: ${data.message?.['total-results'] || 0}) ===`);
    for (const it of items.slice(0, 2)) {
      const year = it.issued?.['date-parts']?.[0]?.[0] || it.created?.['date-parts']?.[0]?.[0];
      const authors = it.author || [];
      const matchAuth = authors.find((a: any) => {
        const full = `${a.given || ''} ${a.family || ''}`.toLowerCase();
        return full.includes(name.split(' ')[0].toLowerCase()) || full.includes(name.split(' ').slice(-1)[0].toLowerCase());
      });
      console.log(`  - Title: "${it.title?.[0]?.substring(0, 50)}..." | Year: ${year}`);
      if (matchAuth) {
        console.log(`    Matched Author: ${matchAuth.given} ${matchAuth.family}`);
        console.log(`    ORCID: ${matchAuth.ORCID || 'NONE'}`);
        console.log(`    Affiliation: ${JSON.stringify(matchAuth.affiliation)}`);
      }
    }
    await new Promise(r => setTimeout(r, 200));
  }
}

testCrossrefAffiliations().catch(console.error);
