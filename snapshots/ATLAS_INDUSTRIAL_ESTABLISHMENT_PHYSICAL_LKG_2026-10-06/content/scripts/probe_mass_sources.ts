import fetch from 'node-fetch';

async function main() {
  console.log('=== PROBING MASS SOURCES PHYSICALLY ===\n');

  // 1. CPACF Home Inspection
  console.log('--- 1. CPACF ---');
  try {
    const res = await fetch('https://www.cpacf.org.ar/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    const html = await res.text();
    console.log('CPACF Home length:', html.length);
    // Find all links containing keywords
    const linkMatches = html.match(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi) || [];
    const relevantLinks = linkMatches.filter(l => /matricul|guia|padron|autoridad|abogad|buscador|consulta/i.test(l));
    console.log(`CPACF relevant links (${relevantLinks.length}):`);
    relevantLinks.slice(0, 10).forEach(l => console.log('  ', l.replace(/<[^>]+>/g, ' ').trim(), '->', l.match(/href=["']([^"']+)["']/i)?.[1]));
  } catch (e: any) {
    console.log('CPACF error:', e.message);
  }

  // 2. CONICET OAI ListSets and ListIdentifiers
  console.log('\n--- 2. CONICET OAI-PMH ---');
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 6000);
    const setsRes = await fetch('https://ri.conicet.gov.ar/oai/request?verb=ListSets', {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    clearTimeout(id);
    const xml = await setsRes.text();
    console.log('CONICET ListSets status:', setsRes.status, 'xml length:', xml.length);
    const setSpecs = xml.match(/<setSpec>([^<]+)<\/setSpec>/g)?.slice(0, 8);
    console.log('CONICET Sample Sets:', setSpecs);
  } catch (e: any) {
    console.log('CONICET OAI error:', e.message);
  }

  // 3. BOCBA (Boletín Oficial CABA)
  console.log('\n--- 3. BOCBA ---');
  try {
    const res = await fetch('https://boletinoficial.buenosaires.gob.ar/', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const html = await res.text();
    console.log('BOCBA Home status:', res.status, 'length:', html.length);
    const scripts = html.match(/<script[^>]*src=["']([^"']+)["']/gi) || [];
    console.log('BOCBA Scripts found:', scripts.slice(0, 5));
    // Check if there are API endpoints mentioned in html
    const apiMatches = html.match(/https?:\/\/[^"'\s]+\/api\/[^"'\s]+/gi) || [];
    console.log('BOCBA API endpoints in HTML:', apiMatches.slice(0, 5));
  } catch (e: any) {
    console.log('BOCBA error:', e.message);
  }

  // 4. UBA Faculties Live Extraction Tests
  console.log('\n--- 4. UBA FACULTIES ---');
  const ubaFaculties = [
    { name: 'Derecho', url: 'http://www.derecho.uba.ar/institucional/autoridades.php' },
    { name: 'Económicas', url: 'https://www.economicas.uba.ar/institucional/autoridades/' },
    { name: 'FADU', url: 'https://www.fadu.uba.ar/institucional/autoridades' },
    { name: 'Psicología', url: 'https://www.psi.uba.ar/institucional.php?var=institucional/autoridades/index.php' }
  ];

  for (const f of ubaFaculties) {
    try {
      const res = await fetch(f.url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const html = await res.text();
      console.log(`UBA ${f.name} (${res.status}): length ${html.length}`);
      // Clean html
      const plain = html.replace(/<script[\s\S]*?<\/script>/gi, '')
                        .replace(/<style[\s\S]*?<\/style>/gi, '')
                        .replace(/<[^>]+>/g, '\n')
                        .replace(/[ \t]+/g, ' ')
                        .replace(/\n\s*\n/g, '\n');
      const lines = plain.split('\n').map(l => l.trim()).filter(l => l.length > 2);
      const sampleAuthorities = lines.filter(l => /decano|vicedecan|secretari|director/i.test(l)).slice(0, 6);
      console.log(`  Sample roles/names for ${f.name}:`, sampleAuthorities);
    } catch (e: any) {
      console.log(`UBA ${f.name} error:`, e.message);
    }
  }
}

main().catch(console.error);
