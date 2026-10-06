import https from 'https';
import http from 'http';

const candidateEndpoints = [
  // 1. Municipalities & Portals
  { id: 'BA_DATOS_MUNICIPAL', name: 'Buenos Aires Data — Portal Oficial CABA', url: 'https://data.buenosaires.gob.ar/api/3/action/package_search?q=funcionarios' },
  { id: 'BA_DATOS_SALUD', name: 'Buenos Aires Data — Profesionales de Salud CABA', url: 'https://data.buenosaires.gob.ar/api/3/action/package_search?q=salud' },
  { id: 'BA_DATOS_DOCENTES', name: 'Buenos Aires Data — Docentes y Autoridades Educativas CABA', url: 'https://data.buenosaires.gob.ar/api/3/action/package_search?q=educacion' },
  { id: 'DATOS_PBA_PROVINCIA', name: 'Datos Abiertos Provincia de Buenos Aires', url: 'https://catalogo.datos.gba.gob.ar/api/3/action/package_search?q=personal' },
  { id: 'DATOS_GOB_AR_PBA', name: 'Datos.gob.ar — Organismos Provinciales PBA', url: 'https://datos.gob.ar/api/3/action/package_search?q=buenos+aires' },
  
  // 2. Universidades Nacionales en Conurbano PBA y La Plata (DSpace OAI-PMH & REST)
  { id: 'UNLP_NATURALES', name: 'SEDICI UNLP — Cs. Naturales y Museo (PBA)', url: 'http://sedici.unlp.edu.ar/oai/request?verb=Identify' },
  { id: 'UNLP_HUMANIDADES', name: 'SEDICI UNLP — Humanidades y Cs. de la Educación (PBA)', url: 'http://sedici.unlp.edu.ar/oai/request?verb=ListSets' },
  { id: 'UNSAM_REST', name: 'UNSAM Digital — OAI Identify', url: 'https://ri.unsam.edu.ar/oai/request?verb=Identify' },
  { id: 'UNQ_REST', name: 'UNQ Digital — OAI Identify', url: 'https://ridaa.unq.edu.ar/oai/request?verb=Identify' },
  { id: 'CIC_PBA_SETS', name: 'CIC Digital PBA — OAI ListSets', url: 'https://digital.cic.gba.gob.ar/oai/request?verb=Identify' },
  { id: 'INTA_DIGITAL_OAI', name: 'INTA Digital Castelar PBA — OAI Identify', url: 'https://repositorio.inta.gob.ar/oai/request?verb=Identify' },
  
  // 3. Organismos Científicos, Culturales y Colegios en CABA / PBA
  { id: 'BNM_MEDAR', name: 'Biblioteca Nacional de Maestros — CABA / PBA', url: 'http://www.bnm.me.gov.ar' },
  { id: 'CONICET_CABA_NORTE', name: 'CONICET CCT CABA Norte', url: 'https://ri.conicet.gov.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc&set=com_11336_277925' },
  { id: 'CONICET_CABA_SUR', name: 'CONICET CCT CABA Sur', url: 'https://ri.conicet.gov.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc&set=com_11336_277926' },
  { id: 'CONICET_CCT_LAPLATA', name: 'CONICET CCT La Plata (PBA)', url: 'https://ri.conicet.gov.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc&set=com_11336_169' },
  { id: 'CONICET_CCT_MDP', name: 'CONICET CCT Mar del Plata (PBA)', url: 'https://ri.conicet.gov.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc&set=com_11336_184' },
  { id: 'CONICET_CCT_BBLANCA', name: 'CONICET CCT Bahía Blanca (PBA)', url: 'https://ri.conicet.gov.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc&set=com_11336_73' },

  // 4. Wikidata Professional Universes (SPARQL)
  { id: 'WD_ARG_PHYSICIANS', name: 'Wikidata — Médicos y Profesionales de la Salud CABA/PBA', url: 'https://query.wikidata.org/sparql?query=' + encodeURIComponent('SELECT (COUNT(?item) AS ?count) WHERE { ?item wdt:P106/wdt:P279* wd:Q39631; wdt:P27 wd:Q414 . }') },
  { id: 'WD_ARG_LAWYERS', name: 'Wikidata — Abogados y Juristas CABA/PBA', url: 'https://query.wikidata.org/sparql?query=' + encodeURIComponent('SELECT (COUNT(?item) AS ?count) WHERE { ?item wdt:P106/wdt:P279* wd:Q40348; wdt:P27 wd:Q414 . }') },
  { id: 'WD_ARG_ARCHITECTS', name: 'Wikidata — Arquitectos e Ingenieros CABA/PBA', url: 'https://query.wikidata.org/sparql?query=' + encodeURIComponent('SELECT (COUNT(?item) AS ?count) WHERE { ?item wdt:P106/wdt:P279* wd:Q42973; wdt:P27 wd:Q414 . }') },
  { id: 'WD_ARG_WRITERS_ARTISTS', name: 'Wikidata — Escritores, Periodistas y Artistas CABA/PBA', url: 'https://query.wikidata.org/sparql?query=' + encodeURIComponent('SELECT (COUNT(?item) AS ?count) WHERE { ?item wdt:P106/wdt:P279* wd:Q36180; wdt:P27 wd:Q414 . }') },
  { id: 'WD_ARG_ATHLETES', name: 'Wikidata — Deportistas y Directores Técnicos CABA/PBA', url: 'https://query.wikidata.org/sparql?query=' + encodeURIComponent('SELECT (COUNT(?item) AS ?count) WHERE { ?item wdt:P106/wdt:P279* wd:Q2066131; wdt:P27 wd:Q414 . }') },
  { id: 'WD_ARG_ACADEMICS', name: 'Wikidata — Investigadores y Docentes Universitarios CABA/PBA', url: 'https://query.wikidata.org/sparql?query=' + encodeURIComponent('SELECT (COUNT(?item) AS ?count) WHERE { ?item wdt:P106/wdt:P279* wd:Q1650915; wdt:P27 wd:Q414 . }') }
];

