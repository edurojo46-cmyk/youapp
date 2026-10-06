import fetch from 'node-fetch';

async function dumpExactas() {
  const url = 'https://exactas.uba.ar/institucional/autoridades/';
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await res.text();
  console.log('HTML length:', html.length);
  // find occurrences of 'Guillermo' or 'Duran' or 'Decan'
  const idx = html.toLowerCase().indexOf('decan');
  if (idx !== -1) {
    console.log('Snippet around decan:');
    console.log(html.substring(Math.max(0, idx - 200), idx + 800));
  } else {
    console.log('No "decan" found in HTML');
  }
}

dumpExactas().catch(console.error);
