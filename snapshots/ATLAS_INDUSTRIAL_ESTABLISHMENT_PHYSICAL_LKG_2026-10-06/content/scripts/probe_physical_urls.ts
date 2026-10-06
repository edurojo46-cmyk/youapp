import fetch from 'node-fetch';
import https from 'https';

const agent = new https.Agent({ rejectUnauthorized: false });

async function probe() {
  const pages = [
    'https://arzbaires.org.ar/obispos/',
    'https://arzbaires.org.ar/curia/',
    'https://arzbaires.org.ar/parroquias/',
    'https://caritasbsas.org.ar/quienes-somos/',
    'https://daia.org.ar/autoridades/',
    'https://uca.edu.ar/es/autoridades',
    'https://usal.edu.ar/autoridades',
    'https://www.legislatura.gob.ar/diputados.php',
    'https://consejo.jusbaires.gob.ar/institucional/integrantes',
    'https://defensoria.org.ar/institucional/autoridades/',
    'https://www.garrahan.gov.ar/autoridades-garrahan/institucional/autoridades',
    'https://www.derecho.uba.ar/institucional/autoridades.php',
    'https://exactas.uba.ar/institucional/autoridades/',
    'https://utn.ba/institucional/autoridades/'
  ];

  for (const p of pages) {
    try {
      const res = await fetch(p, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        agent,
        timeout: 8000
      });
      const text = await res.text();
      console.log(`STATUS ${res.status} [${text.length} bytes] -> ${p}`);
    } catch (e: any) {
      console.log(`ERROR: ${p} -> ${e.message}`);
    }
  }
}

probe();
