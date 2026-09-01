import { executeSearch } from '../src/lib/search/searchEngine';
import { supabase } from '../src/lib/supabase';

async function testBelgicaRepeat() {
  console.log('====================================================');
  console.log('🧪 TEST: Repetición de Búsqueda para "belgica"');
  console.log('====================================================\n');

  // 1. Contar candidatos en Atlas
  const { count } = await supabase
    .from('youapp_index')
    .select('*', { count: 'exact', head: true })
    .or('title.ilike.%belgica%,description.ilike.%belgica%');

  console.log(`📦 Candidatos previamente absorbidos en Atlas: ${count || 0}`);

  // 2. Ejecutar búsqueda repetida
  console.log('\n🔍 Ejecutando executeSearch("belgica")...');
  const result = await executeSearch('belgica');

  console.log('\n📊 RESULTADOS:');
  console.log(`- Path: ${result.trace?.path}`);
  console.log(`- Candidatos devueltos: ${result.all.length}`);
  console.log(`- Origen de candidatos:`, result.trace?.acquisitionStats);
  console.log(`- Radar llamado: ${(result.trace?.acquisitionStats?.radar || 0) > 0 ? 'SÍ ❌' : 'NO ✅'}`);

  console.log('\n====================================================');
  if (result.trace?.path === 'fast' && (result.trace?.acquisitionStats?.radar || 0) === 0) {
    console.log('✅ REUTILIZACIÓN DE "BELGICA" CONFIRMADA AL 100%');
    console.log('   Atlas resolvió la búsqueda con 0 cuota y 0 llamadas a YouTube.');
  } else {
    console.log('⚠️ Resultado inesperado:', result.trace);
  }
  console.log('====================================================\n');
}

testBelgicaRepeat().catch(console.error);
