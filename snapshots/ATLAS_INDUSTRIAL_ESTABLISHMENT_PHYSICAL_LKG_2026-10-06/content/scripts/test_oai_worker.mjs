import fetch from 'node-fetch';
import crypto from 'crypto';

async function testOaiWorker() {
  const endpoint = 'http://sedici.unlp.edu.ar/oai/request';
  let resumptionToken = null;
  let url = `${endpoint}?verb=ListRecords&metadataPrefix=oai_dc&from=2023-01-01&until=2023-12-31`;

  for (let page = 1; page <= 3; page++) {
    const t0 = Date.now();
    const res = await fetch(url);
    const xml = await res.text();
    const hash = crypto.createHash('sha256').update(xml).digest('hex');

    const tokenMatch = xml.match(/<resumptionToken[^>]*>([^<]+)<\/resumptionToken>/i);
    resumptionToken = tokenMatch ? tokenMatch[1] : null;

    // Extract records
    const recordBlocks = xml.split('<record>').slice(1);
    const people = [];

    for (const b of recordBlocks) {
      const idMatch = b.match(/<identifier>([^<]+)<\/identifier>/i);
      const rawId = idMatch ? idMatch[1] : `rec_${crypto.randomUUID()}`;
      const creators = Array.from(b.matchAll(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/gi));
      const contributors = Array.from(b.matchAll(/<dc:contributor[^>]*>([^<]+)<\/dc:contributor>/gi));

      for (const m of [...creators, ...contributors]) {
        const rawName = m[1].trim();
        people.push({ rawId, rawName, hash: hash.slice(0, 8) });
      }
    }

    console.log(`Page ${page}: ${people.length} people in ${Date.now() - t0}ms | Next token: ${resumptionToken ? resumptionToken.slice(0, 25) + '...' : 'none'}`);

    if (resumptionToken) {
      url = `${endpoint}?verb=ListRecords&resumptionToken=${encodeURIComponent(resumptionToken)}`;
    } else {
      break;
    }
  }
}

testOaiWorker().catch(console.error);
