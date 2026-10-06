async function test() {
  const url = 'https://api.openalex.org/authors?search=Mariel+Fernanda+Musso&per_page=1&mailto=contact@youapp.com';
  const res = await fetch(url, { headers: { 'User-Agent': 'YouApp/1.0 (mailto:contact@youapp.com)' } });
  console.log('Status:', res.status, res.statusText);
  const data = await res.json();
  console.log('Results count:', data.results?.length);
  if (data.results?.[0]) {
    console.log('Match:', data.results[0].display_name, data.results[0].id);
    console.log('Last known inst:', data.results[0].last_known_institutions);
  }
}
test();
