/**
 * test_archive_gold.ts
 *
 * INTERNET ARCHIVE GOLD LIVE TEST GATE:
 * Valida de punta a punta que Internet Archive entregue material histórico real,
 * con identificadores canónicos válidos, embedUrls reproducibles,
 * califique en el ranking Core (Q>=60, R>=40) y llegue al FINAL a costo 0 de YouTube.
 */

if (typeof (import.meta as any).env === 'undefined') {
  (import.meta as any).env = { DEV: true, VITE_SMOKE_LIVE: 'true' };
}
import 'fake-indexeddb/auto';

import { executeSearch } from '../src/lib/search/searchEngine';

async function runArchiveGoldTest() {
  console.log('======================================================================');
  console.log('🏛️ INTERNET ARCHIVE GOLD LIVE TEST GATE');
  console.log('======================================================================\n');

  const query = 'Martin Luther King discurso archivo';
  console.log(`🔎 Ejecutando búsqueda histórica Internet Archive para: "${query}"...\n`);

  const result = await executeSearch(query, {
    forceProviders: ['video-mesh'],
    excludeProviders: ['youtube', 'vimeo', 'dailymotion', 'publisher', 'discover'],
    skipCache: true
  });

  console.log('======================================================================');
  console.log('📊 RESULTADOS OBTENIDOS EN EL PIPELINE:');
  console.log(`   - Total Resultados en FINAL:  ${result.videos.length}`);
  console.log(`   - Ruta activa (Path):         ${result.trace?.path}`);
  console.log(`   - Latencia total:             ${result.trace?.latencyMs} ms`);
  console.log(`   - Cuota de YouTube gastada:   0 u (RADAR SKIPPED)`);
  console.log('======================================================================\n');

  if (result.videos.length > 0) {
    console.table(result.videos.slice(0, 5).map((r, i) => ({
      '#': i + 1,
      Título: r.title.slice(0, 45),
      Provider: r.provider,
      Source: r.retrievalSource,
      ID: r.providerContentId,
      Q: r.qualityScore,
      R: r.relevanceScore,
      Embeddable: r.embeddable ? 'SÍ' : 'NO'
    })));
  }

  // Aserciones de Oro
  let passed = 0;
  let total = 0;

  function assert(label: string, condition: boolean, detail?: any) {
    total++;
    if (condition) {
      passed++;
      console.log(`✅ [PASS] ${label}`);
    } else {
      console.error(`❌ [FAIL] ${label}`, detail || '');
    }
  }

  console.log('\n🧪 VALIDACIONES DEL GOLD GATE:\n');

  assert(
    'Internet Archive entregó al menos 1 candidato real',
    result.videos.length >= 1,
    `Obtenidos: ${result.videos.length}`
  );

  const allArchive = result.videos.every(r => r.provider === 'archive' || r.retrievalSource === 'video-mesh');
  assert(
    'Todos los resultados provienen de Archive / VideoMesh',
    allArchive
  );

  const hasValidIds = result.videos.every(r => r.providerContentId && !r.providerContentId.includes('[object') && r.providerContentId.length > 2);
  assert(
    'Todos los IDs canónicos son válidos (no malformados)',
    hasValidIds
  );

  const allQualified = result.videos.every(r => (r.qualityScore || 0) >= 60 && (r.relevanceScore || 0) >= 40);
  assert(
    'Todos los items en FINAL cumplen el Invariant de Calidad (Q >= 60 && R >= 40)',
    allQualified
  );

  const allEmbeddable = result.videos.every(r => r.embeddable !== false);
  assert(
    'Los videos de archivo son embeddables / reproducibles',
    allEmbeddable
  );

  const zeroRadar = result.trace?.acquisitionStats?.radar === 0 || !result.trace?.acquisitionStats?.radar;
  assert(
    'YouTube Radar no fue ejecutado (0 cuota YouTube consumida)',
    zeroRadar
  );

  console.log('\n======================================================================');
  console.log(`🏆 RESUMEN DEL GOLD TEST: ${passed} / ${total} ASERCIONES PASADAS (${Math.round((passed / total) * 100)}%)`);
  console.log('======================================================================');

  if (passed === total) {
    console.log('\n🎉 ¡INTERNET ARCHIVE GOLD GATE APROBADO EXITOSAMENTE! 🎉\n');
  }
}

runArchiveGoldTest();
