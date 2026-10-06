import fetch from 'node-fetch';

async function inspectCpacfPages() {
  // 1. GuiaAbo3.aspx
  console.log('=== INSPECTING GuiaAbo3.aspx ===');
  const res1 = await fetch('https://w3.cpacf.org.ar/GuiaAbo2/GuiaAbo3.aspx', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const html1 = await res1.text();
  console.log(html1);

  // 2. Consejo Directivo
  console.log('\n=== INSPECTING CONSEJO DIRECTIVO HTML CONTENT ===');
  const res2 = await fetch('https://www.cpacf.org.ar/noticia/6755/consejo-directivo-autoridades-actuales', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const html2 = await res2.text();
  // Look for the main article content container
  const articleMatch = html2.match(/<article[\s\S]*?<\/article>/i) || html2.match(/class=["'][^"']*noticia[^"']*["'][\s\S]*?<\/div>/i);
  if (articleMatch) {
    console.log('Found article container length:', articleMatch[0].length);
    console.log(articleMatch[0].replace(/<[^>]+>/g, '\n').replace(/\n\s*\n/g, '\n').substring(0, 2000));
  } else {
    // Look for names like Gil Lavedra (current president of CPACF)
    const glIdx = html2.indexOf('Gil Lavedra');
    if (glIdx !== -1) {
      console.log('Gil Lavedra context:');
      console.log(html2.substring(glIdx - 200, glIdx + 800).replace(/<[^>]+>/g, ' '));
    }
  }
}

inspectCpacfPages().catch(console.error);
