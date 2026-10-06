import fetch from 'node-fetch';

const institutionalQueries = [
  'site:buenosaires.gob.ar Caballito',
  'site:conicet.gov.ar CABA',
  'site:infobae.com Caballito médico OR comerciante',
  'site:clarin.com Palermo médico',
  'site:lanacion.com.ar Recoleta arquitecto'
];

async function run() {
  for (const q of institutionalQueries) {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=es-419&gl=AR&ceid=AR:es-419`;
    const res = await fetch(url);
    const xml = await res.text();
    const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
    console.log(`\nQuery "${q}": found ${items.length} items`);
    for (let i = 0; i < Math.min(items.length, 3); i++) {
      const item = items[i];
      const title = (item.match(/<title>([\s\S]*?)<\/title>/) || [])[1]?.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1');
      const source = (item.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [])[1];
      const pubDate = (item.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1];
      console.log(`  - [${source}] ${title} (${pubDate})`);
    }
  }
}

run().catch(console.error);
