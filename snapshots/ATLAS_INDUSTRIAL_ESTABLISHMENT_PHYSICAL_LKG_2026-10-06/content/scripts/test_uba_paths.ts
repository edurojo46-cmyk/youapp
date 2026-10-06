import fetch from 'node-fetch';

async function testPaths() {
  const urls = [
    'https://www.fmed.uba.ar/la-facultad/autoridades',
    'https://www.fmed.uba.ar/autoridades',
    'https://fi.uba.ar/facultad/autoridades',
    'https://cms.fi.uba.ar/institucional/autoridades',
    'http://filo.uba.ar/autoridades',
    'http://www.filo.uba.ar/institucional/autoridades',
    'https://www.agro.uba.ar/lafacultad/autoridades',
    'https://www.agro.uba.ar/facultad/autoridades',
    'http://www.odontologia.uba.ar/institucional.php',
    'https://www.fvet.uba.ar/institucional/autoridades'
  ];

  for (const u of urls) {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(u, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      clearTimeout(id);
      console.log(`[${res.status}] ${u}`);
    } catch (e: any) {
      console.log(`[ERR] ${u}: ${e.message}`);
    }
  }
}
testPaths();
