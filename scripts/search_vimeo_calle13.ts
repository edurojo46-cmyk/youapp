async function searchVimeo() {
  console.log('Searching Vimeo...');
  try {
    const url = 'https://vimeo.com/search?q=calle+13+la+perla';
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    console.log('Vimeo search status:', res.status);
    if (res.ok) {
      const html = await res.text();
      // Look for video clip URLs or IDs
      const matches = [...html.matchAll(/\/(\d{7,10})/g)].map(m => m[1]);
      const uniqueVimeoIds = [...new Set(matches)];
      console.log('Found Vimeo video IDs:', uniqueVimeoIds.slice(0, 10));
      for (const id of uniqueVimeoIds.slice(0, 5)) {
        try {
          const oembed = await fetch(`https://vimeo.com/api/oembed.json?url=https://vimeo.com/${id}`);
          if (oembed.ok) {
            const data = await oembed.json();
            console.log(`- [Vimeo] ${data.title} by ${data.author_name} (ID: ${id})`);
          }
        } catch {}
      }
    }
  } catch (e: any) {
    console.error('Vimeo error:', e.message);
  }
}

searchVimeo();
