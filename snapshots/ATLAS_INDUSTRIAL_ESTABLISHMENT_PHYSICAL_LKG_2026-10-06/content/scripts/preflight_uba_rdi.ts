import https from 'https';

const agent = new https.Agent({ rejectUnauthorized: false });

async function probeUbaRdi() {
  console.log('=== FASE B.2: PREFLIGHT FÍSICO UBA REPOSITORIO DIGITAL INSTITUCIONAL (RDI) ===\n');

  const candidateEndpoints = [
    'https://repositoriouba.sisbi.uba.ar/oai/request?verb=Identify',
    'https://repositoriouba.sisbi.uba.ar/oai/request?verb=ListSets',
    'http://repositorio.filo.uba.ar/oai/request?verb=Identify',
    'https://bibliotecadigital.exactas.uba.ar/oai/request?verb=Identify',
    'https://repositorio.sociales.uba.ar/oai/request?verb=Identify',
    'https://repositorio.derecho.uba.ar/oai/request?verb=Identify',
    'https://repositorio.economicas.uba.ar/oai/request?verb=Identify',
    'https://repositorio.psi.uba.ar/oai/request?verb=Identify',
    'https://repositoriouba.sisbi.uba.ar/server/api/core/communities' // DSpace 7 REST API
  ];

  console.log('Testing UBA Institutional Repositories and OAI-PMH / REST interfaces...\n');

  for (const url of candidateEndpoints) {
    const t0 = Date.now();
    try {
      const res = await fetch(url, {
        agent,
        headers: {
          'User-Agent': 'AtlasHarvester/1.0 (https://github.com/edurojo46-cmyk/youapp; contact@youapp.com)'
        },
        signal: AbortSignal.timeout(8000)
      } as any);

      const latency = Date.now() - t0;
      const text = await res.text();
      const isXml = text.includes('<?xml') || text.includes('<OAI-PMH');
      const isJson = text.startsWith('{') || text.startsWith('[');
      const titleMatch = text.match(/<repositoryName>([^<]+)<\/repositoryName>/) || text.match(/<title>([^<]+)<\/title>/);

      console.log(`[${res.status}] ${url}`);
      console.log(`     Latency: ${latency}ms | Type: ${isXml ? 'OAI-PMH XML' : isJson ? 'REST JSON' : 'HTML'}`);
      if (titleMatch) console.log(`     Name: ${titleMatch[1]}`);
      if (isXml && text.includes('<setSpec>')) {
        const sets = text.match(/<setSpec>[^<]+<\/setSpec>/g)?.length || 0;
        console.log(`     Sets identified: ${sets}`);
      }
    } catch (e: any) {
      console.log(`[ERR] ${url}: ${e.message}`);
    }
  }
}

probeUbaRdi().catch(console.error);
