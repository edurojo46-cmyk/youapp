import fetch from 'node-fetch';
import https from 'https';
import * as cheerio from 'cheerio';

const agent = new https.Agent({ rejectUnauthorized: false });

async function checkBody() {
  const url = 'https://economicas.uba.ar/institucional/autoridades/';
  const res = await fetch(url, {
    agent,
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    timeout: 10000
  });

  const html = await res.text();
  const $ = cheerio.load(html);
  console.log('Title:', $('title').text());
  const bodyText = $('body').text().replace(/\s+/g, ' ');
  const idx1 = html.indexOf('Pahlen');
  const idx2 = html.indexOf('Pahlen', idx1 + 10);
  console.log('HTML slice around second Pahlen:\n', html.slice(Math.max(0, idx2 - 400), idx2 + 1000));
}

checkBody().catch(console.error);
