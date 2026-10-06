import fetch from 'node-fetch';
import https from 'https';

const agent = new https.Agent({ rejectUnauthorized: false });

async function run() {
  const url = 'https://cdn.buenosaires.gob.ar/datosabiertos/datasets/ministerio-de-economia-y-finanzas/autoridades-superiores-funcionarios/autoridades_superiores_y_funcionarios_2026.csv';
  const res = await fetch(url, { agent, headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 });
  const txt = await res.text();
  const lines = txt.split('\n').filter(l => l.trim().length > 0);
  console.log('Total 2026 lines:', lines.length);

  const ministries: Record<string, number> = {};
  let withEmail = 0;
  let activeCount = 0;

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split('","').map(v => v.replace(/^"|"$/g, '').trim());
    const min = row[0];
    const cargo = row[5];
    const ayn = row[7];
    const estado = row[11];
    const mail = row[14];

    if (estado === 'Activo') activeCount++;
    if (mail && mail.includes('@')) withEmail++;
    ministries[min] = (ministries[min] || 0) + 1;
  }

  console.log('Active count:', activeCount);
  console.log('With email count:', withEmail);
  console.log('\nBreakdown by Ministry / Area:');
  console.table(ministries);
}

run().catch(console.error);
