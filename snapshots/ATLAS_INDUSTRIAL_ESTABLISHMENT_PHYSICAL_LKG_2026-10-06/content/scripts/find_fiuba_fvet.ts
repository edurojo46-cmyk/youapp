import fetch from 'node-fetch';

async function testLinks() {
  const sites = ['https://fi.uba.ar', 'https://www.fvet.uba.ar'];
  for (const s of sites) {
    try {
      const res = await fetch(s, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const html = await res.text();
      const links = html.match(/href="([^"]+)"/g) || [];
      const authLinks = links.filter(l => /autor|gobier|gestion|decan/i.test(l));
      console.log(`Links for ${s}:`, authLinks.slice(0, 10));
    } catch (e: any) {
      console.log(`Err ${s}:`, e.message);
    }
  }
}
testLinks();