async function probe(cand) {
  return new Promise((resolve) => {
    try {
      const u = new URL(cand.url);
      const isHttps = u.protocol === 'https:';
      const client = isHttps ? https : http;
      const start = Date.now();
      const req = client.get(cand.url, {
        headers: {
          'User-Agent': 'Atlas-Universe-Scout/2.0 (Contact: eduardo@youapp.tv)',
          'Accept': 'application/json, application/xml, text/xml, */*'
        },
        timeout: 8000
      }, (res) => {
        let raw = '';
        res.on('data', c => { if (raw.length < 1024) raw += c; });
        res.on('end', () => {
          resolve({
            id: cand.id,
            name: cand.name,
            status: res.statusCode,
            latency_ms: Date.now() - start,
            pass: res.statusCode >= 200 && res.statusCode < 400,
            snippet: raw.slice(0, 120).replace(/\s+/g, ' ')
          });
        });
      });
      req.on('error', (err) => resolve({ id: cand.id, name: cand.name, pass: false, error: err.message }));
      req.on('timeout', () => { req.destroy(); resolve({ id: cand.id, name: cand.name, pass: false, error: 'TIMEOUT' }); });
    } catch (e) {
      resolve({ id: cand.id, name: cand.name, pass: false, error: e.message });
    }
  });
}

async function main() {
  console.log('=== SCOUTING NEW CABA / PBA POPULATION UNIVERSES ===\n');
  const results = [];
  for (const c of candidateEndpoints) {
    const res = await probe(c);
    results.push(res);
    console.log(`${res.pass ? '✓ PASS' : '✗ FAIL'} [${res.status || res.error}] ${res.name} (${res.latency_ms || 0}ms)`);
  }

  console.log('\n--- SUMMARY ---');
  console.table(results.map(r => ({
    id: r.id,
    pass: r.pass,
    status: r.status || r.error,
    latency: r.latency_ms
  })));
}

main().catch(console.error);
