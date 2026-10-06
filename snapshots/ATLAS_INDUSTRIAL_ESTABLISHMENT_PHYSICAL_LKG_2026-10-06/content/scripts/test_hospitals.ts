import fetch from 'node-fetch';

async function testHospitals() {
  const hospitals = [
    'hospital-durand',
    'hospital-fernandez',
    'hospital-argerich',
    'hospital-alvarez',
    'hospital-gutierrez',
    'hospital-pirovano'
  ];

  for (const h of hospitals) {
    const url = `https://buenosaires.gob.ar/salud/${h}`;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const html = await res.text();
      console.log(`\n[${h}] Status: ${res.status}, Length: ${html.length}`);
      // Find occurrences of Director or Autoridad or Jefe
      const matches = html.match(/<(?:p|div|h[2-5]|span)[^>]*>([\s\S]*?)<\/(?:p|div|h[2-5]|span)>/gi) || [];
      const dirLines = [];
      for (const m of matches) {
        const clean = m.replace(/<[^>]+>/g, '').trim();
        if (/Director|Directora|Subdirector|Subdirectora|Jefe de/i.test(clean) && clean.length < 150) {
          dirLines.push(clean);
        }
      }
      console.log(`Found ${dirLines.length} director/chief lines in ${h}:`);
      for (const d of dirLines.slice(0, 5)) {
        console.log(`  - ${d}`);
      }
    } catch (e: any) {
      console.error(`Error on ${h}:`, e.message);
    }
  }
}

testHospitals().catch(console.error);
