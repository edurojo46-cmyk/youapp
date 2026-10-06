import fetch from 'node-fetch';

async function inspectHtml() {
  const sites = [
    { name: 'Medicina', url: 'https://www.fmed.uba.ar/la-facultad/autoridades' },
    { name: 'Psicologia', url: 'https://www.psi.uba.ar/institucional.php?var=institucional/autoridades.php' },
    { name: 'FFyB', url: 'https://www.ffyb.uba.ar/institucional/autoridades/' }
  ];

  for (const s of sites) {
    const res = await fetch(s.url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const html = await res.text();
    const clean = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, '\n');
    const lines = clean.split('\n').map(l => l.trim()).filter(l => l.length > 2);
    console.log(`=== ${s.name} (first 30 lines with keywords) ===`);
    const relevant = lines.filter(l => /decan|secretar|director|prof|dr\.|dra\.|lic\./i.test(l));
    console.log(relevant.slice(0, 15));
  }
}

inspectHtml().catch(console.error);
