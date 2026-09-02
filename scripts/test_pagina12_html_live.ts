async function checkPagina12() {
  const url = 'https://www.pagina12.com.ar/el-pais/';
  console.log('Fetching:', url);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    console.log('Status:', res.status);
    const html = await res.text();
    const articles = Array.from(html.matchAll(/<a\b[^>]*?href=["']([^"']+)["'][^>]*>/gi)).map(m => m[1]);
    console.log('Total a tags:', articles.length, 'Articles:', articles.filter(a => a.startsWith('/') && a.length > 15).slice(0, 10));
  } catch (err) {
    console.error('Fetch error:', err);
  }
}

checkPagina12();
