import { supabase } from '../src/lib/supabase';

async function checkIndex() {
  const queries = ['paint it black', 'bohemian rhapsody', 'crimen', 'demoliendo', 'musica ligera', 'seguir viviendo'];
  
  console.log('🔍 Checking physical rows in youapp_index:');
  for (const q of queries) {
    const { data, count, error } = await supabase
      .from('youapp_index')
      .select('id, provider, provider_content_id, title, creator_name, url, source', { count: 'exact' })
      .ilike('title', `%${q}%`)
      .limit(10);
      
    console.log(`\n--- Query: "${q}" (Total matches in physical Atlas: ${count}) ---`);
    if (error) {
      console.log('Error:', error.message);
    } else if (data) {
      for (const row of data) {
        console.log(`[${row.provider}] ${row.provider_content_id} | ${row.title?.slice(0, 50)} | url: ${row.url} | source: ${row.source}`);
      }
    }
  }
}

checkIndex();
