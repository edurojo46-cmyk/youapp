import fetch from 'node-fetch';

async function testParse() {
  console.log('=== PARSING REAL FACULTY AND COUNCIL PAGES ===');

  // 1. UBA Derecho
  try {
    const res = await fetch('http://www.derecho.uba.ar/institucional/autoridades.php', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const html = await res.text();
    console.log('\n--- UBA Derecho ---');
    const plain = html.replace(/<script[\s\S]*?<\/script>/gi, '')
                      .replace(/<style[\s\S]*?<\/style>/gi, '')
                      .replace(/<[^>]+>/g, '\n')
                      .replace(/[ \t]+/g, ' ')
                      .replace(/\n\s*\n/g, '\n');
    const lines = plain.split('\n').map(l => l.trim()).filter(l => l.length > 2);
    lines.slice(0, 35).forEach(l => console.log('  ', l));
  } catch (e: any) {
    console.log('Derecho error:', e.message);
  }

  // 2. UBA Económicas
  try {
    const res = await fetch('https://www.economicas.uba.ar/institucional/autoridades/', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const html = await res.text();
    console.log('\n--- UBA Económicas ---');
    const plain = html.replace(/<script[\s\S]*?<\/script>/gi, '')
                      .replace(/<style[\s\S]*?<\/style>/gi, '')
                      .replace(/<[^>]+>/g, '\n')
                      .replace(/[ \t]+/g, ' ')
                      .replace(/\n\s*\n/g, '\n');
    const lines = plain.split('\n').map(l => l.trim()).filter(l => l.length > 2);
    lines.slice(0, 35).forEach(l => console.log('  ', l));
  } catch (e: any) {
    console.log('Económicas error:', e.message);
  }

  // 3. UBA FADU
  try {
    const res = await fetch('https://www.fadu.uba.ar/institucional/autoridades', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const html = await res.text();
    console.log('\n--- UBA FADU ---');
    const plain = html.replace(/<script[\s\S]*?<\/script>/gi, '')
                      .replace(/<style[\s\S]*?<\/style>/gi, '')
                      .replace(/<[^>]+>/g, '\n')
                      .replace(/[ \t]+/g, ' ')
                      .replace(/\n\s*\n/g, '\n');
    const lines = plain.split('\n').map(l => l.trim()).filter(l => l.length > 2);
    lines.slice(0, 35).forEach(l => console.log('  ', l));
  } catch (e: any) {
    console.log('FADU error:', e.message);
  }
}

testParse().catch(console.error);
