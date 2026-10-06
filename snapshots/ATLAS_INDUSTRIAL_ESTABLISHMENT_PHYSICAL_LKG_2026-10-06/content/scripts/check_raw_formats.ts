import fetch from 'node-fetch';

async function checkRawFormats() {
  // CPACF
  console.log('--- CPACF Raw Sample ---');
  const r1 = await fetch('https://www.cpacf.org.ar/noticia/6755/consejo-directivo-autoridades-actuales', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const t1 = await r1.text();
  const idx1 = t1.indexOf('Presidente');
  if (idx1 !== -1) {
    console.log(t1.substring(idx1 - 100, idx1 + 1000).replace(/<[^>]+>/g, '\n').replace(/\n\s*\n/g, '\n'));
  }

  // CPCECABA
  console.log('\n--- CPCECABA Raw Sample ---');
  const r2 = await fetch('https://www.consejo.org.ar/institucional/autoridades', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const t2 = await r2.text();
  const idx2 = t2.indexOf('Presidente');
  if (idx2 !== -1) {
    console.log(t2.substring(idx2 - 100, idx2 + 1000).replace(/<[^>]+>/g, '\n').replace(/\n\s*\n/g, '\n'));
  }
}

checkRawFormats().catch(console.error);
