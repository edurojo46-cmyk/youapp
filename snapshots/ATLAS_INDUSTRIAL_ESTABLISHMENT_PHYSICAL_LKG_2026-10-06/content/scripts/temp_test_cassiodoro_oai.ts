import fetch from 'node-fetch';

async function test() {
  const oaiUrl = `https://ri.conicet.gov.ar/oai/request?verb=GetRecord&identifier=oai:ri.conicet.gov.ar:11336/179477&metadataPrefix=oai_dc`;
  const res = await fetch(oaiUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  console.log('OAI status:', res.status);
  const text = await res.text();
  console.log('OAI text:', text);
}

test();
