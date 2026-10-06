async function testWikiCategory(catName: string) {
  const url = `https://es.wikipedia.org/w/api.php?action=query&list=categorymembers&cmtitle=${encodeURIComponent(catName)}&cmlimit=50&format=json`;
  const res = await fetch(url, { headers: { 'User-Agent': 'AtlasAutonomousDiscovery/1.0' } });
  const json = await res.json();
  const members = json.query?.categorymembers || [];
  console.log(`\nCategory: ${catName} -> Found ${members.length} entities:`);
  for (const m of members.slice(0, 8)) {
    console.log(` - ${m.title}`);
  }
}

async function run() {
  await testWikiCategory('Categoría:Clubes de la ciudad de Buenos Aires');
  await testWikiCategory('Categoría:Hospitales en la Ciudad de Buenos Aires');
  await testWikiCategory('Categoría:Sindicatos de Argentina');
  await testWikiCategory('Categoría:Universidades de la ciudad de Buenos Aires');
}

run();
