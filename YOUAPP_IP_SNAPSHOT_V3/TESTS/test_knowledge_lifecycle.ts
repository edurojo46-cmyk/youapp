import { executeSearch } from '../src/lib/search/searchEngine';
import { supabase } from '../src/lib/supabase';

async function getQuotaUsed(): Promise<number> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('youtube_quota_daily')
      .select('used')
      .eq('date', today)
      .maybeSingle();
    return data?.used || 0;
  } catch {
    return 0;
  }
}

async function countAtlasCandidates(query: string): Promise<number> {
  try {
    const { count } = await supabase
      .from('youapp_index')
      .select('*', { count: 'exact', head: true })
      .or(`title.ilike.%${query}%,description.ilike.%${query}%`);
    return count || 0;
  } catch {
    return 0;
  }
}

async function runLifecycleTest() {
  const TEST_QUERY = 'spinetta jade';

  console.log('======================================================================');
  console.log(`🧪 TEST 5: CICLO COMPLETO DE APRENDIZAJE & REUTILIZACIÓN ("${TEST_QUERY}")`);
  console.log('======================================================================\n');

  // Estado Inicial
  const quotaBefore = await getQuotaUsed();
  const atlasBefore = await countAtlasCandidates(TEST_QUERY);

  console.log(`📊 ESTADO INICIAL:`);
  console.log(`- Cuota diaria registrada: ${quotaBefore} u`);
  console.log(`- Candidatos en Atlas para "${TEST_QUERY}": ${atlasBefore}`);

  // ── PRIMERA BÚSQUEDA (Debe activar Radar y absorber) ──
  console.log(`\n🔍 [1ª BÚSQUEDA] Ejecutando: "${TEST_QUERY}"...`);
  const firstResult = await executeSearch(TEST_QUERY);

  const quotaAfterFirst = await getQuotaUsed();
  const atlasAfterFirst = await countAtlasCandidates(TEST_QUERY);

  console.log(`\n📈 RESULTADO 1ª BÚSQUEDA:`);
  console.log(`- Path: ${firstResult.trace?.path}`);
  console.log(`- Candidatos devueltos: ${firstResult.all.length}`);
  console.log(`- Candidatos absorbidos en Atlas: ${atlasAfterFirst} (+${atlasAfterFirst - atlasBefore})`);
  console.log(`- Cuota después de 1ª búsqueda: ${quotaAfterFirst} u (Delta: +${quotaAfterFirst - quotaBefore})`);

  // ── SEGUNDA BÚSQUEDA (Debe usar Atlas / Fast Path con 0 Cuota) ──
  console.log(`\n🔍 [2ª BÚSQUEDA INMEDIATA] Repitiendo: "${TEST_QUERY}"...`);
  const secondResult = await executeSearch(TEST_QUERY);

  const quotaAfterSecond = await getQuotaUsed();
  const atlasAfterSecond = await countAtlasCandidates(TEST_QUERY);

  console.log(`\n📈 RESULTADO 2ª BÚSQUEDA:`);
  console.log(`- Path: ${secondResult.trace?.path}`);
  console.log(`- Candidatos devueltos: ${secondResult.all.length}`);
  console.log(`- Origen de candidatos:`, secondResult.trace?.acquisitionStats);
  console.log(`- Radar llamado en 2ª búsqueda: ${(secondResult.trace?.acquisitionStats?.radar || 0) > 0 ? 'SÍ ❌' : 'NO ✅'}`);
  console.log(`- Cuota después de 2ª búsqueda: ${quotaAfterSecond} u (Delta: +${quotaAfterSecond - quotaAfterFirst})`);

  console.log('\n======================================================================');
  const deltaFirst = quotaAfterFirst - quotaBefore;
  const deltaSecond = quotaAfterSecond - quotaAfterFirst;
  const passedLearning = atlasAfterFirst > atlasBefore;
  const passedZeroQuota = deltaSecond === 0 && (secondResult.trace?.acquisitionStats?.radar || 0) === 0;

  if (passedLearning && passedZeroQuota) {
    console.log('🏆 YOUAPP KNOWLEDGE REUSE V1 — 100% LIVE VALIDATED ✅');
    console.log(`   1ª Búsqueda: Descubrió y aprendió ${atlasAfterFirst} videos`);
    console.log(`   2ª Búsqueda: Respondió 100% desde Atlas con 0 cuota repetida`);
  } else {
    console.log(`Estado: delta1=${deltaFirst}, delta2=${deltaSecond}, learned=${passedLearning}`);
  }
  console.log('======================================================================\n');
}

runLifecycleTest().catch(console.error);
