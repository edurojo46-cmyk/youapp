import fetch from 'node-fetch';
import https from 'https';
import * as cheerio from 'cheerio';

const agent = new https.Agent({ rejectUnauthorized: false });

async function probeTarget(name: string, url: string) {
  try {
    const res = await fetch(url, {
      agent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      timeout: 10000
    });
    console.log(`[HTTP ${res.status}] ${name} -> ${url}`);
    if (res.ok) {
      const text = await res.text();
      const hasLogin = text.includes('Iniciar sesión') || text.includes('Acceso restringido') || text.includes('password');
      const hasCaptcha = text.includes('g-recaptcha') || text.includes('cf-turnstile') || text.includes('hcaptcha');
      console.log(`   Length: ${text.length} | LoginRequired: ${hasLogin} | Captcha: ${hasCaptcha}`);
      return { ok: true, length: text.length, text };
    }
  } catch (e: any) {
    console.log(`[ERR] ${name}: ${e.message}`);
  }
  return { ok: false, length: 0, text: '' };
}

async function main() {
  console.log('=== PROBING HIGH-PRIORITY CANDIDATES FOR NEXT LARGE SOURCE ===\n');

  console.log('--- 1. HEALTH PROFESSIONAL DIRECTORIES ---');
  await probeTarget('Hospital Italiano - Staff Médico', 'https://www.hospitalitaliano.org.ar/#!/home/medicos');
  await probeTarget('Hospital Alemán - Profesionales', 'https://www.hospitalaleman.org.ar/profesionales/');
  await probeTarget('Hospital Británico - Profesionales', 'https://www.hospitalbritanico.org.ar/cuerpo-medico');
  await probeTarget('Asociación Médica Argentina (AMA)', 'https://www.ama-med.org.ar/institucional/autoridades');

  console.log('\n--- 2. UNIVERSITY FACULTY & STAFF DIRECTORIES ---');
  await probeTarget('UBA FADU - Autoridades', 'https://www.fadu.uba.ar/institucional/autoridades/');
  await probeTarget('UBA Filosofía y Letras - Departamentos', 'http://filo.uba.ar/departamentos');
  await probeTarget('UTDT - Profesores', 'https://www.utdt.edu/listado_profesores.php');
  await probeTarget('UCEMA - Profesores', 'https://ucema.edu.ar/profesores');

  console.log('\n--- 3. JUDICIAL & PUBLIC CABA ROSTERS ---');
  await probeTarget('MPF CABA - Autoridades', 'https://mpfciudad.gob.ar/institucional/autoridades');
  await probeTarget('MPD CABA - Defensorías', 'https://mpdciudad.gob.ar/institucional/autoridades');
  await probeTarget('Consejo de la Magistratura CABA - Guía Judicial', 'https://consejocaba.jusbaires.gob.ar/guia-judicial');
  await probeTarget('Legislatura CABA - Comisiones', 'https://www.legislatura.gob.ar/seccion/comisiones.html');
}

main().catch(console.error);
