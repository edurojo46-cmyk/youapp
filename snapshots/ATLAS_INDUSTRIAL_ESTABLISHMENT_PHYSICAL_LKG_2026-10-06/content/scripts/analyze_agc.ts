import fetch from 'node-fetch';
import https from 'https';

const agent = new https.Agent({ rejectUnauthorized: false });

async function analyzeAGC() {
  console.log('=== ANALYZING GCBA AGC INSPECTORES Y VERIFICADORES ===');
  
  // 1. Get package metadata from CKAN
  const metaRes = await fetch('https://data.buenosaires.gob.ar/api/3/action/package_show?id=inspectores-verificadores-agc', { agent });
  if (metaRes.ok) {
    const meta = await metaRes.json() as any;
    console.log('Package Title:', meta.result.title);
    console.log('Author / Maintainer:', meta.result.author, '/', meta.result.maintainer);
    console.log('Notes:', meta.result.notes);
    console.log('Metadata modified:', meta.result.metadata_modified);
    for (const r of meta.result.resources) {
      console.log(`Resource: ${r.name} | format: ${r.format} | last_modified: ${r.last_modified} | url: ${r.url}`);
    }
  }

  // 2. Download and parse CSV
  const url = 'https://cdn.buenosaires.gob.ar/datosabiertos/datasets/agencia-gubernamental-de-control/inspectores-verificadores-agc/inspectores-y-verificadores-agc.csv';
  const csvRes = await fetch(url, { agent });
  const text = await csvRes.text();
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  console.log(`\nTotal rows: ${lines.length}`);
  console.log(`Header: ${lines[0]}`);

  const people = new Map<string, any>();
  const areas = new Map<string, number>();

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',').map(s => s.trim().replace(/^"|"$/g, ''));
    const area = parts[0];
    const apellido = parts[1];
    const nombre = parts[2];
    const numero = parts[3];

    if (apellido && nombre) {
      const fullName = `${nombre} ${apellido}`.trim();
      const key = `${apellido.toLowerCase()}_${nombre.toLowerCase()}`;
      if (!people.has(key)) {
        people.set(key, { fullName, nombre, apellido, area, numero });
      }
      areas.set(area, (areas.get(area) || 0) + 1);
    }
  }

  console.log(`Unique individuals in AGC: ${people.size}`);
  console.log('\nAreas breakdown:');
  for (const [area, count] of areas.entries()) {
    console.log(`  - ${area}: ${count}`);
  }

  console.log('\nSample 10 individuals:');
  const sample = Array.from(people.values()).slice(0, 10);
  console.log(JSON.stringify(sample, null, 2));
}

analyzeAGC().catch(console.error);
