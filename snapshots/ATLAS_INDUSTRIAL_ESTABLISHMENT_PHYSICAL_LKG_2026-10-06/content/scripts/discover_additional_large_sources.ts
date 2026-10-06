import fetch from 'node-fetch';
import https from 'https';
import * as cheerio from 'cheerio';

const agent = new https.Agent({ rejectUnauthorized: false });

async function searchGCBAData() {
  console.log('=== SEARCHING GCBA DATOS ABIERTOS CKAN API ===');
  const queries = ['personal', 'funcionarios', 'autoridades', 'docentes', 'profesionales', 'salud'];
  for (const q of queries) {
    try {
      const res = await fetch(`https://data.buenosaires.gob.ar/api/3/action/package_search?q=${encodeURIComponent(q)}&rows=10`, {
        agent,
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 10000
      });
      if (res.ok) {
        const data = await res.json() as any;
        console.log(`\nQuery "${q}": found ${data.result?.count || 0} packages.`);
        for (const pkg of (data.result?.results || []).slice(0, 5)) {
          console.log(` - Package: "${pkg.title}" (${pkg.name})`);
          for (const r of (pkg.resources || []).slice(0, 3)) {
            console.log(`    Resource: "${r.name}" [${r.format}] -> ${r.url}`);
          }
        }
      } else {
        console.log(`Query "${q}" HTTP ${res.status}`);
      }
    } catch (e: any) {
      console.log(`Query "${q}" error: ${e.message}`);
    }
  }
}

async function probeProfessionalRegistries() {
  console.log('\n=== PROBING PROFESSIONAL REGISTRIES (CABA) ===');
  const registries = [
    { name: 'CPACF (Abogados CABA)', url: 'https://www.cpacf.org.ar/', padronUrl: 'https://www.cpacf.org.ar/padron' },
    { name: 'CPCECABA (Ciencias Económicas CABA)', url: 'https://www.consejo.org.ar/', padronUrl: 'https://www.consejo.org.ar/matriculados' },
    { name: 'CPAU (Arquitectura y Urbanismo CABA)', url: 'https://www.cpau.org/', padronUrl: 'https://www.cpau.org/servicios/matriculados' },
    { name: 'CPIC (Ingeniería Civil CABA)', url: 'https://www.cpic.org.ar/', padronUrl: 'https://www.cpic.org.ar/matriculados' },
    { name: 'Colegio Público de Traductores CABA', url: 'https://www.traductores.org.ar/', padronUrl: 'https://www.traductores.org.ar/matriculados/' },
    { name: 'Consejo de la Magistratura CABA', url: 'https://consejocaba.gob.ar/', padronUrl: 'https://consejocaba.gob.ar/institucional/autoridades/' },
    { name: 'Poder Judicial CABA (JusBaires)', url: 'https://www.jusbaires.gob.ar/', padronUrl: 'https://www.jusbaires.gob.ar/magistrados' }
  ];

  for (const reg of registries) {
    try {
      const res = await fetch(reg.padronUrl, {
        agent,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        timeout: 8000
      });
      console.log(`Registry ${reg.name} (${reg.padronUrl}) -> HTTP ${res.status}`);
      if (res.ok) {
        const text = await res.text();
        const hasCaptcha = text.includes('recaptcha') || text.includes('hcaptcha') || text.includes('cf-turnstile');
        const hasLogin = text.includes('password') || text.includes('iniciar sesion') || text.includes('login');
        console.log(`  Length: ${text.length} | Captcha: ${hasCaptcha} | Login: ${hasLogin}`);
      }
    } catch (e: any) {
      console.log(`Registry ${reg.name} error: ${e.message}`);
    }
  }
}

async function main() {
  await searchGCBAData();
  await probeProfessionalRegistries();
}

main().catch(console.error);
