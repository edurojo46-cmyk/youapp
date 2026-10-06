import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import https from 'https';

const agent = new https.Agent({ rejectUnauthorized: false });

async function inspectCOFYBCF() {
  const url = 'https://www.cofybcf.org.ar/autoridades.php';
  const res = await fetch(url, { agent, headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 8000 });
  const html = await res.text();
  const $ = cheerio.load(html);
  const people: any[] = [];
  $('table tr, div, p').each((_, el) => {
    const text = $(el).text().trim();
    if (text.includes('Farm.') || text.includes('Bioq.') || text.includes('President') || text.includes('Secretari') || text.includes('Tesor')) {
      if (text.length < 120 && text.length > 10) {
        people.push(text);
      }
    }
  });
  console.log('COFYBCF matched text lines:', people.length);
  console.log('Sample:', people.slice(0, 10));
}

async function inspectUTN() {
  const url = 'https://frba.utn.edu.ar/autoridades/';
  const res = await fetch(url, { agent, headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 8000 });
  const html = await res.text();
  const $ = cheerio.load(html);
  const people: any[] = [];
  $('h2, h3, h4, strong, p').each((_, el) => {
    const text = $(el).text().trim();
    if (text.includes('Ing.') || text.includes('Decan') || text.includes('Vicedecan') || text.includes('Secretari')) {
      if (text.length < 80 && text.length > 5) {
        people.push(text);
      }
    }
  });
  console.log('UTN FRBA matched text lines:', people.length);
  console.log('Sample:', people.slice(0, 10));
}

async function inspectHuesped() {
  const url = 'https://www.huesped.org.ar/quienes-somos/';
  const res = await fetch(url, { agent, headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 8000 });
  const html = await res.text();
  const $ = cheerio.load(html);
  const people: any[] = [];
  $('h3, h4, strong, p').each((_, el) => {
    const text = $(el).text().trim();
    if (text.includes('Dr.') || text.includes('Dra.') || text.includes('Lic.') || text.includes('Director') || text.includes('Presidente')) {
      if (text.length < 80 && text.length > 5) {
        people.push(text);
      }
    }
  });
  console.log('Fundación Huésped matched text lines:', people.length);
  console.log('Sample:', people.slice(0, 10));
}

async function main() {
  await inspectCOFYBCF();
  await inspectUTN();
  await inspectHuesped();
}

main().catch(console.error);
