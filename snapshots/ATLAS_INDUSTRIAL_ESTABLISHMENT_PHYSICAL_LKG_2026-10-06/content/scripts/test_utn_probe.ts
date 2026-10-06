import dotenv from 'dotenv';
dotenv.config();
import https from 'https';

const agent = new https.Agent({ rejectUnauthorized: false });

async function inspectUTNText() {
  const res = await fetch('https://frba.utn.edu.ar/autoridades/', { agent } as any);
  const html = await res.text();
  // Find where Decano or Director or Ing or Lic appears
  const lines = html.split('\n').filter(l => l.includes('Decan') || l.includes('Vicedecan') || l.includes('Secretari') || l.includes('Director'));
  console.log('Lines mentioning authorities:', lines.length);
  console.log('Sample authority lines:');
  for (const l of lines.slice(0, 10)) {
    console.log(' -', l.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  }
}

inspectUTNText().catch(console.error);
