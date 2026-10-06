import fetch from 'node-fetch';

async function probe() {
  console.log('=== PROBING REAL UBA FACULTY DIRECTORIES & SITES ===');
  const ubaUrls = [
    { name: 'UBA Exactas Decanato', url: 'https://exactas.uba.ar/institucional/autoridades/decanato-y-secretarias/' },
    { name: 'UBA Exactas Deptos', url: 'https://exactas.uba.ar/institucional/autoridades/departamentos-docentes/' },
    { name: 'UBA Exactas Institutos', url: 'https://exactas.uba.ar/institucional/autoridades/institutos-de-investigacion/' },
    { name: 'UBA FADU Autoridades', url: 'https://www.fadu.uba.ar/autoridades/' },
    { name: 'UBA Economicas Autoridades', url: 'https://www.economicas.uba.ar/institucional/autoridades/' },
    { name: 'UBA Derecho Autoridades', url: 'http://www.derecho.uba.ar/institucional/autoridades.php' },
    { name: 'UBA Medicina Autoridades', url: 'https://www.fmed.uba.ar/institucional/autoridades' },
    { name: 'UBA Psicologia Autoridades', url: 'https://www.psi.uba.ar/institucional.php?var=institucional/autoridades.php' },
    { name: 'UBA Ingenieria Autoridades', url: 'https://www.fi.uba.ar/institucional/autoridades' },
    { name: 'UBA FFyB Autoridades', url: 'https://www.ffyb.uba.ar/institucional/autoridades/' },
    { name: 'UBA Sociales Autoridades', url: 'https://www.sociales.uba.ar/institucional/autoridades/' },
    { name: 'UBA Filosofia y Letras', url: 'http://novedades.filo.uba.ar/autoridades' },
    { name: 'UBA Agronomia', url: 'https://www.agro.uba.ar/institucional/autoridades' },
    { name: 'UBA Odontologia', url: 'http://odontologia.uba.ar/autoridades.php' },
    { name: 'UBA Veterinaria', url: 'https://www.fvet.uba.ar/institucional/autoridades.php' }
  ];

  for (const item of ubaUrls) {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(item.url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
      });
      clearTimeout(id);
      const text = await res.text();
      console.log(`[${res.status}] ${item.name} (${item.url}) - Length: ${text.length}`);
    } catch (e: any) {
      console.log(`[ERROR] ${item.name} (${item.url}): ${e.message}`);
    }
  }
}

probe().catch(console.error);
