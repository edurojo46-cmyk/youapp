import fetch from 'node-fetch';

async function findCms() {
  const r = await fetch('https://www.cpacf.org.ar/noticia/6755/consejo-directivo-autoridades-actuales', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const html = await r.text();
  const scripts = html.match(/<script[^>]*src=["']([^"']+)["']/gi) || [];
  console.log('Scripts:', scripts);
  const apis = html.match(/https?:\/\/[^"'\s]+\/api\/[^"'\s]+/gi) || [];
  console.log('APIs:', apis);
}

findCms().catch(console.error);
