import fetch from 'node-fetch';

async function testFetch(url: string, label: string) {
  console.log(`\n--- Fetching [${label}]: ${url} ---`);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      timeout: 10000
    });
    console.log(`Status: ${res.status} ${res.statusText}`);
    const text = await res.text();
    console.log(`HTML Length: ${text.length}`);
    return { ok: res.ok, status: res.status, text };
  } catch (err: any) {
    console.error(`Fetch error on ${url}:`, err.message);
    return { ok: false, status: 0, text: '' };
  }
}

async function runTests() {
  // Test 1: UBA exactas / dc
  await testFetch('https://exactas.uba.ar/institucional/autoridades/', 'UBA Exactas Autoridades');
  
  // Test 2: UBA Medicina
  await testFetch('https://www.fmed.uba.ar/facultad/autoridades', 'UBA FMed Autoridades');

  // Test 3: GCBA Comuna 6
  await testFetch('https://buenosaires.gob.ar/comuna-6', 'GCBA Comuna 6');

  // Test 4: CPAU Autoridades
  await testFetch('https://www.cpau.org/institucional/consejo-directivo', 'CPAU Consejo Directivo');

  // Test 5: FECOBA
  await testFetch('https://fecoba.org.ar/autoridades-del-consejo-directivo/', 'FECOBA Consejo Directivo');

  // Test 6: CAME
  await testFetch('https://www.redcame.org.ar/institucional/consejo-directivo', 'CAME Consejo Directivo');

  // Test 7: Hospital Durand
  await testFetch('https://buenosaires.gob.ar/salud/hospital-durand', 'Hospital Durand');
}

runTests().catch(console.error);
