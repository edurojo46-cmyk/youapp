import fetch from 'node-fetch';

async function testMoreOai() {
  const targets = [
    { name: 'CONICET Digital', url: 'https://ri.conicet.gov.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc' },
    { name: 'UNLaM Digital', url: 'http://repositoriocyt.unlam.edu.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc' },
    { name: 'FCEN UBA Digital', url: 'https://bibliotecadigital.exactas.uba.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc' },
    { name: 'SNRD MinCyT', url: 'http://repositoriosdigitales.mincyt.gob.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc' }
  ];

  for (const t of targets) {
    try {
      const t0 = Date.now();
      const res = await fetch(t.url, { timeout: 8000 });
      console.log(`- ${t.name}: status ${res.status} in ${Date.now() - t0}ms`);
    } catch (e) {
      console.log(`- ${t.name}: Error ${e.message}`);
    }
  }
}

testMoreOai().catch(console.error);
