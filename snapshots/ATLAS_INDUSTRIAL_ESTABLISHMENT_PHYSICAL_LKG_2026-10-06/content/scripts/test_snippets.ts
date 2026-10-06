async function run() {
  const res2 = await fetch('http://www.psi.uba.ar/institucional.php?var=institucional/decanato.php', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const html2 = await res2.text();
  console.log('decanato.php length:', html2.length);
  const matches = html2.match(/<(?:p|h[1-6]|li|div)[^>]*>([^<]{10,120})<\//gi);
  console.log('Decanato lines:', matches?.slice(0, 10));

  const res = await fetch('https://www.ferrocarriloeste.org.ar/institucional/autoridades/', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const html = await res.text();
  const lower = html.toLowerCase();
  console.log('Ferro has "directiva":', lower.includes('directiva'));
  console.log('Ferro has "pandolfi":', lower.includes('pandolfi'));
  const m = html.match(/<[^>]+class="[^"]*authority[^"]*"[^>]*>[\s\S]*?<\/[^>]+>/gi);
  console.log('Ferro authority class matches:', m?.length || 0);
}
run();
