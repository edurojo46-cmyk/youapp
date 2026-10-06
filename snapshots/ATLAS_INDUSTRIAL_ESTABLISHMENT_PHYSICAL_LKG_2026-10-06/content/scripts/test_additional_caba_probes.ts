import dotenv from 'dotenv';
dotenv.config();
import https from 'https';

const agent = new https.Agent({ rejectUnauthorized: false });

async function probeAdditional() {
  const targets = [
    { id: 'HOSPITAL_ALEMAN', url: 'https://www.hospitalaleman.org.ar/cuerpo-medico/' },
    { id: 'HOSPITAL_BRITANICO', url: 'https://www.hospitalbritanico.org.ar/cuerpo-medico/' },
    { id: 'CONSEJO_MAGISTRATURA_CABA', url: 'https://consejo.jusbaires.gob.ar/autoridades/' },
    { id: 'DEFENSORIA_CABA', url: 'https://defensoria.org.ar/institucional/autoridades/' },
    { id: 'MPD_CABA', url: 'https://www.mpdefensa.gob.ar/institucional/autoridades' },
    { id: 'MPT_CABA', url: 'https://mptutelar.gob.ar/institucional/autoridades' }
  ];

  console.log('Probing additional candidate surfaces...');
  for (const t of targets) {
    try {
      const res = await fetch(t.url, {
        agent,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      } as any);
      console.log(`[${t.id}] Status: ${res.status} (Length: ${res.ok ? (await res.text()).length : 0})`);
    } catch (e: any) {
      console.log(`[${t.id}] Error: ${e.message}`);
    }
  }
}

probeAdditional().catch(console.error);
