async function testMore() {
  const list = [
    { name: 'UTN FRBA Autoridades', url: 'https://frba.utn.edu.ar/institucional/autoridades/' },
    { name: 'UNA Artes Autoridades', url: 'https://una.edu.ar/institucional/autoridades_16405' },
    { name: 'Hospital Italiano Directivos', url: 'https://www.hospitalitaliano.org.ar/#!/home/comunidad/noticia/11626' },
    { name: 'Hospital Garrahan Autoridades', url: 'https://www.garrahan.gov.ar/autoridades' },
    { name: 'AMM Medicos Municipales CABA', url: 'https://www.medicos-municipales.org.ar/comite-de-presidencia/' },
    { name: 'UBA Odontologia Autoridades', url: 'http://www.odon.uba.ar/sitio/institucional/autoridades.php' },
    { name: 'UBA Farmacia y Bioquimica', url: 'http://www.ffyb.uba.ar/institucional/autoridades/' }
  ];

  for (const item of list) {
    try {
      const res = await fetch(item.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      });
      console.log(`[${item.name}] Status: ${res.status}`);
      if (res.ok) {
        const text = await res.text();
        console.log(`  Length: ${text.length}`);
      }
    } catch (e: any) {
      console.log(`[${item.name}] Error: ${e.message}`);
    }
  }
}

testMore();
