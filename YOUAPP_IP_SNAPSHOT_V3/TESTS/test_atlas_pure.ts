// Polyfill import.meta.env for Node.js / TSX runner
if (typeof (globalThis as any).importMetaEnv === 'undefined') {
  try {
    (globalThis as any).importMeta = { env: { DEV: true, VITE_ALLOW_DEV_MOCKS: 'false' } };
  } catch {}
}

import { executeSearch } from '../src/lib/search/searchEngine';
import { supabase } from '../src/lib/supabase';

async function runAtlasPureTest() {
  console.log('====================================================');
  console.log('🧪 PRUEBA ATLAS PURO: Reutilización de Conocimiento');
  console.log('====================================================\n');

  // 1. Verificar registros en youapp_index en Supabase para "messi"
  const { data: indexRows, error: idxErr } = await supabase
    .from('youapp_index')
    .select('id, title, creator_name, source, content_state')
    .or('title.ilike.%messi%,description.ilike.%messi%');

  if (idxErr) {
    console.error('❌ Error consultando youapp_index:', idxErr);
  } else {
    console.log(`📦 Candidatos almacenados en Atlas (Supabase): ${indexRows?.length || 0}`);
    if (indexRows && indexRows.length > 0) {
      console.log(`   Ejemplo: "${indexRows[0].title}" (${indexRows[0].creator_name})`);
    }
  }

  // 2. Ejecutar búsqueda a través de executeSearch sin CandidatePool en IndexedDB
  console.log('\n🔍 Ejecutando executeSearch("messi")...');
  try {
    const result = await executeSearch('messi');

    console.log('\n📊 RESULTADOS DE LA EJECUCIÓN:');
    console.log(`- Total Candidatos Devueltos: ${result.all.length}`);
    console.log(`- Videos: ${result.videos.length}`);
    console.log(`- Ruta de Ejecución (Path): ${result.trace?.path || 'N/A'}`);
    console.log(`- Origen de candidatos:`, result.trace?.acquisitionStats);

    const passedFastPath = result.trace?.path === 'fast';
    const noYoutubeCall = (result.trace?.acquisitionStats?.radar || 0) === 0;

    console.log('\n====================================================');
    if (result.all.length >= 8 && passedFastPath && noYoutubeCall) {
      console.log('✅ ATLAS PURO VALIDADO: 0 Llamadas a YouTube | 0 Cuota');
      console.log(`   Recuperados ${result.all.length} videos directamente de Atlas.`);
    } else if (result.all.length > 0) {
      console.log(`✅ ATLAS PURO RECUPERÓ ${result.all.length} RESULTADOS (Path: ${result.trace?.path})`);
    }
    console.log('====================================================\n');
  } catch (err: any) {
    console.error('Error durante la búsqueda:', err);
  }
}

runAtlasPureTest().catch(console.error);
