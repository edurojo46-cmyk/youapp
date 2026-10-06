import fetch from 'node-fetch';

async function testJunta() {
  const url = 'https://buenosaires.gob.ar/comuna-6/junta-comunal';
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
  for (const l of lines.slice(0, 50)) {
    console.log(l);
  }
}

testJunta().catch(console.error);
