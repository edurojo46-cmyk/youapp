import dotenv from 'dotenv';
dotenv.config();
import https from 'https';

const agent = new https.Agent({ rejectUnauthorized: false });

async function checkFcePages() {
  for (const id of [10077, 10245]) {
    const res = await fetch(`https://economicas.uba.ar/wp-json/wp/v2/pages/${id}`, { agent } as any);
    if (res.ok) {
      const p = await res.json();
      console.log(`\n=== PAGE ${id}: ${p.title?.rendered} ===`);
      const text = (p.content?.rendered || '').replace(/<[^>]+>/g, '\n').split('\n').map(l => l.trim()).filter(l => l.length > 3);
      console.log('Lines count:', text.length);
      console.log('Sample content lines:');
      for (const l of text.slice(0, 15)) {
        console.log(' *', l);
      }
    }
  }
}

checkFcePages().catch(console.error);
