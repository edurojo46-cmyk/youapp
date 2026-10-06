import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import https from 'https';

const agent = new https.Agent({ rejectUnauthorized: false });

async function inspectRegistries() {
  // CPAU
  try {
    const res = await fetch('https://www.cpau.org/institucional/autoridades', { agent, headers: { 'User-Agent': 'Mozilla/5.0' } });
    const html = await res.text();
    const $ = cheerio.load(html);
    console.log('--- CPAU ---');
    $('h1, h2, h3, h4, strong, p').each((i, el) => {
      const text = $(el).text().trim();
      if (/presidente|consejer|secretari|vocal/i.test(text)) {
        console.log('CPAU:', text.slice(0, 100));
      }
    });
  } catch(e: any) {
    console.log('CPAU err:', e.message);
  }

  // CPCECABA
  try {
    const res = await fetch('https://www.consejo.org.ar/institucional/autoridades', { agent, headers: { 'User-Agent': 'Mozilla/5.0' } });
    const html = await res.text();
    const $ = cheerio.load(html);
    console.log('--- CPCECABA ---');
    $('h1, h2, h3, h4, strong, p').each((i, el) => {
      const text = $(el).text().trim();
      if (/presidente|consejer|secretari|tesorer/i.test(text)) {
        console.log('CPCECABA:', text.slice(0, 100));
      }
    });
  } catch(e: any) {
    console.log('CPCECABA err:', e.message);
  }
}

inspectRegistries();
