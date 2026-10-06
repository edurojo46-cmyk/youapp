import fs from 'fs';

async function findResources() {
  console.log('Searching downloadable CSV/JSON resources in datos.gob.ar...');
  
  const res1 = await fetch('https://datos.gob.ar/api/3/action/package_search?q=proveedores+OR+autoridades+OR+registro&rows=10');
  const json1 = await res1.json();
  
  if (json1.success) {
    console.log(`Found ${json1.result.count} packages in datos.gob.ar:`);
    for (const pkg of json1.result.results) {
      console.log(`\nPackage: ${pkg.title} (${pkg.name})`);
      console.log(`  License: ${pkg.license_title || pkg.license_id || 'None'}`);
      for (const r of pkg.resources || []) {
        console.log(`    Resource: [${r.format}] ${r.name}`);
        console.log(`    URL: ${r.url}`);
      }
    }
  }

  console.log('\nSearching downloadable CSV/JSON resources in data.buenosaires.gob.ar...');
  const res2 = await fetch('https://data.buenosaires.gob.ar/api/3/action/package_search?q=personal+OR+autoridades+OR+proveedores&rows=10');
  const json2 = await res2.json();
  
  if (json2.success) {
    console.log(`Found ${json2.result.count} packages in CABA Data:`);
    for (const pkg of json2.result.results) {
      console.log(`\nPackage: ${pkg.title} (${pkg.name})`);
      console.log(`  License: ${pkg.license_title || pkg.license_id || 'None'}`);
      for (const r of pkg.resources || []) {
        console.log(`    Resource: [${r.format}] ${r.name}`);
        console.log(`    URL: ${r.url}`);
      }
    }
  }
}

findResources().catch(console.error);
