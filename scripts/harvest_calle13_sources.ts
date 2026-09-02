import { extractYouTubeVideoIds } from '../src/lib/atlasHarvester/youtubeReferenceExtractor';
import { exactWorkSearchGate } from '../src/lib/search/exactWorkSearchGate';

async function testSources() {
  console.log('📡 INVESTIGANDO FUENTES PÚBLICAS PERMITIDAS PARA "Calle 13 - La Perla":\n');

  const candidates: Array<{ provider: string; id: string; title: string; url: string }> = [];

  // 1. Internet Archive API
  console.log('1. Internet Archive (Archive.org)...');
  try {
    const archiveUrl = `https://archive.org/advancedsearch.php?q=${encodeURIComponent('("calle 13" AND "la perla") OR ("calle 13" AND "perla")')}&fl[]=identifier,title,description,mediatype&rows=20&output=json`;
    const res = await fetch(archiveUrl, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = await res.json();
      const docs = data?.response?.docs || [];
      console.log(`   Devueltos por Archive.org: ${docs.length}`);
      for (const d of docs) {
        console.log(`   • [Archive] ${d.title} (ID: ${d.identifier}, Mediatype: ${d.mediatype})`);
        candidates.push({
          provider: 'archive',
          id: d.identifier,
          title: d.title,
          url: `https://archive.org/details/${d.identifier}`
        });
      }
    }
  } catch (e: any) {
    console.log('   Archive.org fetch error:', e.message);
  }

  // 2. PeerTube (SepiaSearch)
  console.log('\n2. PeerTube (SepiaSearch API)...');
  try {
    const ptUrl = `https://sepiasearch.org/api/v1/search/videos?search=${encodeURIComponent('calle 13 la perla')}&count=15`;
    const res = await fetch(ptUrl, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = await res.json();
      const items = data?.data || [];
      console.log(`   Devueltos por PeerTube: ${items.length}`);
      for (const item of items) {
        console.log(`   • [PeerTube] ${item.name} (UUID: ${item.uuid})`);
        candidates.push({
          provider: 'peertube',
          id: item.uuid,
          title: item.name,
          url: item.url
        });
      }
    }
  } catch (e: any) {
    console.log('   PeerTube fetch error:', e.message);
  }

  // 3. Bluesky API (Public search for shared videos of Calle 13 La Perla)
  console.log('\n3. Bluesky Feed (Public video posts)...');
  try {
    const bskyUrl = `https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent('calle 13 la perla')}&limit=40`;
    const res = await fetch(bskyUrl, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = await res.json();
      const posts = data?.posts || [];
      console.log(`   Devueltos por Bluesky: ${posts.length}`);
      for (const p of posts) {
        const text = `${p?.record?.text || ''} ${p?.record?.embed?.external?.uri || ''}`;
        const ext = p?.record?.embed?.external;
        const ytIds = extractYouTubeVideoIds(text);
        if (ytIds.length > 0) {
          console.log(`   • [Bluesky -> YT] Video ID: ${ytIds[0]} | Title: ${ext?.title || p?.record?.text?.slice(0, 60)}`);
          candidates.push({
            provider: 'youtube',
            id: ytIds[0],
            title: ext?.title || p?.record?.text?.slice(0, 80) || 'Calle 13 La Perla',
            url: `https://www.youtube.com/watch?v=${ytIds[0]}`
          });
        }
      }
    }
  } catch (e: any) {
    console.log('   Bluesky fetch error:', e.message);
  }

  // 4. Vimeo API pública / oEmbed / search
  console.log('\n4. Vimeo...');
  try {
    const vimeoUrl = `https://vimeo.com/api/v2/video/search.json?query=${encodeURIComponent('calle 13 la perla')}`;
    // or public fetch
    console.log('   Vimeo check...');
  } catch {}

  console.log(`\nTotal candidatos brutos descubiertos en fuentes públicas: ${candidates.length}`);
}

testSources();
