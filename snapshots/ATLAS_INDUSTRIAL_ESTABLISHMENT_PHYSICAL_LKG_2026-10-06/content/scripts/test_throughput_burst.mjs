import fetch from 'node-fetch';
import crypto from 'crypto';

async function testThroughputBurst() {
  const streams = [
    { id: 'INTA_1', url: 'https://repositorio.inta.gob.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc', delay: 100 },
    { id: 'INTA_2', url: 'https://repositorio.inta.gob.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc&from=2022-01-01', delay: 100 },
    { id: 'INTA_3', url: 'https://repositorio.inta.gob.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc&from=2019-01-01&until=2021-12-31', delay: 100 },
    { id: 'INTA_4', url: 'https://repositorio.inta.gob.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc&from=2016-01-01&until=2018-12-31', delay: 100 },
    { id: 'UNS_1', url: 'https://repositoriodigital.uns.edu.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc', delay: 100 },
    { id: 'UNS_2', url: 'https://repositoriodigital.uns.edu.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc&from=2022-01-01', delay: 100 },
    { id: 'UNS_3', url: 'https://repositoriodigital.uns.edu.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc&from=2019-01-01&until=2021-12-31', delay: 100 },
    { id: 'UNMDP_1', url: 'http://nulan.mdp.edu.ar/cgi/oai2?verb=ListRecords&metadataPrefix=oai_dc', delay: 100 },
    { id: 'UNMDP_2', url: 'http://nulan.mdp.edu.ar/cgi/oai2?verb=ListRecords&metadataPrefix=oai_dc&from=2020-01-01', delay: 100 },
    { id: 'SEDICI_ING', url: 'http://sedici.unlp.edu.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc&set=com_10915_2', delay: 250 },
    { id: 'SEDICI_EXA', url: 'http://sedici.unlp.edu.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc&set=com_10915_22', delay: 250 },
    { id: 'SEDICI_AGR', url: 'http://sedici.unlp.edu.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc&set=com_10915_10', delay: 250 },
    { id: 'SEDICI_ODO', url: 'http://sedici.unlp.edu.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc&set=com_10915_20', delay: 250 },
    { id: 'SEDICI_ARQ', url: 'http://sedici.unlp.edu.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc&set=com_10915_25', delay: 250 },
    { id: 'SEDICI_AST', url: 'http://sedici.unlp.edu.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc&set=com_10915_15', delay: 250 },
    { id: 'SEDICI_HUM', url: 'http://sedici.unlp.edu.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc&set=com_10915_30', delay: 250 },
    { id: 'SEDICI_VET', url: 'http://sedici.unlp.edu.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc&set=com_10915_5', delay: 250 }
  ];

  let totalExtracted = 0;
  let running = true;
  const t0 = Date.now();

  const workerPromises = streams.map(async (s) => {
    let nextUrl = s.url;
    while (running) {
      try {
        const res = await fetch(nextUrl);
        if (res.status === 429) {
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }
        if (!res.ok) break;
        const xml = await res.text();
        const creators = Array.from(xml.matchAll(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/gi));
        const tokenMatch = xml.match(/<resumptionToken[^>]*>([^<]+)<\/resumptionToken>/i);
        totalExtracted += creators.length;
        if (tokenMatch && tokenMatch[1].trim()) {
          const base = s.url.split('?')[0];
          nextUrl = `${base}?verb=ListRecords&resumptionToken=${encodeURIComponent(tokenMatch[1].trim())}`;
        } else {
          break;
        }
      } catch {
        break;
      }
      await new Promise(r => setTimeout(r, s.delay));
    }
  });

  // Run for 8 seconds
  await new Promise(r => setTimeout(r, 8000));
  running = false;
  await Promise.all(workerPromises);

  const durationSec = (Date.now() - t0) / 1000;
  console.log(`\nResults: ${totalExtracted} candidates extracted in ${durationSec.toFixed(1)}s`);
  console.log(`Throughput: ${(totalExtracted / durationSec).toFixed(1)} candidates / sec`);
}

testThroughputBurst().catch(console.error);
