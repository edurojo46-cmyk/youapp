/**
 * test_cold_publisher_search.ts
 *
 * Test aislado para verificar la extracción directa y el pipeline frío sin interferencia de CandidatePool.
 */

// Node.js test environment polyfill for import.meta.env and indexedDB
if (typeof (import.meta as any).env === 'undefined') {
  (import.meta as any).env = { DEV: true, VITE_USE_EXTERNAL_SEARCH: 'true' };
}
import 'fake-indexeddb/auto';

import { supabase } from '../src/lib/supabase';
import { executeSearch } from '../src/lib/search/searchEngine';



async function runColdPublisherTest() {
  console.log('======================================================================');
  console.log('🧪 TEST AISLADO: PUBLISHER DISCOVERY & PIPELINE FRÍO');
  console.log('Query: "filosofía aquí y ahora"');
  console.log('======================================================================\n');

  // 1. Invocación aislada directa a la Edge Function
  console.log('1. INVOCACIÓN DIRECTA A EDGE FUNCTION (publisher-video-discovery):');
  try {
    const { data, error } = await supabase.functions.invoke('publisher-video-discovery', {
      body: { query: 'filosofía aquí y ahora', publisherFilter: 'all' }
    });

    if (error) {
      console.error('   ❌ Edge Function invocation error:', error);
    } else {
      console.log('   Status:', data?.ok ? 'OK 200 ✅' : 'FAIL');
      console.log('   Publisher Filter:', data?.publisher);
      console.log('   Stats:', data?.stats);
      console.log('   Videos Extraídos:', data?.videos?.length || 0);
      if (data?.videos && data.videos.length > 0) {
        data.videos.forEach((v: any, idx: number) => {
          console.log(`     [Video ${idx + 1}] Provider: ${v.provider.toUpperCase()} | ID: ${v.providerContentId} | Title: "${v.title}"`);
          console.log(`                 Artículo: ${v.articleUrl}`);
        });
      }
    }
  } catch (err: any) {
    console.error('   Exception invocando Edge Function:', err?.message || err);
  }

  // 2. Búsqueda en SearchEngine con BYPASS TOTAL de CandidatePool y Atlas
  console.log('\n2. SEARCH ENGINE CON BYPASS DE CACHE (Pipeline Frío):');
  try {
    const res = await executeSearch('filosofía aquí y ahora', {
      bypassCandidatePool: true,
      bypassAtlas: true,
      trafficClass: 'benchmark'
    });

    console.log(`   Resultados en FINAL: ${res.all.length}`);
    const providersCount: Record<string, number> = {};
    const originsCount: Record<string, number> = {};

    res.all.forEach(item => {
      providersCount[item.provider] = (providersCount[item.provider] || 0) + 1;
      const src = item.retrievalSource || 'unknown';
      originsCount[src] = (originsCount[src] || 0) + 1;
    });

    console.log('   🎬 Final Provider Mix:', providersCount);
    console.log('   🔎 Discovery Origin:', originsCount);
    console.log('   Path ejecutado:', res.trace?.path);
  } catch (err: any) {
    console.error('   Exception en SearchEngine:', err?.message || err);
  }

  console.log('\n======================================================================');
}

runColdPublisherTest();
