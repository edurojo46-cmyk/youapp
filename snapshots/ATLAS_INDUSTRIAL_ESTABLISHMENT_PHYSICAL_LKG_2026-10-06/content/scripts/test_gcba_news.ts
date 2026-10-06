import fetch from 'node-fetch';

async function testGCBANews() {
  const url = 'https://buenosaires.gob.ar/comuna-6/noticias';
  const res = await fetch(url);
  const html = await res.text();
  const m = html.match(/href="([^"]*noticia[^"]*)"/gi) || [];
  console.log('Total matches:', m.length);
  const unique = Array.from(new Set(m));
  console.log('Unique news links:');
  for (const u of unique.slice(0, 10)) {
    console.log(u);
  }
}

testGCBANews().catch(console.error);
