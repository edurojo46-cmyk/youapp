import fetch from 'node-fetch';
import { SocialEntityClassifier } from '../src/lib/search/social/SocialEntityClassifier';

const queries = [
  'site:lanacion.com.ar OR site:clarin.com OR site:infobae.com "Caballito" "médico"',
  'site:lanacion.com.ar OR site:clarin.com OR site:infobae.com "Palermo" "Dr."',
  'site:lanacion.com.ar OR site:clarin.com OR site:infobae.com "Recoleta" "Arq."',
  'site:lanacion.com.ar OR site:clarin.com OR site:infobae.com "Belgrano" "empresario"',
  'site:lanacion.com.ar OR site:clarin.com OR site:infobae.com "Almagro" "psicólogo"',
  'site:cronista.com OR site:ambito.com "CABA" "emprendedor" OR "fundador"'
];

async function run() {
  for (const q of queries) {
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
