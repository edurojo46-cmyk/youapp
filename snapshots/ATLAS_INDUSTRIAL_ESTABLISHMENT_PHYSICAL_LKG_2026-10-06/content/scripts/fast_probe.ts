import dotenv from 'dotenv';
dotenv.config();
import fetch from 'node-fetch';
import https from 'https';

const agent = new https.Agent({ rejectUnauthorized: false });

const testUrls = [
  // Professional registries
  { name: 'CPAU Matriculados', url: 'https://www.cpau.org/servicios/matricula' },
  { name: 'COFYBCF Farmacéuticos CABA', url: 'https://www.cofybcf.org.ar/autoridades.php' },
  { name: 'CPIC Ingenieros Civiles CABA', url: 'https://cpic.org.ar/' },

  // Education Mass Roster
  { name: 'UBA FCE Profesores', url: 'https://www.economicas.uba.ar/institucional/autoridades/' },
  { name: 'UBA FIUBA Departamentos', url: 'https://fi.uba.ar/institucional/autoridades' },
  { name: 'UBA FFyL Departamentos', url: 'http://filo.uba.ar/autoridades' },
  { name: 'UTN FRBA Autoridades', url: 'https://frba.utn.edu.ar/autoridades/' },
  { name: 'ITBA Profesores', url: 'https://www.itba.edu.ar/institucional/autoridades/' },
  { name: 'UTDT Profesores', url: 'https://www.utdt.edu/profesores' },

  // Health
  { name: 'Hospital Alemán Staff', url: 'https://www.hospitalaleman.org.ar/' },
  { name: 'Hospital Británico Autoridades', url: 'https://www.hospitalbritanico.org.ar/institucional/' },
  { name: 'Fundación Favaloro Staff', url: 'https://www.fundacionfavaloro.org/' },

  // Government / GCBA
  { name: 'GCBA Autoridades', url: 'https://buenosaires.gob.ar/gobierno' },
  { name: 'Poder Judicial CABA', url: 'https://consejo.jusbaires.gob.ar/' },
  { name: 'Defensoría CABA Autoridades', url: 'https://defensoria.org.ar/autoridades/' },

  // Corporate / Law Firm Teams
  { name: 'Marval O\'Farrell Mairal Profesionales', url: 'https://www.marval.com/profesionales' },
  { name: 'Beccar Varela Equipo', url: 'https://beccarvarela.com/equipo/' },
  { name: 'Bruchou & Funes de Rioja', url: 'https://www.bruchoufunesderioja.com/equipo/' },
  { name: 'PAGBAM Profesionales', url: 'https://pagbam.com/es/profesionales/' },

  // Foundations & NGOs
  { name: 'CIPPEC Equipo', url: 'https://www.cippec.org/equipo/' },
  { name: 'CELS Quienes Somos', url: 'https://www.cels.org.ar/web/quienes-somos/' },
  { name: 'Poder Ciudadano', url: 'https://poderciudadano.org/quienes-somos/' },
  { name: 'Fundación Huésped', url: 'https://www.huesped.org.ar/quienes-somos/' },
  { name: 'Cruz Roja Argentina', url: 'https://cruzroja.org.ar/autoridades/' }
];

async function probeOne(item: any) {
  const t0 = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(item.url, {
      agent,
      signal: controller.signal as any,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    clearTimeout(timeoutId);
    const ms = Date.now() - t0;
    console.log(`[${res.status}] ${item.name} (${ms}ms)`);
    return { name: item.name, status: res.status, ok: res.ok, ms, url: item.url };
  } catch (e: any) {
    clearTimeout(timeoutId);
    const ms = Date.now() - t0;
    console.log(`[ERR] ${item.name} (${ms}ms): ${e.message}`);
    return { name: item.name, status: 0, ok: false, ms, url: item.url, err: e.message };
  }
}

async function probeAll() {
  console.log('=== FAST PROBING ALL ENDPOINTS IN PARALLEL ===\n');
  const results = await Promise.all(testUrls.map(u => probeOne(u)));
  const successful = results.filter(r => r.ok);
  console.log(`\nSUCCESSFUL PHYSICAL ENDPOINTS: ${successful.length} / ${results.length}`);
}

probeAll().catch(console.error);
