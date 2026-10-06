import fetch from 'node-fetch';

async function testPsico() {
  const url = 'https://www.psi.uba.ar/institucional.php?var=institucional/autoridades/index.php';
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
  const decanoIdx = lines.findIndex(l => /Decan/i.test(l));
  if (decanoIdx !== -1) {
    console.log('Psico around Decano:');
    lines.slice(decanoIdx - 2, decanoIdx + 45).forEach(l => console.log('  ', l));
  } else {
    console.log('Psico first 30 lines:');
    lines.slice(0, 30).forEach(l => console.log('  ', l));
  }
}

testPsico().catch(console.error);
