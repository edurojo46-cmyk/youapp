import fetch from 'node-fetch';

async function testEndpoints() {
  const targets = [
    { name: 'CONICET OAI Identify', url: 'https://ri.conicet.gov.ar/oai/request?verb=Identify' },
    { name: 'CONICET Search', url: 'https://ri.conicet.gov.ar/' },
    { name: 'CPACF Home', url: 'https://www.cpacf.org.ar/' },
    { name: 'CPACF Guia Judicial / Matriculados', url: 'https://www.cpacf.org.ar/guia_matriculados.php' },
    { name: 'CPACF Padron', url: 'https://www.cpacf.org.ar/padron/' },
    { name: 'BOCBA Home', url: 'https://boletinoficial.buenosaires.gob.ar/' },
    { name: 'BOCBA API Ultimo', url: 'https://boletinoficial.buenosaires.gob.ar/normas/ultimas' },
    { name: 'UBA Derecho Autoridades', url: 'http://www.derecho.uba.ar/institucional/autoridades.php' },
    { name: 'UBA FMed Autoridades', url: 'https://www.fmed.uba.ar/autoridades' },
    { name: 'UBA FCE Autoridades', url: 'https://www.economicas.uba.ar/institucional/autoridades/' },
    { name: 'UBA FIUBA Autoridades', url: 'https://www.fi.uba.ar/institucional/autoridades' },
    { name: 'UBA FADU Autoridades', url: 'https://www.fadu.uba.ar/institucional/autoridades' },
    { name: 'UBA Filosofia Autoridades', url: 'http://novedades.filo.uba.ar/autoridades' },
    { name: 'UBA Sociales Autoridades', url: 'https://sociales.uba.ar/institucional/autoridades/' },
    { name: 'UBA Psicologia Autoridades', url: 'https://www.psi.uba.ar/institucional.php?var=institucional/autoridades/index.php' },
    { name: 'UBA Agronomia Autoridades', url: 'https://www.agro.uba.ar/institucional/autoridades' },
    { name: 'UBA Odontologia Autoridades', url: 'http://odontologia.uba.ar/institucional/autoridades/' },
    { name: 'UBA Farmacia Autoridades', url: 'http://www.ffyb.uba.ar/autoridades-1' },
    { name: 'UTN FRBA Autoridades', url: 'https://frba.utn.edu.ar/institucional/autoridades/' },
    { name: 'CPAU Padron', url: 'https://www.cpau.org/guia-de-matriculados' },
    { name: 'CPCECABA Autoridades', url: 'https://www.consejo.org.ar/institucional/autoridades' },
    { name: 'FECOBA Autoridades', url: 'https://fecoba.org.ar/consejo-directivo/' },
    { name: 'CAME Autoridades', url: 'https://www.redcame.org.ar/consejo-directivo' },
    { name: 'CAC Comercio Autoridades', url: 'https://www.cac.com.ar/institucional/autoridades' }
  ];

  console.log('Testing live public endpoints with node-fetch...\n');

  for (const t of targets) {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(t.url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
        }
      });
      clearTimeout(id);
      console.log(`[${res.status}] ${t.name} -> ${t.url} (Content-Type: ${res.headers.get('content-type')})`);
    } catch (err: any) {
      console.log(`[ERR] ${t.name} -> ${err.message}`);
    }
  }
}

testEndpoints();
