import dotenv from 'dotenv';
dotenv.config();
import https from 'https';

const agent = new https.Agent({ rejectUnauthorized: false });

async function checkHospitalesPublicos() {
  console.log('Fetching https://buenosaires.gob.ar/salud/hospitales...');
  const res = await fetch('https://buenosaires.gob.ar/salud/hospitales', { agent } as any);
  console.log('Status:', res.status);
  const html = await res.text();
  console.log('HTML Length:', html.length);

  // Extract all hrefs
  const linkMatches = html.match(/href="([^"]+)"/g) || [];
  const hrefs = linkMatches.map(m => m.replace(/^href="|"$"/g, ''));
  console.log('Total hrefs found:', hrefs.length);

  const hospHrefs = hrefs.filter(h => h.includes('hospital') || h.includes('durand') || h.includes('argerich') || h.includes('fernandez'));
  console.log('Hospital hrefs found:', hospHrefs.length);
  console.log('Sample hospital hrefs:', hospHrefs.slice(0, 10));
}

checkHospitalesPublicos().catch(console.error);
