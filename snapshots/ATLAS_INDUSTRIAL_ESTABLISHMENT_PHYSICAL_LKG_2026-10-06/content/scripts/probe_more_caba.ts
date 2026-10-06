import fetch from 'node-fetch';
import https from 'https';

const agent = new https.Agent({ rejectUnauthorized: false });

async function probeMore() {
  const list = [
    'https://www.ffyb.uba.ar/institucional/autoridades/',
    'https://filo.uba.ar/autoridades',
    'https://www.sociales.uba.ar/institucional/autoridades/',
    'https://itba.edu.ar/',
    'https://www.utdt.edu/',
    'https://bancariabancario.com.ar/',
    'https://suterh.org.ar/',
    'https://atecapital.org/'
  ];

  for (const u of list) {
    try {
      const res = await fetch(u, { agent, headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 7000 });
      console.log(`STATUS ${res.status} -> ${u}`);
    } catch (e: any) {
      console.log(`ERROR ${u} -> ${e.message}`);
    }
  }
}

probeMore();
