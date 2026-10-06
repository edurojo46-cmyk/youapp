import fetch from 'node-fetch';

async function testAuthorsCountry() {
  console.log('Testing OpenAlex authors with country_code:AR...');
  const t0 = Date.now();
  const res = await fetch('https://api.openalex.org/authors?filter=last_known_institutions.country_code:AR&per_page=200&cursor=*&mailto=contact@youapp.com');
  const d0 = Date.now() - t0;
  console.log(`Status: ${res.status} in ${d0}ms`);
  if (res.ok) {
    const json = await res.json();
    console.log(`Total count in meta: ${json.meta?.count} | Returned: ${json.results?.length} | Next cursor: ${json.meta?.next_cursor ? 'yes' : 'no'}`);
    if (json.results?.length > 0) {
      const sample = json.results[0];
      console.log('Sample author:', sample.display_name, sample.last_known_institutions?.map(i => `${i.display_name} (${i.country_code})`));
    }
  }
}

testAuthorsCountry().catch(console.error);
