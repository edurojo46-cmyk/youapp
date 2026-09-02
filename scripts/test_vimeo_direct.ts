/**
 * test_vimeo_direct.ts
 *
 * Test aislado de Vimeo Adapter para evaluar si la API devuelve contenido real,
 * elegibilidad de Quality/Relevance y reproducibilidad.
 */

if (typeof (import.meta as any).env === 'undefined') {
  (import.meta as any).env = { DEV: true };
}

import { vimeoAdapter } from '../src/lib/search/providers/adapters/vimeoAdapter';
import { parseQuery } from '../src/lib/search/queryEngine';
import { calculateQualityScore } from '../src/lib/search/qualityEngine';
import { calculateBaseRanking } from '../src/lib/search/rankingEngine';

async function runVimeoDirectTest() {
  console.log('======================================================================');
  console.log('🎬 TEST AISLADO: VIMEO DIRECT ADAPTER (LIVE API)');
  console.log('Query: "filosofía aquí y ahora"');
  console.log('======================================================================\n');

  const query = parseQuery('filosofía aquí y ahora');
  const providerStatuses: Record<string, { status: string; results: number }> = {};

  console.log('1. LLAMADA DIRECTA AL ADAPTER DE VIMEO:');
  const startTime = Date.now();
  const items = await vimeoAdapter.search(query, {
    limit: 10,
    providerStatuses
  });
  const latency = Date.now() - startTime;

  console.log(`   - Latencia:          ${latency} ms`);
  console.log(`   - Status Reportado:  ${JSON.stringify(providerStatuses)}`);
  console.log(`   - Items Recibidos:   ${items.length}`);

  if (items.length === 0) {
    console.log('\n❌ VIMEO NO DEVOLVIÓ RESULTADOS DIRECTOS.');
    return;
  }

  console.log('\n2. EVALUACIÓN DE ELEGIBILIDAD CORE (Q >= 60, R >= 40):');
  const scoredItems = calculateQualityScore(items);
  const rankedItems = calculateBaseRanking(scoredItems, query);
  let qualifiedCount = 0;

  rankedItems.forEach((item, idx) => {
    const qScore = item.qualityScore || 0;
    const rScore = item.relevanceScore || 0;
    const isEligible = qScore >= 60 && rScore >= 40;
    if (isEligible) qualifiedCount++;

    console.log(`\n   [Vimeo #${idx + 1}] "${item.title}"`);
    console.log(`     ID:               ${item.id} (providerContentId: ${item.providerContentId || (item as any).id})`);
    console.log(`     Canal / Autor:    ${item.channelTitle || 'N/A'}`);
    console.log(`     Duración:         ${Math.round((item.durationSeconds || 0) / 60)} min (${item.durationSeconds}s)`);
    console.log(`     Video URL / Embed:${item.videoUrl}`);
    console.log(`     Thumbnail:        ${item.thumbnail ? item.thumbnail.slice(0, 70) + '...' : 'N/A'}`);
    console.log(`     Embeddable:       ${item.embeddable ? 'SÍ ✅' : 'NO ❌'}`);
    console.log(`     Quality (Q):      ${qScore}/100 (Min 60) -> ${qScore >= 60 ? 'PASS ✅' : 'FAIL ❌'}`);
    console.log(`     Relevance (R):    ${rScore}/100 (Min 40) -> ${rScore >= 40 ? 'PASS ✅' : 'FAIL ❌'}`);
    console.log(`     Core Eligibility: ${isEligible ? 'ELEGIBLE PARA FINAL 🌟' : 'DROP ❌'}`);
  });

  console.log('\n======================================================================');
  console.log(`🏆 RESUMEN VIMEO DIRECT TEST:`);
  console.log(`   - Raw Items:       ${items.length}`);
  console.log(`   - Qualified Items: ${qualifiedCount} / ${items.length}`);
  console.log(`   - Quota YouTube:   0 u (Costo cero de cuota)`);
  console.log('======================================================================');
}

runVimeoDirectTest();
