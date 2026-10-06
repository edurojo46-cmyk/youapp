import fetch from 'node-fetch';

async function testOaiShards() {
  console.log('Testing OAI-PMH year shards...');
  const years = [2024, 2023, 2022, 2021, 2020, 2019];
  for (const yr of years) {
    const url = `http://sedici.unlp.edu.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc&from=${yr}-01-01&until=${yr}-12-31`;
    const t0 = Date.now();
    const res = await fetch(url);
    const xml = await res.text();
    const creators = Array.from(xml.matchAll(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/gi));
    const token = xml.match(/<resumptionToken[^>]*>([^<]+)<\/resumptionToken>/i);
    console.log(`- Year ${yr}: ${res.status} in ${Date.now() - t0}ms | Creators: ${creators.length} | Token: ${token ? 'yes' : 'no'}`);
  }
}

testOaiShards().catch(console.error);
