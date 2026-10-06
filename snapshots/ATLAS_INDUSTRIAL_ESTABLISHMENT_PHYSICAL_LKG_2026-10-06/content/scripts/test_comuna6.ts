import fetch from 'node-fetch';

async function testComuna6() {
  const url = 'https://buenosaires.gob.ar/comuna-6';
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await res.text();
  const plain = html.replace(/<script[\s\S]*?<\/script>/gi, '')
                    .replace(/<style[\s\S]*?<\/style>/gi, '')
                    .replace(/<[^>]+>/g, '\n')
                    .replace(/[ \t]+/g, ' ')
                    .replace(/\n\s*\n/g, '\n');
  const lines = plain.split('\n').map(l => l.trim()).filter(l => l.length > 2);
  console.log('Comuna 6 lines count:', lines.length);
  for (let i = 0; i < lines.length; i++) {
    if (/Junta|Comunal|President|Caballito/i.test(lines[i]) && lines[i].length < 60) {
      console.log(`[Line ${i}] ${lines[i]}`);
      for (let j = Math.max(0, i - 1); j <= Math.min(lines.length - 1, i + 3); j++) {
        console.log(`    ${j}: ${lines[j]}`);
      }
    }
  }
}

testComuna6().catch(console.error);
