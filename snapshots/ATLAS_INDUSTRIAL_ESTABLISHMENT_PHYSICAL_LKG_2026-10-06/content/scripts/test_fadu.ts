import fetch from 'node-fetch';

async function testFadu() {
  const url = 'https://www.fadu.uba.ar/institucional/autoridades';
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await res.text();

  const clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<(?:span|b|strong|i|em|a|font)[^>]*>/gi, ' ')
    .replace(/<\/(?:span|b|strong|i|em|a|font)>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n/g, '\n');

  const lines = clean.split('\n').map(l => l.trim()).filter(l => l.length > 1);
  const decanoIdx = lines.findIndex(l => l.includes('Decano'));
  if (decanoIdx !== -1) {
    console.log('FADU around Decano:');
    lines.slice(decanoIdx - 2, decanoIdx + 45).forEach(l => console.log('  ', l));
  }
}

testFadu().catch(console.error);
