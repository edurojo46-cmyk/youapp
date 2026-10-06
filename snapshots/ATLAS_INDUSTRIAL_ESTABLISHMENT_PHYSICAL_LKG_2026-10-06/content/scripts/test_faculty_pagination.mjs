import fetch from 'node-fetch';

async function testFacultyPagination() {
  const faculties = [
    { id: 'com_10915_2', name: 'Ingeniería' },
    { id: 'com_10915_22', name: 'Ciencias Exactas' },
    { id: 'com_10915_33', name: 'Ciencias Económicas' },
    { id: 'com_10915_36', name: 'Informática' },
    { id: 'com_10915_7', name: 'Derecho' }
  ];

  for (const f of faculties) {
    let url = `http://sedici.unlp.edu.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc&set=${f.id}`;
    let total = 0;
    for (let page = 1; page <= 5; page++) {
      const t0 = Date.now();
      const res = await fetch(url);
      const xml = await res.text();
      const creators = Array.from(xml.matchAll(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/gi));
      const tokenMatch = xml.match(/<resumptionToken[^>]*>([^<]+)<\/resumptionToken>/i);
      total += creators.length;
      if (tokenMatch && tokenMatch[1].trim()) {
        url = `http://sedici.unlp.edu.ar/oai/request?verb=ListRecords&resumptionToken=${encodeURIComponent(tokenMatch[1].trim())}`;
      } else {
        break;
      }
    }
    console.log(`Faculty ${f.name} (${f.id}): 5 pages yielded ${total} authors`);
  }
}

testFacultyPagination().catch(console.error);
