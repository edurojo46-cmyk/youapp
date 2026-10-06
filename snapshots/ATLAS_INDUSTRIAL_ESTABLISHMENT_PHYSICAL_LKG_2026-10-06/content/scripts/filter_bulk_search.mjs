import fs from 'fs';

const items = JSON.parse(fs.readFileSync('scratch/datos_bulk_search_results.json', 'utf8'));
const filtered = items.filter(it => 
  ['cooperativas', 'mutuales', 'matriculados'].includes(it.query)
);
console.log('Filtered count:', filtered.length);
for (const it of filtered.slice(0, 30)) {
  console.log(`[${it.query.toUpperCase()}] ${it.dataset} | ${it.name} | ${it.url}`);
}
