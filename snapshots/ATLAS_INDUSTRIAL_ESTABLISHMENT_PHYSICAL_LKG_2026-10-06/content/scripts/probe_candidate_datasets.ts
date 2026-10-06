import fetch from 'node-fetch';
import https from 'https';
import * as cheerio from 'cheerio';

const agent = new https.Agent({ rejectUnauthorized: false });

async function checkDatasets() {
  console.log('=== CHECKING CANDIDATE DATASETS ===\n');

  // 1. Inspectores AGC
  try {
    const urlAGC = 'https://cdn.buenosaires.gob.ar/datosabiertos/datasets/agencia-gubernamental-de-control/inspectores-verificadores-agc/inspectores-y-verificadores-agc.csv';
    const resAGC = await fetch(urlAGC, { agent, timeout: 10000 });
    console.log('AGC Status:', resAGC.status);
    if (resAGC.ok) {
      const text = await resAGC.text();
      const lines = text.split('\n').filter(l => l.trim().length > 0);
      console.log(`AGC Total Lines: ${lines.length}`);
      console.log(`AGC Header: ${lines[0]}`);
      console.log(`AGC Sample 1: ${lines[1]}`);
      console.log(`AGC Sample 2: ${lines[2]}`);
    }
  } catch (e: any) {
    console.log('AGC error:', e.message);
  }

  // 2. Profesionales APRA
  try {
    const urlAPRA = 'https://cdn.buenosaires.gob.ar/datosabiertos/datasets/agencia-de-proteccion-ambiental/consultores-profesionales-auditorias-estudios-ambientales/profesionales.csv';
    const resAPRA = await fetch(urlAPRA, { agent, timeout: 10000 });
    console.log('\nAPRA Status:', resAPRA.status);
    if (resAPRA.ok) {
      const text = await resAPRA.text();
      const lines = text.split('\n').filter(l => l.trim().length > 0);
      console.log(`APRA Total Lines: ${lines.length}`);
      console.log(`APRA Header: ${lines[0]}`);
      console.log(`APRA Sample 1: ${lines[1]}`);
    }
  } catch (e: any) {
    console.log('APRA error:', e.message);
  }

  // 3. JusBaires Magistrados
  try {
    const urlJus = 'https://www.jusbaires.gob.ar/magistrados';
    const resJus = await fetch(urlJus, { agent, timeout: 10000 });
    console.log('\nJusBaires Status:', resJus.status);
    if (resJus.ok) {
      const text = await resJus.text();
      const $ = cheerio.load(text);
      console.log('JusBaires Title:', $('title').text().trim());
      const links = $('a').map((_, el) => $(el).text().trim()).get().filter(t => t.length > 5);
      console.log('JusBaires sample links/names:', links.slice(0, 10));
    }
  } catch (e: any) {
    console.log('JusBaires error:', e.message);
  }
}

checkDatasets().catch(console.error);
