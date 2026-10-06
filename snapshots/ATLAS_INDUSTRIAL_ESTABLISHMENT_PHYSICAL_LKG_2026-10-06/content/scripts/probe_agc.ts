async function searchAgc() {
  const url = 'https://data.buenosaires.gob.ar/api/3/action/package_search?q=agc';
  const res = await fetch(url);
  const data = await res.json();
  console.log('AGC count:', data?.result?.count);
  for (const r of data?.result?.results || []) {
    console.log('-', r.name, ':', r.title);
    for (const res of r.resources || []) {
      console.log('   *', res.name, res.format, res.url);
    }
  }
}
searchAgc();
