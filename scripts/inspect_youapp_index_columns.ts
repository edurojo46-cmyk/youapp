import { supabase } from '../src/lib/supabase';

async function checkCols() {
  const { data, error } = await supabase
    .from('youapp_index')
    .select('*')
    .limit(1);

  if (data && data.length > 0) {
    console.log('Columns of youapp_index:', Object.keys(data[0]));
  }

  // Try inserting a test bronze row to see any constraint error
  const testRow = {
    provider: 'dailymotion',
    provider_content_id: 'test_bronze_x1',
    video_id: 'test_bronze_x1',
    title: 'Test Bronze Asset',
    url: 'https://www.dailymotion.com/video/test_bronze_x1',
    canonical_url: 'https://www.dailymotion.com/video/test_bronze_x1',
    source: 'federated_bronze',
    content_state: 'ready'
  };

  const { error: insErr } = await supabase.from('youapp_index').insert(testRow);
  console.log('Insert test result:', insErr ? insErr.message : 'SUCCESS!');
  
  if (!insErr) {
    await supabase.from('youapp_index').delete().eq('provider_content_id', 'test_bronze_x1');
  }
}

checkCols();
