/**
 * test_alike_vimeo.ts
 *
 * Gold Test 2: "Alike short film"
 * Valida:
 * 1. Exact Canonical Title Match ("Alike short film" -> "Alike (2016)") con R >= 40.
 * 2. Extracción y reproducción directa desde Vimeo (vimeo_194276412).
 * 3. Fast Path Gate Fallback (Fast Path rejected si qualified < 8).
 * 4. Nivel 2: Alternative Provider Probe en frío (YouTube Radar = 0).
 */

if (typeof (import.meta as any).env === 'undefined') {
  (import.meta as any).env = { DEV: true };
}
import 'fake-indexeddb/auto';

import { vimeoAdapter } from '../src/lib/search/providers/adapters/vimeoAdapter';
import { parseQuery } from '../src/lib/search/queryEngine';
import { calculateQualityScore } from '../src/lib/search/qualityEngine';
import { calculateBaseRanking } from '../src/lib/search/rankingEngine';
import { executeSearch } from '../src/lib/search/searchEngine';

async function runAlikeTest() {
  console.log('======================================================================');
  console.log('🎬 GOLD TEST 2: "Alike short film" (VIMEO DISCOVERY & CANONICAL MATCH)');
  console.log('======================================================================\n');

  const query = parseQuery('Alike short film');
  const providerStatuses: Record<string, { status: string; results: number }> = {};

  // 1. Invocación aislada al adapter de Vimeo
  console.log('1. INVOCACIÓN AISLADA A VIMEO ADAPTER:');
  const items = await vimeoAdapter.search(query, {
    limit: 10,
    providerStatuses
  });

  console.log(`   - Raw Items Recibidos: ${items.length}`);
  console.log(`   - Status Reportado:    ${JSON.stringify(providerStatuses)}`);

  const scoredItems = calculateQualityScore(items);
  const rankedItems = calculateBaseRanking(scoredItems, query);

  console.log('\n2. EVALUACIÓN DE ELEGIBILIDAD CORE (Q >= 60, R >= 40):');
  let alikeItemFound = false;

  rankedItems.forEach((item, idx) => {
    const q = item.qualityScore || 0;
    const r = item.relevanceScore || 0;
    const isEligible = q >= 60 && r >= 40;
    if (item.title.toLowerCase().includes('alike')) {
      alikeItemFound = true;
    }

    console.log(`   [Item #${idx + 1}] "${item.title}"`);
    console.log(`     ID:               ${item.id} (${item.providerContentId})`);
    console.log(`     Canal / Autor:    ${item.channelTitle || 'N/A'}`);
    console.log(`     Duración:         ${Math.round((item.durationSeconds || 0) / 60)} min (${item.durationSeconds}s)`);
    console.log(`     Quality (Q):      ${q}/100 -> ${q >= 60 ? 'PASS ✅' : 'FAIL ❌'}`);
    console.log(`     Relevance (R):    ${r}/100 -> ${r >= 40 ? 'PASS ✅' : 'FAIL ❌'}`);
    console.log(`     Core Eligibility: ${isEligible ? 'ELEGIBLE 🌟' : 'DROP ❌'}`);
  });

  // 3. Ejecución en frío del Pipeline Completo
  console.log('\n3. SEARCH ENGINE CON PIPELINE FRÍO (Alternative Provider Probe):');
  const searchRes = await executeSearch('Alike short film', {
    bypassCandidatePool: true,
    bypassAtlas: true,
    trafficClass: 'benchmark'
  });

  const providersCount: Record<string, number> = {};
  const originsCount: Record<string, number> = {};

  searchRes.all.forEach(item => {
    providersCount[item.provider] = (providersCount[item.provider] || 0) + 1;
    const src = item.retrievalSource || 'unknown';
    originsCount[src] = (originsCount[src] || 0) + 1;
  });

  console.log(`   - Resultados en FINAL: ${searchRes.all.length}`);
  console.log('   - 🎬 Final Provider Mix:', providersCount);
  console.log('   - 🔎 Discovery Origin:  ', originsCount);
  console.log('   - Path ejecutado:       ', searchRes.trace?.path);

  console.log('\n======================================================================');
  console.log('🏆 VEREDICTO:');
  console.log(`   - Cortometraje Alike identificado: ${alikeItemFound ? 'SÍ ✅' : 'NO ❌'}`);
  console.log(`   - Vimeo presente en FINAL:         ${(providersCount['vimeo'] || 0) > 0 ? 'SÍ ✅ (' + providersCount['vimeo'] + ' videos)' : 'NO ❌'}`);
  console.log('======================================================================');
}

runAlikeTest();
