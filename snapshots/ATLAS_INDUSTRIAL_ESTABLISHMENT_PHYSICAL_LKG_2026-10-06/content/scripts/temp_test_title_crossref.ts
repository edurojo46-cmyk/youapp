import fetch from 'node-fetch';

async function testTitleCrossref() {
  const title = "The role of control-learning in higher-order cognitive abilities";
  const url = `https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(title)}&rows=3&mailto=contact@youapp.com`;
  const res = await fetch(url, { headers: { 'User-Agent': 'AtlasHarvester/1.0 (mailto:contact@youapp.com)' } });
  const json: any = await res.json();
  const items = json.message?.items || [];
  for (const item of items) {
    console.log('DOI:', item.DOI);
    console.log('Title:', item.title?.[0]);
    console.log('Year:', item.issued?.['date-parts']?.[0]?.[0]);
    console.log('Authors:', item.author?.map((a: any) => `${a.given} ${a.family} (${a.affiliation?.map((f: any) => f.name).join(';')})`));
  }
}

testTitleCrossref();
