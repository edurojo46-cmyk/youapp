async function run() {
  try {
    const res = await fetch('https://html.duckduckgo.com/html/?q=' + encodeURIComponent('plomero buenos aires'), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const html = await res.text();
    console.log("HTML length:", html.length);
    const regex = /<a class="result__url" href="([^"]+)">([^<]+)<\/a>/g;
    let match;
    let count = 0;
    while ((match = regex.exec(html)) !== null && count < 5) {
      console.log("URL:", match[1].trim(), "TEXT:", match[2].trim());
      count++;
    }
  } catch (err: any) {
    console.error("DDG error:", err.message);
  }
}

run();
