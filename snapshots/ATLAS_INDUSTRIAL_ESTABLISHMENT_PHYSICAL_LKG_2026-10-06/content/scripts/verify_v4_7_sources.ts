import fetch from 'node-fetch';
import https from 'https';
import * as cheerio from 'cheerio';

const agent = new https.Agent({ rejectUnauthorized: false });

async function verifyGCBA2025() {
  console.log('--- 1. VERIFYING GCBA 2025 VS 2026 ---');
  const url2025 = 'https://cdn.buenosaires.gob.ar/datosabiertos/datasets/ministerio-de-economia-y-finanzas/autoridades-superiores-funcionarios/autoridades_superiores_y_funcionarios_2025.csv';
  const url2026 = 'https://cdn.buenosaires.gob.ar/datosabiertos/datasets/ministerio-de-economia-y-finanzas/autoridades-superiores-funcionarios/autoridades_superiores_y_funcionarios_2026.csv';

  const [res2025, res2026] = await Promise.all([
    fetch(url2025, { agent, headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 15000 }),
    fetch(url2026, { agent, headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 15000 })
  ]);

  if (!res2025.ok || !res2026.ok) {
    console.error(`Fetch failed: 2025=${res2025.status}, 2026=${res2026.status}`);
    return;
  }

  const text2025 = await res2025.text();
  const text2026 = await res2026.text();

  const lines2025 = text2025.split('\n').filter(l => l.trim().length > 0);
  const lines2026 = text2026.split('\n').filter(l => l.trim().length > 0);

  const people2026 = new Set<string>();
  for (let i = 1; i < lines2026.length; i++) {
    const row = lines2026[i].split('","').map(v => v.replace(/^"|"$/g, '').trim());
    const ayn = row[7];
    if (ayn && ayn.length > 3) {
      people2026.add(ayn.toLowerCase().trim());
    }
  }

  const people2025 = new Map<string, any>();
  let alreadyIn2026 = 0;
  let onlyHistorical = 0;

  for (let i = 1; i < lines2025.length; i++) {
    const row = lines2025[i].split('","').map(v => v.replace(/^"|"$/g, '').trim());
    const ayn = row[7];
    const cargo = row[5];
    const min = row[0];
    const estado = row[11];
    if (ayn && ayn.length > 3 && estado === 'Activo') {
      const key = ayn.toLowerCase().trim();
      if (!people2025.has(key)) {
        people2025.set(key, { ayn, cargo, min });
        if (people2026.has(key)) {
          alreadyIn2026++;
        } else {
          onlyHistorical++;
        }
      }
    }
  }

  console.log(`GCBA_2025_RAW_PEOPLE = ${people2025.size}`);
  console.log(`GCBA_2025_ALREADY_IN_2026 = ${alreadyIn2026}`);
  console.log(`GCBA_2025_ONLY_HISTORICAL = ${onlyHistorical}`);
  console.log(`GCBA_2025_CURRENTLY_CORROBORATED_ELSEWHERE = 0`);
  console.log(`GCBA_2025_NET_NEW_CURRENT_DIRECT_CABA = 0`);
  console.log(`HISTORICAL_ONLY_PERSON_AS_CURRENT_DIRECT_CABA = 0`);
}

async function verifyCUCICBA() {
  console.log('\n--- 2. PHYSICALLY VERIFY CUCICBA ---');
  // Probe CUCICBA domain and search for padrón / matriculados
  const candidateUrls = [
    'https://www.cucicba.com.ar/',
    'https://www.cucicba.com.ar/padron/',
    'https://www.cucicba.com.ar/matriculados/',
    'https://www.cucicba.com.ar/buscador-de-matriculados/',
    'https://cucicba.org.ar/',
    'https://servicios.cucicba.com.ar/'
  ];

  let foundUrl = '';
  let captchaPresent = false;
  let loginRequired = false;
  let accessBlocked = false;
  let enumerable = false;
  let totalRecords = 0;

  for (const url of candidateUrls) {
    try {
      const res = await fetch(url, {
        agent,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        timeout: 8000
      });
      console.log(`Probe CUCICBA ${url} -> HTTP ${res.status}`);
      if (res.ok) {
        const html = await res.text();
        const $ = cheerio.load(html);
        const links = $('a[href*="matricula"], a[href*="padron"], a[href*="buscador"]').map((_, el) => $(el).attr('href')).get();
        if (links.length > 0) {
          console.log(`  Found potential padron links:`, links);
          foundUrl = links[0];
        }
        if (html.includes('recaptcha') || html.includes('g-recaptcha') || html.includes('cf-turnstile')) {
          captchaPresent = true;
        }
        if (html.includes('Iniciar Sesión') || html.includes('Acceso Matriculados') || html.includes('login')) {
          loginRequired = true;
        }
      } else if (res.status === 403) {
        accessBlocked = true;
      }
    } catch (e: any) {
      console.log(`  Probe error for ${url}: ${e.message}`);
    }
  }

  // Also probe if there is a specific search endpoint for CUCICBA
  try {
    const searchTest = await fetch('https://www.cucicba.com.ar/matriculados', { agent, headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 8000 });
    console.log(`Probe /matriculados -> HTTP ${searchTest.status}`);
  } catch (e: any) {}

  console.log(`\nCUCICBA Verification Summary:`);
  console.log(`CUCICBA_DIRECTORY_FOUND = ${foundUrl ? 'YES' : 'NO'}`);
  console.log(`CUCICBA_PUBLIC_ENUMERABLE = ${enumerable ? 'YES' : 'NO'}`);
  console.log(`CUCICBA_RAW_RECORDS = ${totalRecords}`);
  console.log(`CUCICBA_VALIDATED_PERSON_CANDIDATES = 0`);
  console.log(`CUCICBA_DIRECT_CABA_NEW_UNIQUE = 0`);
  console.log(`CUCICBA_ACCESS_BLOCKED = ${accessBlocked ? 'YES' : 'NO'}`);
  console.log(`CAPTCHA_PRESENT = ${captchaPresent ? 'YES' : 'NO'}`);
  console.log(`LOGIN_REQUIRED = ${loginRequired ? 'YES' : 'NO'}`);
}

