import fs from 'fs';
import path from 'path';

async function testSource(name, url, options = {}) {
  console.log(`\nTesting [${name}]: ${url}`);
  const t0 = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeout);
    const dt = Date.now() - t0;
    console.log(`  -> Status: ${res.status} ${res.statusText} (${dt}ms)`);
    console.log(`  -> Content-Type: ${res.headers.get('content-type')}`);
    const contentLength = res.headers.get('content-length');
    if (contentLength) console.log(`  -> Content-Length: ${contentLength} bytes`);
    
    // Read snippet
    const text = await res.text();
    console.log(`  -> Actual Bytes Read: ${Buffer.byteLength(text, 'utf8')}`);
    console.log(`  -> First 200 chars:`, text.slice(0, 200).replace(/\n/g, ' '));
    return { ok: res.ok, status: res.status, bytes: Buffer.byteLength(text, 'utf8'), text };
  } catch (err) {
    console.log(`  -> ERROR: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

async function probeSources() {
  console.log('================================================================');
  console.log('PROBING LIVE OFFICIAL DOWNLOADABLE SOURCES (REAL BYTES)');
  console.log('================================================================');

  // 1. Datos Argentina CKAN API
  await testSource(
    'DATOS_ARGENTINA_PACKAGE_SEARCH',
    'https://datos.gob.ar/api/3/action/package_search?q=proveedores&rows=5'
  );

  // 2. CABA Open Data CKAN API
  await testSource(
    'CABA_OPEN_DATA_PACKAGE_SEARCH',
    'https://data.buenosaires.gob.ar/api/3/action/package_search?q=personal&rows=3'
  );

  // 3. UNMdP Nulan OAI-PMH (Next records page)
  await testSource(
    'UNMDP_NULAN_OAI_PMH',
    'https://nulan.mdp.edu.ar/cgi/oai2?verb=ListRecords&metadataPrefix=oai_dc'
  );

  // 4. SEDICI UNLP OAI-PMH
  await testSource(
    'SEDICI_UNLP_OAI_PMH',
    'http://sedici.unlp.edu.ar/oai/request?verb=Identify'
  );

  // 5. Rosario Datos Abiertos
  await testSource(
    'ROSARIO_DATOS_ABIERTOS',
    'https://datos.rosario.gob.ar/api/3/action/package_search?q=funcionarios&rows=3'
  );
}

probeSources().catch(console.error);
