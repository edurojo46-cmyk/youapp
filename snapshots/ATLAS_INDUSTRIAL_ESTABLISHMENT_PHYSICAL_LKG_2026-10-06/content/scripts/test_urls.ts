async function testUrls() {
  const urls = [
    { name: 'FECOBA', url: 'https://fecoba.org.ar/comite-ejecutivo/' },
    { name: 'CAC', url: 'https://www.cac.com.ar/institucional/consejo_directivo.aspx' },
    { name: 'CAME', url: 'https://www.redcame.org.ar/consejo-directivo' },
    { name: 'Club Italiano', url: 'https://clubitaliano.org.ar/autoridades/' }
  ];

  for (const item of urls) {
    try {
      const res = await fetch(item.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      });
      console.log(`[${item.name}] Status: ${res.status}`);
      if (res.ok) {
        const text = await res.text();
        console.log(`[${item.name}] Length: ${text.length}`);
      }
    } catch (e: any) {
      console.log(`[${item.name}] Error: ${e.message}`);
    }
  }
}

testUrls();
