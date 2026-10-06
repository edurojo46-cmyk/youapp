import fs from 'fs';

async function scanGCBA() {
  console.log('Scanning all GCBA datasets...');
  const res = await fetch('https://data.buenosaires.gob.ar/api/3/action/package_search?rows=500');
  const data = await res.json();
  const packages = data.result.results || [];
  console.log(`Retrieved ${packages.length} packages.`);

  const personDatasets = [];

  for (const pkg of packages) {
    const title = (pkg.title || '').toLowerCase();
    const desc = (pkg.notes || '').toLowerCase();
    const text = title + ' ' + desc;

    const matches = ['autoridad', 'funcionario', 'personal', 'permiso', 'titular', 'docente', 'beca', 'medico', 'profesional', 'registro', 'padron', 'guia'].some(k => text.includes(k));

    if (matches) {
      for (const r of (pkg.resources || [])) {
        if (r.format === 'CSV') {
          personDatasets.push({
            dataset: pkg.title,
            resource_name: r.name,
            url: r.url,
            size: r.size
          });
          console.log(`[MATCH] ${pkg.title} | ${r.name} | ${r.url}`);
        }
      }
    }
  }

  fs.writeFileSync('scratch/gcba_discovered_resources.json', JSON.stringify(personDatasets, null, 2), 'utf8');
  console.log(`Found ${personDatasets.length} matching CSV resources in GCBA.`);
}

scanGCBA().catch(console.error);
