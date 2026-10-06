import fetch from 'node-fetch';

async function checkResources() {
  const url = 'https://datos.gob.ar/api/3/action/package_show?id=personal';
  const res = await fetch(url);
  const json = await res.json();
  console.log('Package title:', json?.result?.title);
  for (const r of json?.result?.resources || []) {
    console.log(`- Resource: ${r.name} | Format: ${r.format} | URL: ${r.url}`);
  }
}

checkResources().catch(console.error);
