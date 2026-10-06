import fs from 'fs';

// STRICT: DO NOT set process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const endpoints = [
  { id: 'SRC_CKAN_DATOS_GOB_AR', url: 'https://datos.gob.ar/api/3/action/package_search?rows=1' },
  { id: 'SRC_BOLETIN_OFICIAL_AUTORIDADES', url: 'https://www.boletinoficial.gob.ar/seccion/segunda' },
  { id: 'SRC_INAES_COOP_MUTUAL', url: 'https://datos.gob.ar/api/3/action/package_show?id=inaes-registro-nacional-cooperativas-mutuales' },
  { id: 'SRC_OAI_CONICET_DIGITAL', url: 'https://ri.conicet.gov.ar/oai/request?verb=Identify' },
  { id: 'SRC_OAI_UNLP_SEDICI', url: 'http://sedici.unlp.edu.ar/oai/request?verb=Identify' }, // http endpoint
  { id: 'SRC_MININTERIOR_AUDIENCIAS', url: 'http://datos.mininterior.gob.ar/dataset/f9fcd62a-3656-4bb9-ba83-7544b4b156b8' }, // http endpoint
  { id: 'SRC_CKAN_CORDOBA_OPENDATA', url: 'https://datos.cordoba.gob.ar/api/3/action/package_search?rows=1' },
  { id: 'SRC_CKAN_ROSARIO_OPENDATA', url: 'https://datos.rosario.gob.ar/api/3/action/package_search?rows=1' },
  { id: 'SRC_OAI_UNR_NAC', url: 'https://rephip.unr.edu.ar/oai/request?verb=Identify' },
  { id: 'SRC_OAI_UNCUYO_BIDA', url: 'https://bida.uncu.edu.ar/oai/request?verb=Identify' },
  { id: 'SRC_OAI_UNNE_NAC', url: 'https://repositorio.unne.edu.ar/oai/request?verb=Identify' },
  { id: 'SRC_ARSAT_DDJJ_PATRIMONIALES', url: 'https://datos.arsat.com.ar/dataset/9c25bfbc-c941-4a78-b5a1-2bf853a760e2' },
  { id: 'SRC_OAI_UNS_NAC', url: 'https://repositoriodigital.uns.edu.ar/oai/request?verb=Identify' },
  { id: 'SRC_OAI_UNT_NAC', url: 'https://ri.unt.edu.ar/oai/request?verb=Identify' },
  { id: 'SRC_OAI_UNCOMA_NAC', url: 'https://rdi.uncoma.edu.ar/oai/request?verb=Identify' },
  { id: 'SRC_GCBA_OPEN_DATA_EXPANDED', url: 'https://data.buenosaires.gob.ar/api/3/action/package_search?rows=1' },
  { id: 'SRC_OAI_UNER_NAC', url: 'https://cienciaabierta.uner.edu.ar/oai/request?verb=Identify' },
  { id: 'SRC_OAI_UNSA_NAC', url: 'https://rdu.unsa.edu.ar/oai/request?verb=Identify' },
  { id: 'RES_SSS_DATOS_SALUD_HTTPS', url: 'https://datos.salud.gob.ar/api/3/action/package_search?rows=1' },
  { id: 'RES_SSS_DATOS_SALUD_HTTP', url: 'http://datos.salud.gob.ar/api/3/action/package_search?rows=1' },
  { id: 'SRC_DATOS_JUS_GOB_AR', url: 'https://datos.jus.gob.ar/api/3/action/package_search?rows=1' }
];

async function testTLS() {
  console.log('Testing endpoints with standard TLS verification (zero bypass)...');
  const results = [];

  for (const ep of endpoints) {
    const t0 = performance.now();
    try {
      const res = await fetch(ep.url, { headers: { 'User-Agent': 'AtlasTLSValidator/2.0' } });
      const lat = performance.now() - t0;
      results.push({
        id: ep.id,
        url: ep.url,
        status: res.status,
        latency_ms: parseFloat(lat.toFixed(1)),
        tls_status: 'VALID',
        reachable: true
      });
      console.log(`✓ [TLS_VALID] ${ep.id}: HTTP ${res.status} (${lat.toFixed(1)}ms)`);
    } catch (err) {
      const isTlsErr = err.cause?.code?.includes('CERT') || err.message?.includes('certificate');
      results.push({
        id: ep.id,
        url: ep.url,
        status: 0,
        tls_status: isTlsErr ? 'TLS_INVALID' : 'NETWORK_ERROR',
        error: err.cause?.code || err.message,
        reachable: false
      });
      console.log(`✗ [${isTlsErr ? 'TLS_INVALID' : 'FAIL'}] ${ep.id}: ${err.cause?.code || err.message}`);
    }
  }

  fs.writeFileSync('scratch/tls_validation_results.json', JSON.stringify(results, null, 2), 'utf8');
}

testTLS().catch(console.error);
