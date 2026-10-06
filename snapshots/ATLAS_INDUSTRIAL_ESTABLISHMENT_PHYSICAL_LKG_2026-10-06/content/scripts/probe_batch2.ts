import fetch from 'node-fetch';
import https from 'https';

const agent = new https.Agent({ rejectUnauthorized: false });

async function probeBatch2() {
  const urls = [
    'https://www.derecho.uba.ar/institucional/autoridades.php',
    'https://frba.utn.edu.ar/',
    'https://www.cpacf.org.ar/autoridades',
    'https://www.cpau.org/institucional/autoridades',
    'https://www.consejo.org.ar/institucional/autoridades', // CPCECABA
    'https://buenosaires.gob.ar/salud/organizacion'
  ];

  for (const u of urls) {
    try {
      const res = await fetch(u, {
        agent,
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 8000
      });
      console.log(`STATUS ${res.status} -> ${u}`);
    } catch (e: any) {
      console.log(`ERROR ${u} -> ${e.message}`);
    }
  }
}

probeBatch2();
