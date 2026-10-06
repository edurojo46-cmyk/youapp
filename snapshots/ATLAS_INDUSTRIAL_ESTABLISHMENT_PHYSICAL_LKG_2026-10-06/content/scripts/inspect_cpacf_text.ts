import fetch from 'node-fetch';

async function inspectCpacfText() {
  const r1 = await fetch('https://www.cpacf.org.ar/noticia/6755/consejo-directivo-autoridades-actuales', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const html = await r1.text();
  console.log('CPACF HTML length:', html.length);
  // Find where the article body is
  const bodyStart = html.indexOf('<article') !== -1 ? html.indexOf('<article') : html.indexOf('class="noticia"');
  if (bodyStart !== -1) {
    console.log(html.substring(bodyStart, bodyStart + 3000).replace(/<[^>]+>/g, '\n').replace(/\n\s*\n/g, '\n'));
  } else {
    // Look for paragraphs <p>
    const ps = html.match(/<p[^>]*>([\s\S]*?)<\/p>/gi) || [];
    console.log(`Found ${ps.length} paragraphs`);
    ps.slice(0, 15).forEach(p => console.log('P:', p.replace(/<[^>]+>/g, ' ').trim()));
  }
}

inspectCpacfText().catch(console.error);
