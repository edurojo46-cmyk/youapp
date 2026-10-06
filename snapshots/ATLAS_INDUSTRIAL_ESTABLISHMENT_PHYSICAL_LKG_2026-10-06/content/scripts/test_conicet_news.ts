import fetch from 'node-fetch';

async function run() {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent('site:conicet.gov.ar investigador CABA')}&hl=es-419&gl=AR&ceid=AR:es-419`;
  const res = await fetch(url);
  const xml = await res.text();
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  console.log(`Found ${items.length} items`);
  for (let i = 0; i < Math.min(items.length, 10); i++) {
    const item = items[i];
    const title = (item.match(/<title>([\s\S]*?)<\/title>/) || [])[1]?.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1');
    const pubDate = (item.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1];
    const source = (item.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [])[1];
    console.log(`[${i+1}] ${title} | ${source} | ${pubDate}`);
  }
}

run().catch(console.error);
