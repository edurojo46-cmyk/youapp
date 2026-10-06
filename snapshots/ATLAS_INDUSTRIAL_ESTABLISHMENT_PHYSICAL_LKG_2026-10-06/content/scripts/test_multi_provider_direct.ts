/**
 * test_multi_provider_direct.ts
 *
 * Prueba directa a las APIs públicas de:
 * 1. Dailymotion: api.dailymotion.com
 * 2. Internet Archive: archive.org/advancedsearch.php
 * 3. PeerTube: sepiasearch.org/api/v1/search/videos
 */

async function testDirectAPIs() {
  console.log('======================================================================');
  console.log('🌐 TESTING DIRECT PUBLIC APIS: DAILYMOTION | ARCHIVE | PEERTUBE');
  console.log('======================================================================\n');

  // 1. Dailymotion
  console.log('1. DAILYMOTION DIRECT API TEST:');
  try {
    const dmQuery = 'noticias';
    const fields = 'id,title,description,duration,created_time,thumbnail_480_url,owner,channel,allow_embed';
    const dmRes = await fetch(`https://api.dailymotion.com/videos?search=${encodeURIComponent(dmQuery)}&fields=${fields}&limit=5&sort=relevance`, { signal: AbortSignal.timeout(8000) });
    const dmData = await dmRes.json();
    console.log(`   - Status: ${dmRes.status} | Items: ${dmData.list?.length || 0}`);
    if (dmData.list?.length > 0) {
      console.log(`   - Sample item: "${dmData.list[0].title}" (ID: ${dmData.list[0].id})`);
    }
  } catch (e: any) {
    console.error('   - Dailymotion Error:', e.message);
  }

  // 2. Internet Archive
  console.log('\n2. INTERNET ARCHIVE DIRECT API TEST:');
  try {
    const archiveQuery = 'Martin Luther King';
    const params = new URLSearchParams({
      q: `(${archiveQuery}) AND mediatype:movies`,
      fl: 'identifier,title,description,creator,date,runtime,downloads',
      sort: 'downloads desc',
      rows: '5',
      page: '1',
      output: 'json'
    });
    const archiveRes = await fetch(`https://archive.org/advancedsearch.php?${params.toString()}`, { signal: AbortSignal.timeout(8000) });
    const archiveData = await archiveRes.json();
    const docs = archiveData.response?.docs || [];
    console.log(`   - Status: ${archiveRes.status} | Items: ${docs.length}`);
    if (docs.length > 0) {
      console.log(`   - Sample doc: "${docs[0].title}" (Identifier: ${docs[0].identifier})`);
      console.log(`   - Embed URL: https://archive.org/embed/${docs[0].identifier}`);
    }
  } catch (e: any) {
    console.error('   - Archive Error:', e.message);
  }

  // 3. PeerTube (SepiaSearch)
  console.log('\n3. PEERTUBE (SEPIASEARCH) DIRECT API TEST:');
  try {
    const ptQuery = 'linux tutorial';
    const ptParams = new URLSearchParams({
      search: ptQuery,
      count: '5',
      sort: '-match',
      nsfw: 'false'
    });
    const ptRes = await fetch(`https://sepiasearch.org/api/v1/search/videos?${ptParams.toString()}`, { signal: AbortSignal.timeout(8000) });
    const ptData = await ptRes.json();
    const ptItems = ptData.data || [];
    console.log(`   - Status: ${ptRes.status} | Items: ${ptItems.length}`);
    if (ptItems.length > 0) {
      console.log(`   - Sample item: "${ptItems[0].name}" (UUID: ${ptItems[0].uuid})`);
      console.log(`   - Host: ${ptItems[0].account?.host}`);
    }
  } catch (e: any) {
    console.error('   - PeerTube Error:', e.message);
  }

  console.log('\n======================================================================');
}

testDirectAPIs();
