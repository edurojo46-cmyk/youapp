import fetch from 'node-fetch';

async function testCleanHtml() {
  const url = 'https://www.consejo.org.ar/institucional/autoridades';
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await res.text();

  // Replace inline tags with space, block tags with newline
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
  console.log('Sample lines with inline tags replaced by space:');
  const presidenteIdx = lines.findIndex(l => l.includes('Presidente'));
  if (presidenteIdx !== -1) {
    lines.slice(presidenteIdx - 2, presidenteIdx + 20).forEach(l => console.log('  ', l));
  }
}

testCleanHtml().catch(console.error);
