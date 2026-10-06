/**
 * test_dailymotion_direct.ts
 *
 * Prueba directa a la API pública de Dailymotion:
 * https://api.dailymotion.com/videos?search=...
 */

async function testDailymotionDirect() {
  console.log('Testing Dailymotion Public API directly...');
  const query = 'noticias';
  const fields = 'id,title,description,duration,created_time,thumbnail_480_url,thumbnail_360_url,thumbnail_url,owner,channel,language,allow_embed,onair,views_total,likes_total';
  
  const url = `https://api.dailymotion.com/videos?search=${encodeURIComponent(query)}&fields=${fields}&limit=10&sort=relevance`;
  console.log('Fetching URL:', url);

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    console.log('HTTP Status:', res.status);
    const data = await res.json();
    console.log('Results Count:', data.list?.length || 0);
    if (data.list && data.list.length > 0) {
      console.log('Sample item 0:', {
        id: data.list[0].id,
        title: data.list[0].title,
        duration: data.list[0].duration,
        embed: `https://www.dailymotion.com/embed/video/${data.list[0].id}`
      });
    }
  } catch (err: any) {
    console.error('Error fetching Dailymotion:', err.message);
  }
}

testDailymotionDirect();
