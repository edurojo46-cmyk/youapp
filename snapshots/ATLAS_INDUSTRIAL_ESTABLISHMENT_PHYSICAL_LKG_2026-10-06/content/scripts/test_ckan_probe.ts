import dotenv from 'dotenv';
dotenv.config();
import https from 'https';

const agent = new https.Agent({ rejectUnauthorized: false });

async function checkDatosGobAr() {
  console.log('Probing datos.gob.ar CKAN API for person/investigador datasets...');
  const url = 'https://datos.gob.ar/api/3/action/package_search?q=investigadores%20OR%20conicet%20OR%20autoridades';
  try {
    const res = await fetch(url, {
      agent,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    } as any);
    console.log('CKAN datos.gob.ar Status:', res.status);
    if (res.ok) {
      const json = await res.json();
      const results = json.result?.results || [];
      console.log(`Found ${results.length} packages on datos.gob.ar.`);
      for (const p of results.slice(0, 10)) {
        console.log(` - Package: "${p.title}" (${p.name})`);
        for (const r of (p.resources || []).slice(0, 2)) {
          console.log(`     Resource: ${r.name} [${r.format}] -> ${r.url}`);
        }
      }
    }
  } catch (e: any) {
    console.error('CKAN API error:', e.message);
  }
}

checkDatosGobAr().catch(console.error);