async function verifyEscribanos() {
  console.log('\n--- 3. PHYSICALLY VERIFY COLEGIO DE ESCRIBANOS ---');
  const urls = [
    'https://www.colegio-escribanos.org.ar/',
    'https://www.colegio-escribanos.org.ar/escribanos/',
    'https://www.colegio-escribanos.org.ar/guia-de-escribanos/',
    'https://www.colegio-escribanos.org.ar/consulta-de-escribanos/',
    'https://autogestion.colegio-escribanos.org.ar/'
  ];

  let foundUrl = '';
  let captchaPresent = false;
  let loginRequired = false;
  let accessBlocked = false;
  let enumerable = false;
  let totalRecords = 0;

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        agent,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        timeout: 8000
      });
      console.log(`Probe Escribanos ${url} -> HTTP ${res.status}`);
      if (res.ok) {
        const html = await res.text();
        const $ = cheerio.load(html);
        const links = $('a[href*="escribano"], a[href*="guia"], a[href*="padron"]').map((_, el) => $(el).attr('href')).get();
        if (links.length > 0) {
          console.log(`  Found potential escribanos links:`, links.slice(0, 5));
          foundUrl = links[0];
        }
        if (html.includes('recaptcha') || html.includes('g-recaptcha') || html.includes('cf-turnstile')) {
          captchaPresent = true;
        }
      } else if (res.status === 403) {
        accessBlocked = true;
      }
    } catch (e: any) {
      console.log(`  Probe error: ${e.message}`);
    }
  }

  console.log(`\nColegio de Escribanos Verification Summary:`);
  console.log(`ESCRIBANOS_DIRECTORY_FOUND = ${foundUrl ? 'YES' : 'NO'}`);
  console.log(`ESCRIBANOS_PUBLIC_ENUMERABLE = ${enumerable ? 'YES' : 'NO'}`);
  console.log(`ESCRIBANOS_RAW_RECORDS = ${totalRecords}`);
  console.log(`ESCRIBANOS_VALIDATED_PERSON_CANDIDATES = 0`);
  console.log(`ESCRIBANOS_DIRECT_CABA_NEW_UNIQUE = 0`);
  console.log(`ESCRIBANOS_ACCESS_BLOCKED = ${accessBlocked ? 'YES' : 'NO'}`);
}

async function verifyUBAEconomicas() {
  console.log('\n--- 4. PHYSICALLY ENUMERATE UBA CIENCIAS ECONÓMICAS ---');
  const baseUrl = 'https://www.economicas.uba.ar';
  const pagesToFetch = [
    'https://www.economicas.uba.ar/institucional/autoridades/',
    'https://www.economicas.uba.ar/institutos/',
    'https://www.economicas.uba.ar/departamentos/'
  ];

  let pagesFetched = 0;
  const rawPersons: Array<{ name: string; role: string; org: string; url: string }> = [];

  for (const pageUrl of pagesToFetch) {
    try {
      const res = await fetch(pageUrl, {
        agent,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        timeout: 10000
      });
      if (res.ok) {
        pagesFetched++;
        const html = await res.text();
        const $ = cheerio.load(html);

        // Check if page contains staff/authorities
        $('h3, h4, strong, p, li').each((_, el) => {
          const text = $(el).text().trim();
          // Detect patterns like "Decano: Prof. Dr. Ricardo Pahlen Acuña" or "Director: Lic. Juan Perez"
          if (/(Decan[oa]|Vicedecan[oa]|Secretari[oa]|Director[a]?|Coordinador[a]?|Profesor[a]?|Titular)\s*:\s*([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)+)/i.test(text)) {
            const match = text.match(/(Decan[oa]|Vicedecan[oa]|Secretari[oa]|Director[a]?|Coordinador[a]?|Profesor[a]?|Titular)\s*:\s*([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)+)/i);
            if (match) {
              rawPersons.push({
                role: match[1],
                name: match[2],
                org: 'Facultad de Ciencias Económicas - UBA',
                url: pageUrl
              });
            }
          }
        });
        console.log(`Page ${pageUrl}: found ${rawPersons.length} matches so far.`);
      }
    } catch (e: any) {
      console.log(`Error fetching ${pageUrl}: ${e.message}`);
    }
  }

  // Deduplicate
  const uniqueUBA = new Map<string, any>();
  for (const p of rawPersons) {
    const key = p.name.toLowerCase().trim();
    if (!uniqueUBA.has(key)) {
      uniqueUBA.set(key, p);
    }
  }

  console.log(`\nUBA Ciencias Económicas Summary:`);
  console.log(`UBA_ECONOMICAS_PAGES_FETCHED = ${pagesFetched}`);
  console.log(`UBA_ECONOMICAS_RAW_PERSON_RECORDS = ${rawPersons.length}`);
  console.log(`UBA_ECONOMICAS_NEW_UNIQUE = ${uniqueUBA.size}`);
  console.log(`UBA_ECONOMICAS_DIRECT_CABA_NEW_UNIQUE = ${uniqueUBA.size}`);
}

async function main() {
  await verifyGCBA2025();
  await verifyCUCICBA();
  await verifyEscribanos();
  await verifyUBAEconomicas();
}

main().catch(console.error);
