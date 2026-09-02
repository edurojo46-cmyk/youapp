async function testJetstreamReplay() {
  // Microseconds 2 hours ago
  const twoHoursAgoUs = (Date.now() - 2 * 3600 * 1000) * 1000;
  const wsUrl = `wss://jetstream1.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post&cursor=${twoHoursAgoUs}`;

  console.log('Connecting to Jetstream with cursor:', wsUrl);
  const ws = new WebSocket(wsUrl);

  let count = 0;
  ws.onmessage = (event) => {
    count++;
    try {
      const data = JSON.parse(event.data as string);
      if (data?.commit?.record) {
        console.log(`[#${count}] Historical Post Time:`, data.commit.record.createdAt, 'Text:', data.commit.record.text?.slice(0, 50));
      }
    } catch {}

    if (count >= 10) {
      console.log('✅ Successfully replayed historical posts from Jetstream!');
      ws.close();
      process.exit(0);
    }
  };

  ws.onerror = (e) => {
    console.error('Jetstream error:', e);
  };
}

testJetstreamReplay().catch(console.error);
