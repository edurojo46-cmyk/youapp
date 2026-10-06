async function testHeaders() {
  const url = 'https://api.openalex.org/authors?search=Mariel+Fernanda+Musso&per_page=1&mailto=contact@youapp.com';
  const res = await fetch(url, { headers: { 'User-Agent': 'YouApp/1.0 (mailto:contact@youapp.com)' } });
  console.log('Status:', res.status, res.statusText);
  for (const [k, v] of res.headers.entries()) {
    if (k.includes('rate') || k.includes('retry') || k.includes('limit')) {
      console.log(`${k}: ${v}`);
    }
  }
}
testHeaders();
