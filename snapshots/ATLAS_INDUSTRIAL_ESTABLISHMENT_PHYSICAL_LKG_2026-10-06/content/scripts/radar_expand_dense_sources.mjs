import https from 'https';
import http from 'http';

const candidateEndpoints = [
  { id: 'LEGACY_SIPRO', url: 'https://infra.datos.gob.ar/catalog/modernizacion/dataset/2/distribution/2.11/download/proveedores.csv' },
  { id: 'LEGACY_SIPRO_OLD', url: 'https://infra.datos.gob.ar/catalog/modernizacion/dataset/2/distribution/2.12/download/proveedores-sistema-legacy.csv' },
  { id: 'INTA_DIGITAL', url: 'https://repositorio.inta.gob.ar/oai/request?verb=Identify' },
  { id: 'UNL_BIBLIOTECA', url: 'https://bibliotecavirtual.unl.edu.ar/oai/request?verb=Identify' },
  { id: 'GCBA_OBRAS_PROF', url: 'https://cdn.buenosaires.gob.ar/datosabiertos/datasets/desarrollo-urbano/obras-registradas/obras-registradas.csv' },
  { id: 'GCBA_COMERCIOS', url: 'https://cdn.buenosaires.gob.ar/datosabiertos/datasets/agencia-gubernamental-de-control/locales-habilitados/locales-habilitados.csv' },
  { id: 'ACUMAR_2026', url: 'https://datos.acumar.gob.ar/dataset/b54dcccd-5efa-4908-b24e-a8c837b4e55d/resource/03f28935-997a-4576-88ed-1ec6da519478/download/compras-contrataciones-acumar-2026.csv' },
  { id: 'ACUMAR_2025', url: 'https://datos.acumar.gob.ar/dataset/b54dcccd-5efa-4908-b24e-a8c837b4e55d/resource/03ba44ac-df7d-4a1e-b6b0-ffeff9335caa/download/compras-contrataciones-acumar-2025.csv' },
  { id: 'DATOS_CORDOBA', url: 'https://datosabiertos.cordoba.gob.ar/api/3/action/package_search?rows=5' },
  { id: 'DATOS_SANTA_FE', url: 'https://datos.santafe.gob.ar/api/3/action/package_search?rows=5' }
];

async function probeUrl(item) {
  return new Promise((resolve) => {
    const isHttps = item.url.startsWith('https');
    const client = isHttps ? https : http;
    const req = client.get(item.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 8000
    }, (res) => {
      resolve({
        id: item.id,
        url: item.url,
        statusCode: res.statusCode,
        contentType: res.headers['content-type'],
        contentLength: res.headers['content-length']
      });
      res.resume();
    });
    req.on('error', (err) => {
      resolve({ id: item.id, url: item.url, error: err.code || err.message });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ id: item.id, url: item.url, error: 'TIMEOUT' });
    });
  });
}

async function run() {
  console.log('Probing candidate Radar dense expansion resources...');
  for (const c of candidateEndpoints) {
    const res = await probeUrl(c);
    console.log(JSON.stringify(res));
  }
}

run();
