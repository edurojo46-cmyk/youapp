import fetch from 'node-fetch';

async function inspectHandle(handleId: string) {
  const oaiUrl = `https://ri.conicet.gov.ar/oai/request?verb=GetRecord&identifier=oai:ri.conicet.gov.ar:11336/${handleId}&metadataPrefix=oai_dc`;
  const res = await fetch(oaiUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const xml = await res.text();
  console.log(`--- OAI DC for ${handleId} ---`);
  console.log(xml.slice(0, 1500));

  // Also check handle landing page
  const pageUrl = `https://ri.conicet.gov.ar/handle/11336/${handleId}`;
  const pRes = await fetch(pageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await pRes.text();
  console.log(`--- Landing page title for ${handleId} ---`);
  console.log(html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]);
  const dcFields = html.match(/<meta[^>]*name="DC\.[^>]*>/gi) || [];
  console.log('DC Meta tags on landing page:');
  console.log(dcFields.slice(0, 10));
}

inspectHandle('179477');
