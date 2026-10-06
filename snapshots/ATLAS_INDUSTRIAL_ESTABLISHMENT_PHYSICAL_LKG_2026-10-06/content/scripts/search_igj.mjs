async function searchIgj() {
  const url = 'https://datos.gob.ar/api/3/action/package_search?q=igj';
  const res = await fetch(url);
  const data = await res.json();
  if (data.success) {
    console.log(`Found ${data.result.count} packages matching 'igj':`);
    for (const p of data.result.results) {
      console.log(`\nTitle: ${p.title} (ID: ${p.id}, Name: ${p.name})`);
      console.log(`License: ${p.license_title || p.license_id}`);
      for (const r of p.resources) {
        console.log(`  - [${r.format}] ${r.name}`);
        console.log(`    URL: ${r.url}`);
      }
    }
  }
}

searchIgj().catch(console.error);
