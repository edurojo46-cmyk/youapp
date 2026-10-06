import dotenv from 'dotenv';
dotenv.config();
import https from 'https';

const agent = new https.Agent({ rejectUnauthorized: false });

async function inspectJusbairesAndDefensoria() {
  // 1. Consejo de la Magistratura CABA
  console.log('--- Consejo de la Magistratura CABA ---');
  const res1 = await fetch('https://consejo.jusbaires.gob.ar/autoridades/', {
    agent,
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
  } as any);
  if (res1.ok) {
    const html1 = await res1.text();
    const lines1 = html1.split('\n').filter(l => l.includes('Consejer') || l.includes('President') || l.includes('Dr.') || l.includes('Dra.'));
    console.log('CM CABA lines:', lines1.length);
    for (const l of lines1.slice(0, 10)) {
      console.log(' *', l.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    }
  }

  // 2. Defensoría del Pueblo de la CABA
  console.log('\n--- Defensoría del Pueblo de la CABA ---');
  const res2 = await fetch('https://defensoria.org.ar/institucional/autoridades/', {
    agent,
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
  } as any);
  if (res2.ok) {
    const html2 = await res2.text();
    const lines2 = html2.split('\n').filter(l => l.includes('Defensor') || l.includes('Secretari') || l.includes('Director') || l.includes('Lic.') || l.includes('Dr.'));
    console.log('Defensoría lines:', lines2.length);
    for (const l of lines2.slice(0, 10)) {
      console.log(' *', l.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    }
  }
}

inspectJusbairesAndDefensoria().catch(console.error);
