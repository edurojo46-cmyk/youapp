import { supabase } from '../src/lib/supabase';

async function checkRecent() {
  const { data, error } = await supabase
    .from('youapp_index')
    .select('id, title, provider, provider_content_id, source, created_at')
    .order('created_at', { ascending: false })
    .limit(10);

  console.log('Recent 10 rows in youapp_index:');
  console.log(data);
}

checkRecent();
