import fetch from 'node-fetch';

async function parseExactas() {
  const url = 'https://exactas.uba.ar/institucional/autoridades/';
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const html = await res.text();
  
  // Extract names and roles from HTML
  // Look for headings, paragraphs, or strong tags
  const matches = html.match(/<(?:h[2-6]|strong|b|p)[^>]*>([\s\S]*?)<\/(?:h[2-6]|strong|b|p)>/gi) || [];
  console.log(`Found ${matches.length} text blocks.`);
  
  const extracted: string[] = [];
  for (const m of matches) {
    const clean = m.replace(/<[^>]+>/g, '').trim();
    if (clean.length > 5 && clean.length < 120) {
      if (/Dr\.|Dra\.|Lic\.|Decan|Secretar|Director|Profesor/i.test(clean)) {
        extracted.push(clean);
      }
    }
  }

  console.log(`Extracted ${extracted.length} authority mentions:`);
  for (const e of extracted.slice(0, 25)) {
    console.log(`- ${e}`);
  }
}

parseExactas().catch(console.error);
