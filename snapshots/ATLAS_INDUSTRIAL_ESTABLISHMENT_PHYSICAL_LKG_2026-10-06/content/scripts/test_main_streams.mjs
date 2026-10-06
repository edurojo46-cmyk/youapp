import fetch from 'node-fetch';

async function testMainStreams() {
  const repos = [
    { name: 'INTA Digital', url: 'https://repositorio.inta.gob.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc' },
    { name: 'UNS Digital', url: 'https://repositoriodigital.uns.edu.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc' },
    { name: 'UNMdP Nulan', url: 'http://nulan.mdp.edu.ar/cgi/oai2?verb=ListRecords&metadataPrefix=oai_dc' }
  ];

  for (const r of repos) {
    let nextUrl = r.url;
    let total = 0;
    for (let page = 1; page <= 3; page++) {
      const res = await fetch(nextUrl);
      const xml = await res.text();
      const creators = Array.from(xml.matchAll(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/gi));
      const tokenMatch = xml.match(/<resumptionToken[^>]*>([^<]+)<\/resumptionToken>/i);
      total += creators.length;
      if (tokenMatch && tokenMatch[1].trim()) {
        const base = r.url.split('?')[0];
        nextUrl = `${base}?verb=ListRecords&resumptionToken=${encodeURIComponent(tokenMatch[1].trim())}`;
      } else {
        break;
      }
    }
    console.log(`${r.name}: 3 pages yielded ${total} authors`);
  }
}

testMainStreams().catch(console.error);
