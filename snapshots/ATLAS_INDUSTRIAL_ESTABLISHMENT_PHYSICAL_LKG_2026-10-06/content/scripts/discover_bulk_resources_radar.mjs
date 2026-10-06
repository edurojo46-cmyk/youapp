import fs from 'fs';
import path from 'path';

async function discoverResources() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('RADAR: DISCOVERING BULK DATA RESOURCES INSIDE OPEN DATA CATALOGS');
  console.log('════════════════════════════════════════════════════════════════');

  const terms = [
    'profesionales', 'autoridades', 'directores', 'sociedades', 'salud',
    'justicia', 'matriculados', 'padron', 'docentes', 'investigadores',
    'magistrados', 'funcionarios', 'cooperativas', 'prestadores'
  ];

  const foundResources = [];
  const seenUrls = new Set();

  for (const term of terms) {
    try {
      const res = await fetch(`https://datos.gob.ar/api/3/action/package_search?q=${encodeURIComponent(term)}&rows=10`);
      if (!res.ok) continue;
      const data = await res.json();
      const packages = data.result?.results || [];

      for (const pkg of packages) {
        for (const r of (pkg.resources || [])) {
          if (!r.url || seenUrls.has(r.url)) continue;
          seenUrls.add(r.url);

          const fmt = (r.format || '').toUpperCase();
          if (fmt === 'CSV' || fmt === 'JSON' || fmt === 'ZIP' || fmt === 'PARQUET' || fmt === 'XLSX') {
            foundResources.push({
              dataset_title: pkg.title,
              dataset_id: pkg.id,
              organization: pkg.organization?.title || 'Organismo Nacional',
              resource_name: r.name || r.description || pkg.title,
              resource_url: r.url,
              format: fmt,
              size: r.size || null,
              created: r.created || pkg.metadata_created
            });
          }
        }
      }
    } catch (e) {
      console.error('Error querying term:', term, e.message);
    }
  }

  console.log(`Discovered ${foundResources.length} bulk candidate resources across Argentina Open Data catalogs.`);

  // Probe the top candidate resources to verify headers and person entity columns
  const verifiedBulkResources = [];

  for (const item of foundResources) {
    // Only probe CSV/JSON/ZIP
    if (item.format !== 'CSV') continue;
    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 4000);
      const probeRes = await fetch(item.resource_url, {
        headers: { 'Range': 'bytes=0-2048' },
        signal: ctrl.signal
      });
      clearTimeout(timeout);

      if (probeRes.ok || probeRes.status === 206) {
        const textChunk = await probeRes.text();
        const firstLines = textChunk.split('\n').slice(0, 3);
        const header = firstLines[0] || '';
        const headerLower = header.toLowerCase();

        // Check if header contains person-level attributes
        const isPersonList = headerLower.includes('nombre') || 
                             headerLower.includes('apellido') || 
                             headerLower.includes('profesional') || 
                             headerLower.includes('persona') ||
                             headerLower.includes('autoridad') ||
                             headerLower.includes('firmante') ||
                             headerLower.includes('titular');

        const contentLength = probeRes.headers.get('content-range')?.split('/')?.[1] || 
                              probeRes.headers.get('content-length') || 
                              item.size || 'UNKNOWN';

        if (isPersonList) {
          verifiedBulkResources.push({
            ...item,
            content_length: contentLength,
            header_sample: header.slice(0, 100),
            person_level_verified: true
          });
          console.log(`✓ [VERIFIED PERSON LIST] ${item.dataset_title}`);
          console.log(`  URL: ${item.resource_url} (${contentLength} bytes)`);
          console.log(`  Header: ${header.slice(0, 80)}...`);
        }
      }
    } catch (err) {
      // remote probe error
    }
  }

  const outPath = path.resolve('scratch/radar_discovered_bulk_resources.json');
  fs.writeFileSync(outPath, JSON.stringify(verifiedBulkResources, null, 2), 'utf8');
  console.log(`\nSaved ${verifiedBulkResources.length} verified bulk resources to ${outPath}`);
}

discoverResources().catch(console.error);
