import fs from 'fs';

async function scout() {
  const queries = ['seguros', 'productores', 'inspectores', 'senasa', 'docentes', 'matricula', 'conicet', 'universidad'];
  const found = [];

  for (const q of queries) {
    try {
      const res = await fetch('https://datos.gob.ar/api/3/action/package_search?q=' + q + '&rows=10');
      if (!res.ok) continue;
      const data = await res.json();
      for (const p of (data.result?.results || [])) {
        for (const r of (p.resources || [])) {
          if (r.format === 'CSV' || r.format === 'ZIP') {
            found.push({ query: q, dataset: p.title, resource: r.name, url: r.url });
            console.log(`[${q.toUpperCase()}] ${p.title} | ${r.name} | ${r.url}`);
          }
        }
      }
    } catch {}
  }

  fs.writeFileSync('scratch/scouted_new_datasets.json', JSON.stringify(found, null, 2), 'utf8');
}

scout().catch(console.error);
