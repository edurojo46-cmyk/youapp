process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import fetch from 'node-fetch';

async function probeMiPortal() {
  console.log('=== PROBING BIEP MIPORTAL.GOB.AR ===');

  const urls = [
    'https://biep.miportal.gob.ar/apps/directorio/',
    'https://biep.miportal.gob.ar/apps/directorio/archivos/datos.zip',
    'https://biep.miportal.gob.ar/apps/directorio/api/'
  ];

  for (const u of urls) {
    try {
      console.log('\nProbing:', u);
      const res = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 });
      console.log(`Status: ${res.status}, Type: ${res.headers.get('content-type')}, Size: ${res.headers.get('content-length')}`);
      if (res.ok && res.headers.get('content-type')?.includes('text')) {
        const text = await res.text();
        console.log('Preview (first 300 chars):', text.slice(0, 300));
      }
    } catch (e: any) {
      console.log('Error probing:', e.message);
    }
  }
}

probeMiPortal().catch(console.error);
