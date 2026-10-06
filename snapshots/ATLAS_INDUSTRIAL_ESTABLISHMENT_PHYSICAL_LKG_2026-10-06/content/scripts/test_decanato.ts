import fetch from 'node-fetch';

async function testDecanato() {
  const url = 'https://exactas.uba.ar/institucional/autoridades/decanato/';
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  console.log('Status:', res.status);
  const html = await res.text();
  console.log('HTML length:', html.length);
  // Match text inside entry-content
  const textMatch = html.match(/<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  if (textMatch) {
    const clean = textMatch[1].replace(/<[^>]+>/g, '\n').replace(/\n+/g, '\n').trim();
    console.log('Entry content preview:');
    console.log(clean.slice(0, 1500));
  }
}

testDecanato().catch(console.error);
