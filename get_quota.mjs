import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const supabaseKey = 'sb_publishable_IWSDC0aWUR8cvOPrwYSaqg_JU8aASm8';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase.from('quota_daily').select('*');
  console.log('quota_daily:', data, error);
}

run();
