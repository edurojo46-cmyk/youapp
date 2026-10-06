import fetch from 'node-fetch';

async function testWorksEndpoint() {
  console.log('Testing OpenAlex works endpoint for UBA...');
  const t0 = Date.now();
  const res = await fetch('https://api.openalex.org/works?filter=institutions.id:I161318765&per_page=50&cursor=*&mailto=contact@youapp.com');
  const d0 = Date.now() - t0;
  console.log(`OpenAlex works status: ${res.status} in ${d0}ms`);
  if (res.ok) {
    const json = await res.json();
    const works = json.results || [];
    let totalAuthors = 0;
    let localAffiliatedAuthors = 0;
    for (const w of works) {
      const authorships = w.authorships || [];
      totalAuthors += authorships.length;
      for (const a of authorships) {
        const insts = a.institutions || [];
        const isLocal = insts.some(i => i.country_code === 'AR' || (i.display_name && (i.display_name.includes('Buenos Aires') || i.display_name.includes('Argentina'))));
        if (isLocal) localAffiliatedAuthors++;
      }
    }
    console.log(`Works count: ${works.length} | Total authors: ${totalAuthors} | Local Argentine authors: ${localAffiliatedAuthors} | Next cursor: ${json.meta?.next_cursor ? 'present' : 'none'}`);
  }
}

testWorksEndpoint().catch(console.error);
