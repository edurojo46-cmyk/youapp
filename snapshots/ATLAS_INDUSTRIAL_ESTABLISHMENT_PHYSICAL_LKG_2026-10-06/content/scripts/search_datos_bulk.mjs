import fs from 'fs';

async function searchBig() {
  const queries = [
    'investigadores', 'docentes', 'matriculados', 'cooperativas', 'mutuales',
    'conicet', 'universidad', 'empleo', 'autoridades', 'sociedades', 'directorio',
    'proveedores', 'contrataciones', 'compras', 'becas', 'subsidios', 'funcionarios'
  ];
  const found = [];
  const seen = new Set();

  for (const q of queries) {
    try {
      const res = await fetch('https://datos.gob.ar/api/3/action/package_search?q=' + encodeURIComponent(q) + '&rows=15');
      if (!res.ok) continue;
      const data = await res.json();
      for (const pkg of (data.result?.results || [])) {
        for (const r of (pkg.resources || [])) {
          if (!r.url || seen.has(r.url)) continue;
          seen.add(r.url);
          const fmt = (r.format || '').toUpperCase();
          if (fmt === 'CSV' || fmt === 'ZIP' || fmt === 'PARQUET') {
            found.push({
              query: q,
              dataset: pkg.title,
              org: pkg.organization?.title,
              name: r.name || r.description,
              url: r.url,
              format: fmt,
              size: r.size
            });
            console.log(`[${q.toUpperCase()}] ${pkg.title} | ${r.name || 'CSV'} | ${r.url}`);
          }
        }
      }
    } catch (e) {
      console.error(e.message);
    }
  }

  fs.writeFileSync('scratch/datos_bulk_search_results.json', JSON.stringify(found, null, 2), 'utf8');
  console.log(`Saved ${found.length} results.`);
}

searchBig().catch(console.error);
