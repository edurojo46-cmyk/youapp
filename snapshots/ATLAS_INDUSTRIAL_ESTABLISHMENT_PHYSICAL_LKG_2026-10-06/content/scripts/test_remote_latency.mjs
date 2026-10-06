import fetch from 'node-fetch';

async function testEndpoints() {
  console.log('Testing OpenAlex sharded endpoint...');
  const t0 = Date.now();
  const res = await fetch('https://api.openalex.org/authors?filter=last_known_institutions.id:I161318765,works_count:>5&per_page=200&cursor=*&mailto=contact@youapp.com');
  const d0 = Date.now() - t0;
  console.log(`OpenAlex status: ${res.status} in ${d0}ms`);
  if (res.ok) {
    const json = await res.json();
    console.log(`Results count: ${json.results?.length}, next_cursor: ${json.meta?.next_cursor ? 'present' : 'none'}`);
  }

  console.log('Testing OAI-PMH SEDICI...');
  const t1 = Date.now();
  const oaiRes = await fetch('http://sedici.unlp.edu.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc');
  const d1 = Date.now() - t1;
  console.log(`SEDICI status: ${oaiRes.status} in ${d1}ms`);
}

testEndpoints().catch(console.error);
