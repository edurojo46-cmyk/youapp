import fetch from 'node-fetch';
import https from 'https';

const agent = new https.Agent({ rejectUnauthorized: false });

async function searchRecentGCBA() {
  console.log('=== SEARCHING CURRENT / RECENT GCBA DATASETS ===');
  const queries = ['2026', '2025', 'autoridades', 'personal', 'declaraciones juradas', 'guia de funcionarios'];
  for (const q of queries) {
    try {
      const res = await fetch(`https://data.buenosaires.gob.ar/api/3/action/package_search?q=${encodeURIComponent(q)}&rows=15`, {
        agent,
        timeout: 10000
      });
      if (res.ok) {
        const data = await res.json() as any;
        console.log(`\nQuery "${q}": found ${data.result.count} packages.`);
        for (const pkg of data.result.results) {
          const mod = pkg.metadata_modified || '';
          console.log(` - [${mod.slice(0, 10)}] ${pkg.title} (${pkg.name})`);
          for (const r of (pkg.resources || []).slice(0, 2)) {
            console.log(`     resource: ${r.name} (${r.format}) -> ${r.url}`);
          }
        }
      }
    } catch (e: any) {
      console.log(`Query ${q} error:`, e.message);
    }
  }
}

searchRecentGCBA().catch(console.error);
