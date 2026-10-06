import https from 'https';

const agent = new https.Agent({ rejectUnauthorized: false });

async function inspectUbaEndpoints() {
  console.log('Inspecting UBA SISBI and Exactas endpoints...');

  const urls = [
    'https://repositoriouba.sisbi.uba.ar/',
    'https://bibliotecadigital.exactas.uba.ar/oai/request?verb=ListSets',
    'https://bibliotecadigital.exactas.uba.ar/oai/request?verb=ListMetadataFormats',
    'http://repositorio.filo.uba.ar/oai/snrd?verb=Identify',
    'http://repositorio.filo.uba.ar/oai/driver?verb=Identify',
    'http://repositorio.filo.uba.ar/'
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        agent,
        headers: { 'User-Agent': 'AtlasHarvester/1.0' },
        signal: AbortSignal.timeout(8000)
      } as any);

      const text = await res.text();
      console.log(`\nURL: ${url}`);
      console.log(`Status: ${res.status}`);
      console.log(`Length: ${text.length} bytes`);
      console.log(`Snippet: ${text.slice(0, 400).replace(/\s+/g, ' ')}`);
    } catch (e: any) {
      console.log(`\nURL: ${url} -> ERROR: ${e.message}`);
    }
  }
}

inspectUbaEndpoints().catch(console.error);
