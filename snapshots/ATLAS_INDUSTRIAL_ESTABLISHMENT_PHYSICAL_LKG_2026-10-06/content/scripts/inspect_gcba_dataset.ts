import fetch from 'node-fetch';
import https from 'https';

const agent = new https.Agent({ rejectUnauthorized: false });

async function run() {
  const url = 'https://cdn.buenosaires.gob.ar/datosabiertos/datasets/ministerio-de-economia-y-finanzas/autoridades-superiores-funcionarios/autoridades_superiores_y_funcionarios_2024.csv';
  const res = await fetch(url, { agent, headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 });
  const text = await res.text();
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  console.log('Total raw lines in CSV:', lines.length);

  const people = new Map<string, any>();
  for (let i = 1; i < lines.length; i++) {
    // Parse CSV row accounting for quotes
    const row = lines[i].split('","').map(v => v.replace(/^"|"$/g, '').trim());
    const ministerio = row[0];
    const rep = row[1];
    const cargo = row[5];
    const ayn = row[7]; // Apellido y Nombre
    const estado = row[11];
    const mail = row[14];

    if (ayn && ayn.length > 3 && estado === 'Activo') {
      const parts = ayn.split(' ');
      // Usually "Apellido Nombre" -> format to "Nombre Apellido"
      const formatted = parts.length > 1 ? parts.slice(1).join(' ') + ' ' + parts[0] : ayn;
      const key = ayn.toLowerCase();
      if (!people.has(key)) {
        people.set(key, {
          rawName: ayn,
          displayName: formatted,
          role: cargo,
          organization: `${rep} — ${ministerio}`,
          locationEvidence: `Funcionario público activo en ${rep} (${ministerio}), Gobierno de la Ciudad Autónoma de Buenos Aires.`,
          publicEmail: mail && mail.includes('@') ? mail.replace('!', '') : null,
          sourceUrl: url
        });
      }
    }
  }

  console.log('ACTIVE UNIQUE GCBA OFFICIALS:', people.size);
  const sample = Array.from(people.values()).slice(0, 5);
  console.log('Sample officials:', JSON.stringify(sample, null, 2));
}

run().catch(console.error);
