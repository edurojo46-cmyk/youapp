import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import https from 'https';

const agent = new https.Agent({ rejectUnauthorized: false });

async function check(url: string, name: string) {
  try {
    const res = await fetch(url, { agent, headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 8000 });
    const html = await res.text();
    const $ = cheerio.load(html);
    console.log(`\n=== ${name} ===`);
    console.log('Title:', $('title').text());
    console.log('Snippet:', $('body').text().replace(/\s+/g, ' ').slice(0, 400));
  } catch (e: any) {
    console.log(`Error on ${name}:`, e.message);
  }
}

async function main() {
  await check('https://frba.utn.edu.ar/autoridades/', 'UTN FRBA');
  await check('https://www.cofybcf.org.ar/autoridades.php', 'COFYBCF');
  await check('https://consejo.jusbaires.gob.ar/', 'Poder Judicial CABA');
  await check('https://defensoria.org.ar/autoridades/', 'Defensoría CABA');
  await check('https://www.hospitalbritanico.org.ar/institucional/', 'Hospital Británico');
}

main().catch(console.error);
