import fetch from 'node-fetch';

async function testInstitutos() {
  const url = 'https://exactas.uba.ar/institucional/autoridades/institutos-de-investigacion/';
  console.log('Fetching:', url);
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  console.log('Status:', res.status);
  const html = await res.text();
  
  const plain = html.replace(/<script[\s\S]*?<\/script>/gi, '')
                    .replace(/<style[\s\S]*?<\/style>/gi, '')
                    .replace(/<[^>]+>/g, '\n')
                    .replace(/[ \t]+/g, ' ')
                    .replace(/\n\s*\n/g, '\n');
  
  const lines = plain.split('\n').map(l => l.trim()).filter(l => l.length > 2);
  console.log('Lines count:', lines.length);
  
  // Find lines around Director
  for (let i = 0; i < lines.length; i++) {
    if (/Director|Directora/i.test(lines[i]) && lines[i].length < 40) {
      console.log(`[Line ${i}] ${lines[i]}`);
      for (let j = Math.max(0, i - 1); j <= Math.min(lines.length - 1, i + 3); j++) {
        console.log(`    ${j}: ${lines[j]}`);
      }
    }
  }
}

testInstitutos().catch(console.error);
