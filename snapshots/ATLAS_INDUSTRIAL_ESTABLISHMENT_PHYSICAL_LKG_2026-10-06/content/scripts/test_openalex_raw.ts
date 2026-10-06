import 'dotenv/config';

async function testOpenAlexRaw() {
  const url = `https://api.openalex.org/authors?search=Gisela+Eva+Cassiodoro&per_page=1&mailto=edurojo46@gmail.com`;
  console.log('Fetching:', url);
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'YouAppAtlas/1.0 (mailto:edurojo46@gmail.com)'
    }
  });

  console.log('Status:', res.status, res.statusText);
  for (const [k, v] of res.headers.entries()) {
    console.log(`  Header ${k}: ${v}`);
  }
  const text = await res.text();
  console.log('Body:', text.substring(0, 300));
}

testOpenAlexRaw().catch(console.error);
