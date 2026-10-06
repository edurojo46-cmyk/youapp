import fetch from 'node-fetch';

async function extractLinks() {
  const url = 'https://exactas.uba.ar/institucional/autoridades/';
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await res.text();
  const linkRegex = /<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1];
    const text = match[2].replace(/<[^>]+>/g, '').trim();
    if (href.includes('autoridad') || text.toLowerCase().includes('autoridad') || text.toLowerCase().includes('decan')) {
      console.log(`${text} -> ${href}`);
    }
  }
}

extractLinks().catch(console.error);
