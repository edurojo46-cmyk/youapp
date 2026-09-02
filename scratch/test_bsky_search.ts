async function testBsky() {
  const endpoints = [
    'https://bsky.social/xrpc/app.bsky.feed.searchPosts?q=youtube&limit=10',
    'https://api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=youtube&limit=10',
    'https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=bsky.app&limit=10'
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json'
        }
      });
      console.log(ep, '--> Status:', res.status);
      if (res.ok) {
        const j = await res.json() as any;
        console.log('  Posts count:', j.posts?.length || j.feed?.length);
      }
    } catch (e: any) {
      console.log(ep, '--> Error:', e.message);
    }
  }
}

testBsky().catch(console.error);
