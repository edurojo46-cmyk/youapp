import fetch from 'node-fetch';

async function testDirect() {
  const handleId = '179477';
  let title: string | null = null;
  let doi: string | null = null;
  let year: number | null = null;
  const creators: string[] = [];
  const affiliationsRaw: Array<{ author: string; affiliation: string; country: string }> = [];

  const landingUrl = `https://ri.conicet.gov.ar/handle/11336/${handleId}`;
  console.log('Fetching landingUrl:', landingUrl);
  const lRes = await fetch(landingUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    timeout: 10000
  } as any);

  console.log('lRes.ok:', lRes.ok, lRes.status);
  const html = await lRes.text();

  const citTitle = html.match(/<meta[^>]*content="([^"]+)"[^>]*name="citation_title"/i) ||
                   html.match(/<meta[^>]*name="citation_title"[^>]*content="([^"]+)"/i) ||
                   html.match(/<meta[^>]*name="DC\.title"[^>]*content="([^"]+)"/i);
  if (citTitle) title = citTitle[1].trim();

  const descMatches = html.match(/<meta[^>]*name="DC\.description"[^>]*content="Fil:\s*([^"]+)"/gi) || [];
  for (const dm of descMatches) {
    const clean = dm.match(/content="Fil:\s*([^"]+)"/i)?.[1]?.trim();
    if (clean) {
      const parts = clean.split('.');
      const author = parts[0]?.trim() || '';
      const affilAndCountry = parts.slice(1).join('.').trim();
      const subParts = affilAndCountry.split(';');
      const affiliation = subParts[0]?.trim() || '';
      const country = subParts[subParts.length - 1]?.trim() || '';
      affiliationsRaw.push({ author, affiliation: affilAndCountry, country });
    }
  }

  console.log('Extracted:', { title, affiliationsRaw });
}

testDirect();
