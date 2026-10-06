async function searchInstitutions() {
  const names = [
    'Hospital Italiano de Buenos Aires',
    'Hospital de Clínicas José de San Martín',
    'Fundación Instituto Leloir',
    'Fundación Favaloro',
    'Universidad Torcuato Di Tella',
    'Instituto Tecnológico de Buenos Aires',
    'Universidad de Buenos Aires',
    'Universidad Tecnológica Nacional',
    'Universidad de San Andrés',
    'Pontificia Universidad Católica Argentina'
  ];

  for (const name of names) {
    const url = `https://api.openalex.org/institutions?search=${encodeURIComponent(name)}&mailto=contact@youapp.com`;
    const res = await fetch(url);
    const data = await res.json();
    const top = data?.results?.[0];
    if (top) {
      console.log(`\nMatch for: "${name}"`);
      console.log(`  ID: ${top.id} (${top.id.replace('https://openalex.org/', '')})`);
      console.log(`  DisplayName: ${top.display_name}`);
      console.log(`  City: ${top.geo?.city}, Country: ${top.geo?.country}`);
      console.log(`  ROR: ${top.ror}`);
      console.log(`  Works: ${top.works_count}`);
      console.log(`  Lineage: ${top.lineage}`);
      // Count authors with last_known_institutions.id
      const idOnly = top.id.replace('https://openalex.org/', '');
      const aRes = await fetch(`https://api.openalex.org/authors?filter=last_known_institutions.id:${idOnly}&per_page=1&mailto=contact@youapp.com`);
      const aData = await aRes.json();
      console.log(`  Authors count with last_known_institution: ${aData.meta?.count}`);
    } else {
      console.log(`No match for: "${name}"`);
    }
  }
}
searchInstitutions();
