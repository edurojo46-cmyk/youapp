import fetch from 'node-fetch';

async function checkMeta(handleId: string) {
  const pageUrl = `https://ri.conicet.gov.ar/handle/11336/${handleId}`;
  const pRes = await fetch(pageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await pRes.text();
  const allMetas = html.match(/<meta[^>]*>/gi) || [];
  const relevant = allMetas.filter(m => m.includes('name="DC.') || m.includes('name="citation_'));
  for (const m of relevant) {
    console.log(m);
  }
}

checkMeta('179477');
