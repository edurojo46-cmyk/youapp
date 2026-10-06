async function checkPackage() {
  const url = 'https://datos.gob.ar/api/3/action/package_show?id=da045e06-35cb-4bdd-9b5e-ddee6712c86c';
  console.log(`Fetching package details from ${url}`);
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.success) {
      console.log('Package Title:', data.result.title);
      console.log('License:', data.result.license_title || data.result.license_id);
      console.log('Resources count:', data.result.resources.length);
      for (const r of data.result.resources) {
        console.log(`- [${r.format}] ${r.name} (${r.size || 'unknown'} bytes)`);
        console.log(`  URL: ${r.url}`);
      }
    } else {
      console.log('Error:', data);
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

checkPackage().catch(console.error);
