import fetch from 'node-fetch';

async function testCPAU() {
  const url = 'https://www.cpau.org/institucional/consejo-directivo';
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  console.log('Status:', res.status);
  const html = await res.text();
  console.log('HTML length:', html.length);
  const plain = html.replace(/<script[\s\S]*?<\/script>/gi, '')
                    .replace(/<style[\s\S]*?<\/style>/gi, '')
                    .replace(/<[^>]+>/g, '\n')
                    .replace(/\n\s*\n/g, '\n');
  console.log('Preview:');
  console.log(plain.slice(0, 1000));
}

testCPAU().catch(console.error);
