import fetch from 'node-fetch';
import https from 'https';
import * as cheerio from 'cheerio';

const agent = new https.Agent({ rejectUnauthorized: false });

async function probeAcademicAndJudicial() {
  console.log('=== PROBING ACADEMIC, JUDICIAL & LEGISLATIVE CANDIDATES ===\n');

  const targets = [
    { name: 'Legislatura CABA - Legisladores', url: 'https://www.legislatura.gob.ar/seccion/legisladores.html' },
    { name: 'Defensoría CABA - Autoridades', url: 'https://defensoria.org.ar/institucional/autoridades/' },
    { name: 'UBA Derecho - Autoridades', url: 'http://www.derecho.uba.ar/institucional/autoridades.php' },
    { name: 'UBA Medicina - Autoridades', url: 'https://www.fmed.uba.ar/facultad/autoridades' },
    { name: 'UBA Exactas - Autoridades', url: 'https://exactas.uba.ar/institucional/autoridades/' },
    { name: 'UBA Psicología - Autoridades', url: 'https://www.psi.uba.ar/institucional.php?var=institucional/autoridades/index.php' },
    { name: 'UBA Odontología - Autoridades', url: 'http://www.odon.uba.ar/sitio/institucional/autoridades.php' },
    { name: 'UBA Farmacia y Bioquímica - Autoridades', url: 'https://www.ffyb.uba.ar/institucional/autoridades/' },
    { name: 'UTN FRBA - Autoridades', url: 'https://www.frba.utn.edu.ar/la-facultad/autoridades/' }
  ];

  for (const t of targets) {
    try {
      const res = await fetch(t.url, {
        agent,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        timeout: 8000
      });
      console.log(`[HTTP ${res.status}] ${t.name} -> ${t.url}`);
      if (res.ok) {
        const text = await res.text();
        const $ = cheerio.load(text);
        console.log(`   Page title: ${$('title').text().trim()} | size: ${text.length} bytes`);
      }
    } catch (e: any) {
      console.log(`[ERR] ${t.name}: ${e.message}`);
    }
  }
}

probeAcademicAndJudicial().catch(console.error);
