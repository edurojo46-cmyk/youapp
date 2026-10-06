import fetch from 'node-fetch';

async function testCPACF() {
  console.log('--- CPACF EXPLORATION ---');
  const urls = [
    'https://www.cpacf.org.ar/noticia/6755/consejo-directivo-autoridades-actuales',
    'https://new.cpacf.org.ar/noticia/4054/tribunal-de-disciplina',
    'https://new.cpacf.org.ar/noticia/5144/asamblea-de-delegados',
    'https://w3.cpacf.org.ar/GuiaAbo2/GuiaAbo3.aspx'
  ];

  for (const u of urls) {
    try {
      const controller = new AbortController();
      const to = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(u, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      clearTimeout(to);
      console.log(`[${res.status}] ${u}`);
      const text = await res.text();
      console.log(`  Length: ${text.length}`);
      // Show sample names/lines
      const plain = text.replace(/<script[\s\S]*?<\/script>/gi, '')
                        .replace(/<style[\s\S]*?<\/style>/gi, '')
                        .replace(/<[^>]+>/g, '\n')
                        .replace(/[ \t]+/g, ' ')
                        .replace(/\n\s*\n/g, '\n');
      const lines = plain.split('\n').map(l => l.trim()).filter(l => l.length > 2);
      const samplePeople = lines.filter(l => /(?:Dr\.|Dra\.|Presidente|Vicepresidente|Secretari|Vocal|Delegad)/i.test(l)).slice(0, 10);
      console.log(`  Sample person lines:`, samplePeople);
    } catch (e: any) {
      console.log(`  [ERR] ${u}: ${e.message}`);
    }
  }
}

async function testBOCBA() {
  console.log('\n--- BOCBA EXPLORATION ---');
  // Check BOCBA search and recent publications
  const bocbaUrls = [
    'https://boletinoficial.buenosaires.gob.ar/secciones',
    'https://boletinoficial.buenosaires.gob.ar/documentacion',
    'https://boletinoficial.buenosaires.gob.ar/normativa',
    'https://boletinoficial.buenosaires.gob.ar/calendario'
  ];

  for (const u of bocbaUrls) {
    try {
      const controller = new AbortController();
      const to = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(u, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      clearTimeout(to);
      console.log(`[${res.status}] ${u}`);
      const text = await res.text();
      console.log(`  Length: ${text.length}`);
    } catch (e: any) {
      console.log(`  [ERR] ${u}: ${e.message}`);
    }
  }
}

async function run() {
  await testCPACF();
  await testBOCBA();
}

run();
