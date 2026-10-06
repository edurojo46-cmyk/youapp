import fetch from 'node-fetch';
import https from 'https';
import * as cheerio from 'cheerio';

const agent = new https.Agent({ rejectUnauthorized: false });

async function probeSources() {
  console.log('=== SEARCHING FOR ADDITIONAL ACCESSIBLE LARGE / MEDIUM SOURCES ===\n');

  const urls = [
    { name: 'Legislatura CABA Diputados y Comisiones', url: 'https://www.legislatura.gob.ar/posts/diputados.html' },
    { name: 'MPF CABA (Ministerio Público Fiscal)', url: 'https://mpfciudad.gob.ar/autoridades' },
    { name: 'Defensoría del Pueblo CABA', url: 'https://defensoria.org.ar/institucional/autoridades/' },
    { name: 'Consejo de la Magistratura CABA Comisiones', url: 'https://consejo.jusbaires.gob.ar/institucional/comisiones/' },
    { name: 'FIUBA Autoridades y Departamentos', url: 'https://www.fi.uba.ar/institucional/autoridades' },
    { name: 'FADU Autoridades', url: 'https://www.fadu.uba.ar/institucional/autoridades' },
    { name: 'CPCECABA Comisiones de Estudios', url: 'https://www.consejo.org.ar/institucional/comisiones' },
    { name: 'CPAU Comisiones y Mesa Directiva', url: 'https://www.cpau.org/institucional/mesa-directiva' },
    { name: 'Hospital Italiano de Buenos Aires Staff', url: 'https://www.hospitalitaliano.org.ar/#!/home/institucional/seccion/1' }
  ];

  for (const item of urls) {
    try {
      const res = await fetch(item.url, {
        agent,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        timeout: 8000
      });
      console.log(`[PROBE] ${item.name} -> HTTP ${res.status}`);
      if (res.ok) {
        const text = await res.text();
        const $ = cheerio.load(text);
        const textLen = $('body').text().trim().length;
        console.log(`  Body text length: ${textLen}`);
      }
    } catch (e: any) {
      console.log(`[PROBE ERROR] ${item.name} -> ${e.message}`);
    }
  }
}

probeSources().catch(console.error);
