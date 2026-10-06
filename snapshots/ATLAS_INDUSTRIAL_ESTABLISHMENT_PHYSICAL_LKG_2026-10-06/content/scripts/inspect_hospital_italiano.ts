import fetch from 'node-fetch';
import https from 'https';

const agent = new https.Agent({ rejectUnauthorized: false });

async function inspectHospitalItaliano() {
  console.log('=== INSPECTING HOSPITAL ITALIANO DIRECTORY API ===');
  // Check common API endpoints
  const testEndpoints = [
    'https://www.hospitalitaliano.org.ar/api/profesionales',
    'https://www.hospitalitaliano.org.ar/api/medicos',
    'https://www.hospitalitaliano.org.ar/medicos/buscar',
    'https://www1.hospitalitaliano.org.ar/portal/profesionales',
    'https://www.hospitalitaliano.org.ar/servicios/medicos'
  ];

  for (const ep of testEndpoints) {
    try {
      const res = await fetch(ep, { agent, headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 8000 });
      console.log(`Endpoint: ${ep} -> HTTP ${res.status}`);
      if (res.ok) {
        const t = await res.text();
        console.log(`   Sample: ${t.slice(0, 150)}`);
      }
    } catch (e: any) {
      console.log(`Endpoint error ${ep}: ${e.message}`);
    }
  }

  // Also check page source of the SPA to see API base
  const pageRes = await fetch('https://www.hospitalitaliano.org.ar/', { agent, timeout: 8000 });
  if (pageRes.ok) {
    const html = await pageRes.text();
    const matches = html.match(/\/api\/[a-zA-Z0-9_\-\/]+/g) || [];
    console.log('API endpoints matched in HTML:', matches);
  }
}

inspectHospitalItaliano().catch(console.error);
