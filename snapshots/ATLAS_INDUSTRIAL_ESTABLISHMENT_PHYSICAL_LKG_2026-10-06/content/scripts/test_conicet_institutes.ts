import fetch from 'node-fetch';

async function testInstitutes() {
  const sets = [
    { spec: 'com_11336_431', name: 'IIBBA - Leloir (Caballito)' },
    { spec: 'com_11336_25', name: 'IBYME (Belgrano)' },
    { spec: 'com_11336_337', name: 'IAFE (Ciudad Universitaria)' },
    { spec: 'com_11336_345', name: 'IFIBA (Exactas)' }
  ];

  for (const s of sets) {
    const url = `https://ri.conicet.gov.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc&set=${s.spec}`;
    console.log(`Testing ${s.name} (${s.spec})...`);
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
      clearTimeout(id);
      console.log(`  Status: ${res.status}`);
      if (res.ok) {
        const xml = await res.text();
        const records = xml.match(/<record>[\s\S]*?<\/record>/g) || [];
        console.log(`  Records: ${records.length}`);
        const creators = xml.match(/<dc:creator>([^<]+)<\/dc:creator>/g) || [];
        console.log(`  Creators mentions: ${creators.length}`);
        const unique = new Set(creators.map(c => c.replace(/<\/?dc:creator>/g, '').trim()));
        console.log(`  Unique authors: ${unique.size}`);
        console.log('  Sample:', Array.from(unique).slice(0, 5));
      }
    } catch (e: any) {
      console.log(`  Err: ${e.message}`);
    }
  }
}

testInstitutes().catch(console.error);
