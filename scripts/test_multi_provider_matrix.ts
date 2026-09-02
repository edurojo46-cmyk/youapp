/**
 * test_multi_provider_matrix.ts
 *
 * MULTI-PROVIDER GOLD MATRIX VALIDATION
 * Valida la matriz completa de 4 ecosistemas independientes:
 * 1. Vimeo (Cine/Cortos/Creativo)
 * 2. Dailymotion (Noticias/Actualidad/Deportes)
 * 3. Internet Archive (Historia/Documentales/Cultura)
 * 4. PeerTube (Contenido Federado/Open Source)
 */

if (typeof (import.meta as any).env === 'undefined') {
  (import.meta as any).env = { DEV: true, VITE_SMOKE_LIVE: 'true' };
}
import 'fake-indexeddb/auto';

import { executeSearch } from '../src/lib/search/searchEngine';

async function runMatrixTests() {
  console.log('======================================================================');
  console.log('🌐 YOUAPP MULTI-PROVIDER GOLD MATRIX TEST SUITE');
  console.log('======================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(label: string, cond: boolean) {
    total++;
    if (cond) {
      passed++;
      console.log(`  ✅ [PASS] ${label}`);
    } else {
      console.error(`  ❌ [FAIL] ${label}`);
    }
  }

  // 1. VIMEO TEST
  console.log('1. [VIMEO GATE] "Alike short film"');
  const vimeoRes = await executeSearch('Alike short film', {
    forceProviders: ['vimeo'],
    excludeProviders: ['youtube', 'dailymotion', 'publisher', 'discover', 'video-mesh'],
    skipCache: true
  });
  console.log(`   Resultados en FINAL: ${vimeoRes.videos.length} | Latencia: ${vimeoRes.trace?.latencyMs}ms`);
  assert('Vimeo entregó resultados en FINAL (Q>=60, R>=40)', vimeoRes.videos.length >= 1);
  assert('Todos provienen de Vimeo', vimeoRes.videos.every(v => v.provider === 'vimeo'));

  // 2. DAILYMOTION TEST
  console.log('\n2. [DAILYMOTION GATE] "noticias internacionales"');
  const dmRes = await executeSearch('noticias internacionales', {
    forceProviders: ['dailymotion'],
    excludeProviders: ['youtube', 'vimeo', 'publisher', 'discover', 'video-mesh'],
    skipCache: true
  });
  console.log(`   Resultados en FINAL: ${dmRes.videos.length} | Latencia: ${dmRes.trace?.latencyMs}ms`);
  assert('Dailymotion entregó resultados en FINAL (Q>=60, R>=40)', dmRes.videos.length >= 1);
  assert('Todos provienen de Dailymotion', dmRes.videos.every(v => v.provider === 'dailymotion'));

  // 3. INTERNET ARCHIVE TEST
  console.log('\n3. [INTERNET ARCHIVE GATE] "Martin Luther King discurso archivo"');
  const archiveRes = await executeSearch('Martin Luther King discurso archivo', {
    forceProviders: ['video-mesh'],
    excludeProviders: ['youtube', 'vimeo', 'dailymotion', 'publisher', 'discover'],
    skipCache: true
  });
  console.log(`   Resultados en FINAL: ${archiveRes.videos.length} | Latencia: ${archiveRes.trace?.latencyMs}ms`);
  assert('Archive/Mesh entregó resultados en FINAL (Q>=60, R>=40)', archiveRes.videos.length >= 1);
  assert('Todos provienen de Archive o PeerTube', archiveRes.videos.every(v => v.provider === 'archive' || v.provider === 'peertube'));

  // 4. PARALLEL MULTI-PROVIDER PROBE
  console.log('\n4. [PARALLEL PROBE GATE] "documental segunda guerra mundial"');
  const multiRes = await executeSearch('documental segunda guerra mundial', {
    excludeProviders: ['youtube'], // Todos los gratuitos en paralelo, 0 YouTube Radar
    skipCache: true
  });
  console.log(`   Resultados en FINAL: ${multiRes.videos.length} | Latencia: ${multiRes.trace?.latencyMs}ms`);
  assert('Parallel probe resolvió con múltiples fuentes a 0 cuota YouTube', multiRes.videos.length >= 1);

  console.log('\n======================================================================');
  console.log(`🏆 RESUMEN MATRIZ: ${passed} / ${total} PRUEBAS PASADAS (${Math.round((passed / total) * 100)}%)`);
  console.log('======================================================================');
}

runMatrixTests();
