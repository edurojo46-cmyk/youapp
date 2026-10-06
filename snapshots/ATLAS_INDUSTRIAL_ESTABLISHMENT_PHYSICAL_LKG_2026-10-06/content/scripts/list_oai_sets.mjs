import fetch from 'node-fetch';

async function listSets() {
  const repos = [
    { name: 'SEDICI UNLP', url: 'http://sedici.unlp.edu.ar/oai/request?verb=ListSets' },
    { name: 'INTA Digital', url: 'https://repositorio.inta.gob.ar/oai/request?verb=ListSets' },
    { name: 'UNS Digital', url: 'https://repositoriodigital.uns.edu.ar/oai/request?verb=ListSets' }
  ];

  for (const r of repos) {
    try {
      const res = await fetch(r.url);
      const xml = await res.text();
      const setMatches = Array.from(xml.matchAll(/<setSpec>([^<]+)<\/setSpec>\s*<setName>([^<]+)<\/setName>/gi));
      console.log(`\n${r.name}: ${setMatches.length} sets found:`);
      for (const m of setMatches.slice(0, 15)) {
        console.log(`  - setSpec: "${m[1]}" | Name: "${m[2]}"`);
      }
    } catch (e) {
      console.log(`\n${r.name}: Error ${e.message}`);
    }
  }
}

listSets().catch(console.error);
