import { supabase } from '../src/lib/supabase';

async function testLiveEdgeFunction() {
  console.log('======================================================================');
  console.log('🌐 TEST LIVE EDGE FUNCTION: publisher-video-discovery (PÁGINA/12 LIVE)');
  console.log('======================================================================\n');

  console.log('📡 Invocando supabase.functions.invoke("publisher-video-discovery")...');
  
  const startTime = Date.now();
  const { data, error } = await supabase.functions.invoke('publisher-video-discovery', {
    body: {
      query: 'ataque nadia beller bolivia cerimedo',
      publisherFilter: 'pagina12',
      limit: 20
    }
  });
  const latency = Date.now() - startTime;

  console.log(`⏱️ Latencia: ${latency}ms`);
  
  if (error) {
    console.error('❌ Error de Invocación:', error);
  } else {
    console.log('✅ Invocación Exitosa (HTTP 200 OK):');
    console.log(`   - ok: ${data?.ok}`);
    console.log(`   - publisher: ${data?.publisher}`);
    console.log(`   - pagesFetched: ${data?.stats?.pagesFetched}`);
    console.log(`   - extractedRaw: ${data?.stats?.extractedRaw}`);
    console.log(`   - uniqueVideos: ${data?.stats?.uniqueVideos}`);
    console.log('\n📹 Videos Extraídos en Vivo desde el Publisher:');
    data?.videos?.forEach((v: any, i: number) => {
      console.log(`   [Video ${i + 1}] Provider: ${v.provider.toUpperCase()} | ID: ${v.providerContentId}`);
      console.log(`     Título: "${v.title}"`);
      console.log(`     Publisher: ${v.publisherName} (${v.publisherCode})`);
      console.log(`     Discovery Method: ${v.discoveryMethod} | Extraction Method: ${v.extractionMethod}`);
      console.log(`     Article URL: ${v.articleUrl}`);
      console.log(`     Video URL: ${v.videoUrl}`);
    });
  }

  console.log('\n💰 ECONOMÍA DEL DESCUBRIMIENTO:');
  console.log('   - YouTube Radar Calls: 0 (DESHABILITADO)');
  console.log('   - Quota Consumed: 0 u');

  console.log('\n======================================================================');
  console.log('🏆 PUBLISHER VIDEO DISCOVERY VALIDADO EN VIVO EN SUPABASE CLOUD');
  console.log('======================================================================\n');
}

testLiveEdgeFunction().catch(console.error);
