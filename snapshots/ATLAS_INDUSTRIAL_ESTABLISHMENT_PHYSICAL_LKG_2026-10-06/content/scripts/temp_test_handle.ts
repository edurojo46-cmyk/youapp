import fetch from 'node-fetch';

async function testHandle(handleId: string) {
  const url = `https://ri.conicet.gov.ar/oai/request?verb=GetRecord&identifier=oai:ri.conicet.gov.ar:11336/${handleId}&metadataPrefix=oai_dc`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const xml = await res.text();
  console.log('--- XML SECOND HALF ---');
  console.log(xml.slice(2500));
}

testHandle('110941');
