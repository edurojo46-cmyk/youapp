import fetch from 'node-fetch';

async function testMore() {
  const urls = [
    'https://fi.uba.ar/institucional/gobierno/autoridades',
    'https://fi.uba.ar/autoridades',
    'https://www.fi.uba.ar/gobierno',
    'https://www.agro.uba.ar/institucional/gobierno',
    'https://www.agro.uba.ar/autoridades',
    'http://www.odontologia.uba.ar/institucional_autoridades.asp',
    'http://www.odontologia.uba.ar/autoridades.html',
    'http://odontologia.uba.ar/',
    'https://www.fvet.uba.ar/lafacultad/autoridades',
    'https://www.fvet.uba.ar/la-facultad/autoridades',
    'https://www.fvet.uba.ar/institucional/gobierno'
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
testMore();
