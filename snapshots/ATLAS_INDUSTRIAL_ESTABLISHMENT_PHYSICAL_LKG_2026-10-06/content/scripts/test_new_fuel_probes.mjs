import fetch from 'node-fetch';

const targets = [
  { id: 'MENDOZA_CIUDAD', url: 'http://datos.ciudaddemendoza.gob.ar/dataset/nomina' },
  { id: 'BAHIA_BLANCA', url: 'https://datos.bahia.gob.ar/' },
  { id: 'MAR_DEL_PLATA', url: 'https://datos.mardelplata.gob.ar/' },
  { id: 'PARANA', url: 'https://datos.parana.gob.ar/' },
  { id: 'TIGRE', url: 'https://datos.tigre.gob.ar/' },
  { id: 'DATOS_ARGENTINA', url: 'https://datos.gob.ar/api/3/action/package_search?q=personal' },
  { id: 'DATOS_ARGENTINA_DOCENTES', url: 'https://datos.gob.ar/api/3/action/package_search?q=docentes' },
  { id: 'BOPBA', url: 'https://www.boletinoficial.gba.gob.ar/' },
  { id: 'JUSBAIRES', url: 'https://consejo.jusbaires.gob.ar/' }
];

async function main() {
  console.log('=== TESTING REAL OPEN DATA TARGETS ===');
  for (const t of targets) {
    const t0 = Date.now();
    try {
      const res = await fetch(t.url, {
        headers: { 'User-Agent': 'AtlasOpenDataRadar/2.0' },
        timeout: 8000
      });
      const ms = Date.now() - t0;
      console.log(`[${t.id}] Status: ${res.status} (${res.statusText}) in ${ms}ms`);
      if (t.url.includes('api/3/action/package_search') && res.ok) {
        const json = await res.json();
        console.log(`  -> Packages found: ${json?.result?.count || 0}`);
        for (const pkg of (json?.result?.results || []).slice(0, 3)) {
          console.log(`     * ${pkg.name}: ${pkg.title} (${pkg.resources?.length || 0} resources)`);
        }
      }
    } catch (err) {
      console.log(`[${t.id}] Error: ${err.message}`);
    }
  }
}

main().catch(console.error);
