async function run() {
  // 1. Ferro Carril Oeste
  try {
    const res = await fetch('https://www.ferrocarriloeste.org.ar/institucional/autoridades/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    const html = await res.text();
    console.log('Ferro HTML loaded, length:', html.length);

    // Look for lines or cards containing leadership
    const regex = /<(?:h[2-6]|p|div|li)[^>]*>([\s\S]*?)<\/(?:h[2-6]|p|div|li)>/gi;
    let m;
    const matches: string[] = [];
    while ((m = regex.exec(html)) !== null) {
      const clean = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (
        clean.length > 5 &&
        clean.length < 120 &&
        /(?:Presidente|Vicepresidente|Secretari[oa]|Tesorero|Vocal Titular|Vocal Suplente|Revisor de Cuentas)/i.test(clean)
      ) {
        matches.push(clean);
      }
    }
    console.log('Ferro leadership items found:', matches.length);
    for (const item of matches.slice(0, 15)) {
      console.log(' -', item);
    }
  } catch (e: any) {
    console.error('Error in Ferro parse:', e.message);
  }

  // 2. UBA Psicología
  try {
    const res = await fetch('http://www.psi.uba.ar/institucional.php?var=institucional/autoridades.php', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    const html = await res.text();
    console.log('\nUBA Psicologia HTML loaded, length:', html.length);

    const regex = /<(?:p|li|td|div)[^>]*>([\s\S]*?)<\/(?:p|li|td|div)>/gi;
    let m;
    const psiMatches: string[] = [];
    while ((m = regex.exec(html)) !== null) {
      const clean = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (
        clean.length > 5 &&
        clean.length < 100 &&
        /(?:Decano|Decana|Vicedecano|Vicedecana|Secretario|Secretaria|Subsecretario|Subsecretaria)\s*:/i.test(clean)
      ) {
        psiMatches.push(clean);
      }
    }
    console.log('UBA Psicologia items found:', psiMatches.length);
    for (const item of psiMatches.slice(0, 15)) {
      console.log(' -', item);
    }
  } catch (e: any) {
    console.error('Error in Psi parse:', e.message);
  }
}

run();
