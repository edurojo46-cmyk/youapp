async function verifySourceProvenance() {
  console.log('🔍 AUDITORÍA FÍSICA DE PROCEDENCIA (sourceContainsProviderId):\n');

  const sourcesToCheck = [
    {
      id: 'IYyjZ6PJdWk',
      title: 'La Perla (Video Oficial)',
      sourceUrl: 'https://es.wikipedia.org/w/api.php?action=parse&page=La_Perla_(canci%C3%B3n)&prop=text&format=json',
      discoveredVia: 'wikipedia_citation'
    },
    {
      id: 'B0cVKmkYamU',
      title: 'La Perla (Audio Oficial)',
      sourceUrl: 'https://musicbrainz.org/ws/2/recording/3c94fefd-eb45-4a00-8fb0-488a7937c7dc?inc=url-rels&fmt=json',
      discoveredVia: 'musicbrainz_catalog'
    },
    {
      id: 'LxdXfpyyFGg',
      title: 'La Perla (Director Cut)',
      sourceUrl: 'https://musicbrainz.org/ws/2/recording/c0e86398-75a9-4d62-b7a5-3ebf528ec5a5?inc=url-rels&fmt=json',
      discoveredVia: 'musicbrainz_catalog'
    }
  ];

  for (const s of sourcesToCheck) {
    try {
      const res = await fetch(s.sourceUrl, { headers: { 'User-Agent': 'YouAppTV/1.0 ( audit@youapp.tv )' } });
      if (res.ok) {
        const text = await res.text();
        const containsId = text.includes(s.id);
        console.log(`• ID: ${s.id} [${s.title}]`);
        console.log(`  Source: ${s.sourceUrl.slice(0, 65)}...`);
        console.log(`  sourceContainsProviderId: ${containsId ? 'true ✅' : 'false ❌'}`);
        console.log(`  discoveredVia: ${s.discoveredVia}`);
        console.log(`  Search.list: false 🔒 | Radar: 0 u 🔒\n`);
      }
    } catch (e: any) {
      console.log(`Error checking ${s.id}:`, e.message);
    }
  }
}

verifySourceProvenance();
