/**
 * scripts/find_largest_ckan_datasets.mjs
 * 
 * Queries datos.gob.ar CKAN API to list all datasets sorted by size/views/records.
 */

import fetch from 'node-fetch';
import fs from 'fs';

async function main() {
  console.log('Querying datos.gob.ar for all datasets with resources...');

  const res = await fetch('https://datos.gob.ar/api/3/action/package_search?rows=100');
  const json = await res.json();
  if (!json.success) {
    console.error('CKAN API failed');
    return;
  }

  console.log(`Total packages on datos.gob.ar: ${json.result.count}`);

  const largeResources = [];
  for (const pkg of json.result.results) {
    for (const r of (pkg.resources || [])) {
      const sizeMb = (r.size || 0) / 1024 / 1024;
      largeResources.push({
        pkg_title: pkg.title,
        pkg_id: pkg.id,
        name: r.name,
        format: r.format,
        sizeMb: sizeMb.toFixed(2),
        url: r.url,
        created: r.created
      });
    }
  }

  largeResources.sort((a, b) => parseFloat(b.sizeMb) - parseFloat(a.sizeMb));

  console.log('\nTop 25 largest resources on datos.gob.ar:');
  for (const r of largeResources.slice(0, 25)) {
    console.log(`- [${r.sizeMb} MB] [${r.format}] ${r.pkg_title} | ${r.name} | ${r.url}`);
  }
}

main().catch(console.error);
