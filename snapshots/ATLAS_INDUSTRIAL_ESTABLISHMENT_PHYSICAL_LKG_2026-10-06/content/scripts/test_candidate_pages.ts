async function testFetch(name: string, url: string) {
  console.log(`\nTesting fetch for ${name}: ${url}`);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    console.log(`Status: ${res.status}`);
    if (res.ok) {
      const text = await res.text();
      console.log(`Length: ${text.length} chars`);
      // Check for common authority patterns
      const hasPres = text.toLowerCase().includes('presidente') || text.toLowerCase().includes('director') || text.toLowerCase().includes('secretario');
      console.log(`Has leadership terms: ${hasPres}`);
    }
  } catch (e: any) {
    console.error(`Error fetching ${url}:`, e.message);
  }
}

async function run() {
  await testFetch('Club Ferro Carril Oeste', 'https://www.ferrocarriloeste.org.ar/institucional/autoridades/');
  await testFetch('UTE CTERA', 'https://ute.org.ar/secretariado/');
  await testFetch('UBA Psicología Autoridades', 'http://www.psi.uba.ar/institucional.php?var=institucional/autoridades.php');
  await testFetch('UBA Medicina Autoridades', 'https://www.fmed.uba.ar/facultad/autoridades');
}

run();
