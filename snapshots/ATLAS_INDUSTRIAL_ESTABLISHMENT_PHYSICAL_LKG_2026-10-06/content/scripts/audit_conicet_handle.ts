async function inspectHandleOai() {
  const handle = '11336/179477';
  // Check OAI-PMH GetRecord
  const oaiUrl = `https://ri.conicet.gov.ar/oai/request?verb=GetRecord&identifier=oai:ri.conicet.gov.ar:${handle}&metadataPrefix=oai_dc`;
  console.log('Fetching OAI GetRecord for', handle);
  const res = await fetch(oaiUrl);
  const xml = await res.text();
  console.log('=== OAI DC XML ===\n', xml.slice(0, 1500));

  // Also fetch DSpace handle landing page or JSON
  const landingUrl = `https://ri.conicet.gov.ar/handle/${handle}`;
  console.log('\nFetching Landing Page for', landingUrl);
  const lRes = await fetch(landingUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await lRes.text();
  console.log('Landing page title:', html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]);
  // Look for authors, affiliations, ORCID
  const authorMatches = html.match(/<span[^>]*itemprop="author"[^>]*>([\s\S]*?)<\/span>/gi);
  console.log('Author matches on landing page:', authorMatches?.slice(0, 3));
  
  // Look for ORCID links
  const orcidMatches = html.match(/https?:\/\/orcid\.org\/[0-9X-]+/gi);
  console.log('ORCID matches:', orcidMatches);

  // Look for affiliations on landing page
  const affilMatches = html.match(/(?:Filiación|Afiliación|Lugar de trabajo|Institución)[^<]{1,150}/gi);
  console.log('Affiliation mentions on landing page:', affilMatches);
}

inspectHandleOai().catch(console.error);
