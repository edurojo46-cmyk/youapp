async function probeGcbaHabilitaciones() {
  console.log('=== PROBING GCBA OPEN DATA FOR HABILITACIONES ===');
  try {
    const url = 'https://data.buenosaires.gob.ar/api/3/action/package_search?q=habilitaciones';
    const res = await fetch(url);
    if (!res.ok) {
      console.log('GCBA package search failed:', res.status, res.statusText);
      return;
    }
    const json = await res.json();
    console.log('Total packages found:', json?.result?.count);
    for (const pkg of json?.result?.results || []) {
      console.log(`\nPackage: ${pkg.name} - ${pkg.title}`);
      for (const r of pkg.resources || []) {
        console.log(`  - Resource: ${r.name} (${r.format}) -> ${r.url}`);
      }
    }
  } catch (err: any) {
    console.error('Error probing GCBA:', err.message);
  }
}

probeGcbaHabilitaciones();
