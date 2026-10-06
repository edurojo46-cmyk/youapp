import { supabase } from '../src/lib/supabase';

async function checkAtlas() {
  console.log('Querying youapp_index for Calle 13 / La Perla:');

  // Search by title or tags or creator
  const { data, error } = await supabase
    .from('youapp_index')
    .select('id, video_id, title, creator_name, provider, url, source')
    .or('title.ilike.%perla%,title.ilike.%calle 13%')
    .limit(50);

  if (error) {
    console.error('Error querying youapp_index:', error);
    return;
  }

  console.log(`Total matches in youapp_index: ${data?.length || 0}`);
  for (const row of data || []) {
    console.log(`- [${row.provider}] ${row.title} | ID: ${row.video_id} | Source: ${row.source}`);
  }
}

checkAtlas();
