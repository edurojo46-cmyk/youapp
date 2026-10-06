import { executeSearch } from '../src/lib/search/searchEngine';

async function testCortometraje() {
  console.log('====================================================');
  console.log('🧪 TEST: Búsqueda para "cortometraje"');
  console.log('====================================================\n');

  console.log('🔍 Ejecutando executeSearch("cortometraje")...');
  const result = await executeSearch('cortometraje');

  console.log('\n📊 RESULTADOS:');
  console.log(`- Path resultante: ${result.trace?.path}`);
  console.log(`- Total candidatos devueltos: ${result.all.length}`);
  console.log(`- Origen de candidatos:`, result.trace?.acquisitionStats);
  console.log(`- Radar llamado: ${(result.trace?.acquisitionStats?.radar || 0) > 0 ? 'SÍ (Radar fallback legítimo)' : 'NO (Resuelto por Free Discovery/Atlas)'}`);
  console.log('====================================================\n');
}

testCortometraje().catch(console.error);
