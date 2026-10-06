import fetch from 'node-fetch';
import https from 'https';

const agent = new https.Agent({ rejectUnauthorized: false });

async function run() {
  for (const year of ['2023', '2024', '2025', '2026']) {
    const url = `https://cdn.buenosaires.gob.ar/datosabiertos/datasets/ministerio-de-economia-y-finanzas/autoridades-superiores-funcionarios/autoridades_superiores_y_funcionarios_${year}.csv`;
    try {
      const res = await fetch(url, { agent, headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 8000 });
      console.log(year, 'Status:', res.status);
      if (res.ok) {
        const txt = await res.text();
        console.log(year, 'lines:', txt.split('\n').length);
      }
    } catch (e: any) {
      console.log(year, 'Error:', e.message);
    }
  }
}

run().catch(console.error);
