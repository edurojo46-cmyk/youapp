async function probeCategory(category: string, query: string) {
  console.log(`\n=== PROBING CATEGORY: ${category} ===`);
  const encoded = encodeURIComponent(query);
  try {
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encoded}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    if (!res.ok) {
      console.log(`Status: ${res.status}`);
      return;
    }
    const html = await res.text();
    const urlRegex = /class="result__url"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    
    let m;
    let count = 0;
    while ((m = urlRegex.exec(html)) !== null && count < 5) {
      const rawUrl = m[1].trim();
      let finalUrl = rawUrl;
      if (rawUrl.includes('uddg=')) {
        const decoded = decodeURIComponent(rawUrl.split('uddg=')[1].split('&')[0]);
        finalUrl = decoded;
      }
      const title = m[2].replace(/<[^>]+>/g, '').trim();
      console.log(`[FOUND] Title: ${title}`);
      console.log(`        URL: ${finalUrl}`);
      count++;
    }
  } catch (err: any) {
    console.error('Probe error:', err.message);
  }
}

async function run() {
  await probeCategory('CHAMBERS', 'camara de comercio CABA autoridades OR directorio site:.org.ar');
  await probeCategory('CLUBS', 'club deportivo CABA "comision directiva" site:.org.ar OR site:.com.ar');
  await probeCategory('TRADE_UNIONS', 'sindicato CABA "comision directiva" OR autoridades site:.org.ar');
  await probeCategory('UNIVERSITIES', 'universidad buenos aires autoridades site:.edu.ar');
}

run();
