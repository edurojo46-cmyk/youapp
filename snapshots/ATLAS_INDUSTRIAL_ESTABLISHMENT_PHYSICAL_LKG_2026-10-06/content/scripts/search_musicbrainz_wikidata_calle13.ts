async function searchMusicMetadata() {
  console.log('Searching MusicBrainz and Wikipedia for Calle 13 La Perla URLs/IDs:');

  // 1. MusicBrainz Recording search
  try {
    const mbUrl = 'https://musicbrainz.org/ws/2/recording?query=recording:%22La%20Perla%22%20AND%20artist:%22Calle%2013%22&fmt=json';
    const res = await fetch(mbUrl, {
      headers: { 'User-Agent': 'YouAppTV/1.0 ( music@youapp.tv )' }
    });
    if (res.ok) {
      const data = await res.json();
      console.log('MusicBrainz recordings found:', data.recordings?.length);
      for (const rec of (data.recordings || []).slice(0, 5)) {
        console.log(`- [MB] ${rec.title} by ${rec['artist-credit']?.map((a: any) => a.name).join(' ')} (ID: ${rec.id})`);
        // Fetch relations (URLs)
        const relUrl = `https://musicbrainz.org/ws/2/recording/${rec.id}?inc=url-rels&fmt=json`;
        const rRes = await fetch(relUrl, { headers: { 'User-Agent': 'YouAppTV/1.0' } });
        if (rRes.ok) {
          const rData = await rRes.json();
          for (const rel of (rData.relations || [])) {
            console.log(`   -> Rel (${rel.type}): ${rel.url?.resource}`);
          }
        }
      }
    }
  } catch (e: any) {
    console.log('MusicBrainz error:', e.message);
  }

  // 2. Wikipedia page for "La Perla (canción)"
  try {
    const wpUrl = 'https://es.wikipedia.org/w/api.php?action=parse&page=La_Perla_(canci%C3%B3n)&prop=text&format=json';
    const res = await fetch(wpUrl);
    if (res.ok) {
      const data = await res.json();
      const text = data?.parse?.text?.['*'] || '';
      console.log('Wikipedia article length:', text.length);
      const ytMatches = [...text.matchAll(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/g)].map(m => m[1]);
      console.log('Wikipedia YouTube references:', ytMatches);
    }
  } catch (e: any) {
    console.log('Wikipedia error:', e.message);
  }
}

searchMusicMetadata();
