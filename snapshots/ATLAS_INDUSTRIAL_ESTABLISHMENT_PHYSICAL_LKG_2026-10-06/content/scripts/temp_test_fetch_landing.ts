import fetch from 'node-fetch';

async function testFetchLanding() {
  const landingUrl = `https://ri.conicet.gov.ar/handle/11336/179477`;
  try {
    const lRes = await fetch(landingUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 10000
    } as any);
    console.log('lRes status:', lRes.status);
    const html = await lRes.text();
    console.log('html length:', html.length);
    const citTitle = html.match(/<meta[^>]*content="([^"]+)"[^>]*name="citation_title"/i) ||
                     html.match(/<meta[^>]*name="citation_title"[^>]*content="([^"]+)"/i) ||
                     html.match(/<meta[^>]*name="DC\.title"[^>]*content="([^"]+)"/i);
    console.log('citTitle:', citTitle?.[1]);
  } catch (e: any) {
    console.error('Fetch error:', e);
  }
}

testFetchLanding();
