import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import https from 'https';

const agent = new https.Agent({ rejectUnauthorized: false });

async function inspectMore() {
  // 1. Defensoria
  try {
    const res = await fetch('https://defensoria.org.ar/institucional/autoridades/', { agent });
    const html = await res.text();
    const $ = cheerio.load(html);
    console.log('--- DEFENSORIA CABA ---');
    $('h2, h3, h4, strong, p').each((i, el) => {
      const text = $(el).text().trim();
      if (text.toLowerCase().includes('defensor') || text.toLowerCase().includes('maría rosa muiños') || text.toLowerCase().includes('adjunt')) {
        console.log('Defensoria match:', text);
      }
    });
  } catch(e: any) {
    console.log('Def err:', e.message);
  }

  // 2. Exactas UBA
  try {
    const res = await fetch('https://exactas.uba.ar/institucional/autoridades/', { agent });
    const html = await res.text();
    const $ = cheerio.load(html);
    console.log('--- EXACTAS UBA ---');
    $('h2, h3, h4, p, li').each((i, el) => {
      const text = $(el).text().trim();
      if (text.toLowerCase().includes('decano') || text.toLowerCase().includes('secretar') || text.toLowerCase().includes('vicedecan')) {
        console.log('Exactas match:', text.slice(0, 100));
      }
    });
  } catch(e: any) {
    console.log('Exactas err:', e.message);
  }

  // 3. UCA
  try {
    const res = await fetch('https://uca.edu.ar/es/autoridades', { agent });
    const html = await res.text();
    const $ = cheerio.load(html);
    console.log('--- UCA ---');
    $('h2, h3, h4, p, li').each((i, el) => {
      const text = $(el).text().trim();
      if (text.toLowerCase().includes('rector') || text.toLowerCase().includes('decano') || text.toLowerCase().includes('vicerrector')) {
        console.log('UCA match:', text.slice(0, 100));
      }
    });
  } catch(e: any) {
    console.log('UCA err:', e.message);
  }
}

inspectMore();
