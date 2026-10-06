import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import https from 'https';

const agent = new https.Agent({ rejectUnauthorized: false });

async function testMarval() {
  const url = 'https://www.marval.com/profesionales';
  const res = await fetch(url, { agent, headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 8000 });
  const html = await res.text();
  const $ = cheerio.load(html);
  console.log('Marval Title:', $('title').text());
  const links: string[] = [];
  $('a[href*="/profesional/"]').each((_, el) => {
    const text = $(el).text().trim();
    if (text && !links.includes(text) && text.length > 3) {
      links.push(text);
    }
  });
  console.log('Marval Profesionales encontrados:', links.length, links.slice(0, 8));
}

async function testCPAU() {
  const url = 'https://www.cpau.org/servicios/matricula';
  const res = await fetch(url, { agent, headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 8000 });
  const html = await res.text();
  const $ = cheerio.load(html);
  console.log('CPAU Title:', $('title').text());
}

async function testUBAFCE() {
  const url = 'https://www.economicas.uba.ar/institucional/autoridades/';
  const res = await fetch(url, { agent, headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 8000 });
  const html = await res.text();
  const $ = cheerio.load(html);
  console.log('UBA FCE Title:', $('title').text());
  const names: string[] = [];
  $('h3, h4, strong, p').each((_, el) => {
    const t = $(el).text().trim();
    if (t.includes('Prof.') || t.includes('Dr.') || t.includes('Lic.') || t.includes('Mg.') || t.includes('Decan') || t.includes('Secretari')) {
      names.push(t);
    }
  });
  console.log('UBA FCE Aut/Prof encontrados:', names.length, names.slice(0, 5));
}

async function testITBA() {
  const url = 'https://www.itba.edu.ar/institucional/autoridades/';
  const res = await fetch(url, { agent, headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 8000 });
  const html = await res.text();
  const $ = cheerio.load(html);
  console.log('ITBA Title:', $('title').text());
}

async function main() {
  await testMarval();
  await testCPAU();
  await testUBAFCE();
  await testITBA();
}

main().catch(console.error);
