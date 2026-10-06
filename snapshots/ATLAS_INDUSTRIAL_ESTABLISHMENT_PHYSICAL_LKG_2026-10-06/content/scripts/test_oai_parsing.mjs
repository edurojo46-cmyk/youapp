import fetch from 'node-fetch';

async function testOaiParsing() {
  console.log('Testing OAI-PMH XML parsing yield...');
  const res = await fetch('http://sedici.unlp.edu.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc');
  const xml = await res.text();
  console.log(`XML length: ${xml.length}`);

  // Regex extract dc:creator and dc:contributor
  const creatorMatches = Array.from(xml.matchAll(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/gi));
  const contributorMatches = Array.from(xml.matchAll(/<dc:contributor[^>]*>([^<]+)<\/dc:contributor>/gi));
  const tokenMatch = xml.match(/<resumptionToken[^>]*>([^<]+)<\/resumptionToken>/i);

  console.log(`dc:creator count: ${creatorMatches.length}`);
  console.log(`dc:contributor count: ${contributorMatches.length}`);
  console.log(`Total people in this single batch: ${creatorMatches.length + contributorMatches.length}`);
  console.log(`Resumption token: ${tokenMatch ? tokenMatch[1] : 'none'}`);
  console.log('Sample names:');
  for (const m of creatorMatches.slice(0, 5)) {
    console.log(`  - ${m[1]}`);
  }
}

testOaiParsing().catch(console.error);
