async function searchMore() {
  console.log('Testing more Dailymotion and Vimeo queries:');
  const queries = [
    'Calle 13 La Perla',
    'La Perla Calle 13',
    'Calle 13 feat Ruben Blades',
    'Calle 13 Ruben Blades La Perla',
    'Calle 13 La Perla oficial',
    'Calle 13 La Perla en vivo',
    'Calle 13 La Perla concierto',
    'Calle 13 La Perla letra',
    'Calle 13 La Perla video'
  ];

  const foundDm = new Map<string, any>();

  for (const q of queries) {
    const params = new URLSearchParams({
      search: q,
      fields: 'id,title,description,duration,created_time,thumbnail_url,owner,channel',
      limit: '50'
    });
    try {
      const res = await fetch(`https://api.dailymotion.com/videos?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        for (const item of (json.list || [])) {
          const t = (item.title || '').toLowerCase();
          if (t.includes('perla') && (t.includes('calle 13') || t.includes('blades') || t.includes('residente'))) {
            foundDm.set(item.id, item);
          }
        }
      }
    } catch {}
  }

  console.log(`Found matching Dailymotion items: ${foundDm.size}`);
  for (const [id, item] of foundDm) {
    console.log(`- [DM] ${item.title} (ID: ${id})`);
  }

  // Check Vimeo
  console.log('\nTesting Vimeo:');
  try {
    const vimeoRes = await fetch('https://vimeo.com/api/v2/channel/music/videos.json');
    console.log('Vimeo channel status:', vimeoRes.status);
  } catch (e: any) {
    console.log('Vimeo error:', e.message);
  }
}

searchMore();
