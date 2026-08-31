async function run() {
  const q = ['charly garcia', 'los redondos', 'soda stereo', 'fito paez', 'miguel mateos', 'cerati', 'spinetta'];
  for (const k of q) {
    const res = await fetch('https://api.allorigins.win/raw?url=' + encodeURIComponent('https://www.youtube.com/results?search_query=' + k));
    const html = await res.text();
    const match = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
    console.log(k, match ? match[1] : 'not found');
  }
}
run();
