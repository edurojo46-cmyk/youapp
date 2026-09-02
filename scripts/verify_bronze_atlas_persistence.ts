import { supabase } from '../src/lib/supabase';

async function checkBronze() {
  const { data, count, error } = await supabase
    .from('youapp_index')
    .select('id, title, provider, provider_content_id, source, tier', { count: 'exact' })
    .eq('source', 'federated_bronze');

  console.log('🥉 VERIFICACIÓN DE BRONZE ATLAS PERSISTIDO EN youapp_index:');
  console.log(`   ├─ Total filas Bronze persistidas: ${count ?? 0}`);
  if (data && data.length > 0) {
    data.slice(0, 5).forEach((row, i) => {
      console.log(`   ${i + 1}. [${row.provider.toUpperCase()}] ${row.title.slice(0, 50)} | ID: ${row.provider_content_id} | Tier: ${row.tier}`);
    });
  }
}

checkBronze();
