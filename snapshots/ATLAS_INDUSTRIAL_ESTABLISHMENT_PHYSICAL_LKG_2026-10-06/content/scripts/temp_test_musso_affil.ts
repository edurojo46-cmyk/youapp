import fetch from 'node-fetch';

async function testAffils(handleId: string) {
  const url = `https://ri.conicet.gov.ar/handle/11336/${handleId}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await res.text();
  const desc = html.match(/<meta[^>]*name="DC\.description"[^>]*content="Fil:\s*([^"]+)"/gi) || [];
  console.log(`Affiliations on landing page for ${handleId}:`);
  for (const d of desc) {
    console.log('-', d);
  }
}

testAffils('267299');
