import fetch from 'node-fetch';
import https from 'https';

const agent = new https.Agent({ rejectUnauthorized: false });

async function searchGCBACatalog() {
  console.log('=== SEARCHING GCBA OPEN DATA CATALOG DEEPLY ===\n');

  const terms = [
    'autoridades',
    'funcionarios',
    'personal',
    'salud',
    'medicos',
    'docentes',
    'educacion',
    'cultura',
    'justicia',
    'directorio'
  ];

  const foundDatasets: Array<{ title: string; name: string; url?: string; format?: string; desc?: string }> = [];

  for (const term of terms) {
    try {
      const url = `https://data.buenosaires.gob.ar/api/3/action/package_search?q=${encodeURIComponent(term)}&rows=10`;
      const res = await fetch(url, { agent, headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 });
      if (res.ok) {
        const json: any = await res.json();
        const results = json?.result?.results || [];
        for (const pkg of results) {
          const title = pkg.title;
          const name = pkg.name;
          const resources = pkg.resources || [];
          for (const r of resources) {
            foundDatasets.push({
              title,
              name,
              url: r.url,
              format: r.format,
              desc: r.description || pkg.notes
            });
          }
        }
      } else {
        console.log(`Query "${term}" status: ${res.status}`);
      }
    } catch (e: any) {
      console.log(`Query "${term}" error: ${e.message}`);
    }
  }

  // Deduplicate by Package Title
  const uniquePackages = new Map<string, any>();
  for (const d of foundDatasets) {
    if (!uniquePackages.has(d.title)) {
      uniquePackages.set(d.title, d);
    }
  }

  console.log(`\nUnique dataset titles found (${uniquePackages.size}):`);
  for (const [title, d] of uniquePackages.entries()) {
    console.log(`- ${title} (format: ${d.format}) -> ${d.url}`);
  }
}

searchGCBACatalog().catch(console.error);
