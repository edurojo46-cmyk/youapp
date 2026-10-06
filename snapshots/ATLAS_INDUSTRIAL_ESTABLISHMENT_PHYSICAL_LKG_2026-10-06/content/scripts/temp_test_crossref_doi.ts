import fetch from 'node-fetch';

async function testDoi(doi: string) {
  const url = `https://api.crossref.org/works/${encodeURIComponent(doi)}?mailto=contact@youapp.com`;
  console.log('Fetching Crossref DOI:', url);
  const res = await fetch(url, {
    headers: { 'User-Agent': 'AtlasHarvester/1.0 (mailto:contact@youapp.com)' }
  });
  console.log('Status:', res.status);
  console.log('Headers x-rate-limit-limit:', res.headers.get('x-rate-limit-limit'));
  console.log('Headers x-rate-limit-interval:', res.headers.get('x-rate-limit-interval'));
  const json: any = await res.json();
  const work = json.message;
  console.log('Title:', work.title?.[0]);
  console.log('Issued year:', work.issued?.['date-parts']?.[0]?.[0]);
  console.log('Authors count:', work.author?.length);
  const authorMatch = work.author?.find((a: any) => a.family?.toLowerCase().includes('rakhimberdiev'));
  console.log('Matched author:', authorMatch);
}

testDoi('10.1126/science.aaw8529');
