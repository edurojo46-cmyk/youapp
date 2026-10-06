import fetch from 'node-fetch';

async function testSnrd() {
  const url = 'https://ri.conicet.gov.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc&set=snrd';
  console.log('Testing set=snrd...');
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 10000);
  const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
  clearTimeout(id);
  console.log('Status:', res.status);
  if (res.ok) {
    const xml = await res.text();
    console.log('XML length:', xml.length);
    const records = xml.match(/<record>[\s\S]*?<\/record>/g) || [];
    console.log('Records returned:', records.length);
  }
}

testSnrd().catch(console.error);
