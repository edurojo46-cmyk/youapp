import fetch from 'node-fetch';

async function testFleet() {
  const streams = [
    // SEDICI Faculties
    { name: 'SEDICI Ingeniería', url: 'http://sedici.unlp.edu.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc&set=com_10915_2' },
    { name: 'SEDICI Exactas', url: 'http://sedici.unlp.edu.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc&set=com_10915_22' },
    { name: 'SEDICI Veterinarias', url: 'http://sedici.unlp.edu.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc&set=com_10915_5' },
    { name: 'SEDICI Agronomía', url: 'http://sedici.unlp.edu.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc&set=com_10915_10' },
    { name: 'SEDICI Astronomía', url: 'http://sedici.unlp.edu.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc&set=com_10915_15' },
    { name: 'SEDICI Odontología', url: 'http://sedici.unlp.edu.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc&set=com_10915_20' },
    { name: 'SEDICI Arquitectura', url: 'http://sedici.unlp.edu.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc&set=com_10915_25' },
    { name: 'SEDICI Humanidades', url: 'http://sedici.unlp.edu.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc&set=com_10915_30' },
    { name: 'SEDICI Medicina', url: 'http://sedici.unlp.edu.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc&set=com_10915_39' },
    { name: 'SEDICI Naturales', url: 'http://sedici.unlp.edu.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc&set=com_10915_42' },
    // SEDICI Date Ranges
    { name: 'SEDICI 2023-2024', url: 'http://sedici.unlp.edu.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc&from=2023-01-01' },
    { name: 'SEDICI 2021-2022', url: 'http://sedici.unlp.edu.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc&from=2021-01-01&until=2022-12-31' },
    { name: 'SEDICI 2019-2020', url: 'http://sedici.unlp.edu.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc&from=2019-01-01&until=2020-12-31' },
    { name: 'SEDICI Main', url: 'http://sedici.unlp.edu.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc' },
    // INTA
    { name: 'INTA 2022-2024', url: 'https://repositorio.inta.gob.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc&from=2022-01-01' },
    { name: 'INTA 2019-2021', url: 'https://repositorio.inta.gob.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc&from=2019-01-01&until=2021-12-31' },
    { name: 'INTA Main', url: 'https://repositorio.inta.gob.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc' },
    // UNS
    { name: 'UNS 2022-2024', url: 'https://repositoriodigital.uns.edu.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc&from=2022-01-01' },
    { name: 'UNS Main', url: 'https://repositoriodigital.uns.edu.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc' },
    // UNMdP Nulan
    { name: 'UNMdP Main', url: 'http://nulan.mdp.edu.ar/cgi/oai2?verb=ListRecords&metadataPrefix=oai_dc' }
  ];

  console.log(`Testing ${streams.length} candidate streams...`);
  for (const s of streams) {
    try {
      const t0 = Date.now();
      const res = await fetch(s.url);
      const xml = await res.text();
      const creators = Array.from(xml.matchAll(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/gi));
      const token = xml.match(/<resumptionToken[^>]*>([^<]+)<\/resumptionToken>/i);
      console.log(`- ${s.name}: ${res.status} in ${Date.now() - t0}ms | Creators: ${creators.length} | Token: ${token ? 'yes' : 'no'}`);
    } catch (e) {
      console.log(`- ${s.name}: Error ${e.message}`);
    }
  }
}

testFleet().catch(console.error);
