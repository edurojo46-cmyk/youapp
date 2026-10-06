import fetch from 'node-fetch';

async function testSetQuery() {
  const sets = ['com_10915_2', 'com_10915_22', 'com_10915_7', 'com_20.500.12123_171', 'com_123456789_7307'];
  for (const s of sets) {
    const url = `http://sedici.unlp.edu.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc&set=${encodeURIComponent(s)}`;
    const t0 = Date.now();
    const res = await fetch(url);
    const xml = await res.text();
    const creators = Array.from(xml.matchAll(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/gi));
    const token = xml.match(/<resumptionToken[^>]*>([^<]+)<\/resumptionToken>/i);
    console.log(`Set ${s}: ${res.status} in ${Date.now() - t0}ms | Creators: ${creators.length} | Next Token: ${token ? 'yes' : 'no'}`);
  }
}

testSetQuery().catch(console.error);
