import fetch from 'node-fetch';

async function inspectSnrdRecords() {
  const url = 'https://ri.conicet.gov.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc&set=snrd';
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 12000);
  const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
  clearTimeout(id);

  if (!res.ok) {
    console.error('Error:', res.status);
    return;
  }

  const xml = await res.text();
  const records = xml.match(/<record>[\s\S]*?<\/record>/g) || [];
  console.log(`Fetched ${records.length} records from set=snrd`);

  // Inspect first 3 records
  for (let i = 0; i < Math.min(3, records.length); i++) {
    console.log(`\n--- RECORD #${i + 1} ---`);
    const r = records[i];
    const creators = (r.match(/<dc:creator>([^<]+)<\/dc:creator>/g) || []).map(c => c.replace(/<\/?dc:creator>/g, ''));
    const titles = (r.match(/<dc:title>([^<]+)<\/dc:title>/g) || []).map(t => t.replace(/<\/?dc:title>/g, ''));
    const publishers = (r.match(/<dc:publisher>([^<]+)<\/dc:publisher>/g) || []).map(p => p.replace(/<\/?dc:publisher>/g, ''));
    const descriptions = (r.match(/<dc:description>([^<]+)<\/dc:description>/g) || []).map(d => d.replace(/<\/?dc:description>/g, ''));
    const identifiers = (r.match(/<dc:identifier>([^<]+)<\/dc:identifier>/g) || []).map(d => d.replace(/<\/?dc:identifier>/g, ''));

    console.log('Title:', titles[0]);
    console.log('Creators:', creators);
    console.log('Publishers:', publishers);
    console.log('Identifiers:', identifiers);
    console.log('Snippet description:', descriptions[0]?.substring(0, 150));
  }

  // Check resumptionToken for set=snrd
  const rt = xml.match(/<resumptionToken[^>]*>([^<]+)<\/resumptionToken>/);
  console.log('\nResumption Token:', rt ? rt[1] : 'None');
  const completeListSize = xml.match(/completeListSize="(\d+)"/);
  console.log('Complete List Size reported by CONICET OAI:', completeListSize ? completeListSize[1] : 'Not reported');
}

inspectSnrdRecords().catch(console.error);
