import fetch from 'node-fetch';

async function testRealDecanato() {
  const url = 'https://exactas.uba.ar/institucional/autoridades/decanato-y-secretarias/';
  console.log('Fetching live URL:', url);
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  console.log('Status:', res.status);
  const html = await res.text();
  console.log('HTML Length:', html.length);
  
  // Strip HTML and find decano / secretarias
  const plain = html.replace(/<script[\s\S]*?<\/script>/gi, '')
                    .replace(/<style[\s\S]*?<\/style>/gi, '')
                    .replace(/<[^>]+>/g, '\n')
                    .replace(/[ \t]+/g, ' ')
                    .replace(/\n\s*\n/g, '\n');
  
  const lines = plain.split('\n').map(l => l.trim()).filter(l => l.length > 2);
  console.log('Total non-empty lines:', lines.length);
  
  // Find lines around Decano
  for (let i = 0; i < lines.length; i++) {
    if (/Decan|Secretar|Vicedecan/i.test(lines[i])) {
      console.log(`[Line ${i}] ${lines[i]}`);
      for (let j = Math.max(0, i - 1); j <= Math.min(lines.length - 1, i + 3); j++) {
        console.log(`    ${j}: ${lines[j]}`);
      }
    }
  }
}

testRealDecanato().catch(console.error);
