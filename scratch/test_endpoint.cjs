const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({path: '.env.local'});
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  console.log('Sending request...');
  const res = await supabase.functions.invoke('ai-gateway', {
    body: {
      action: 'you4_moments',
      provider: 'youtube',
      providerContentId: 'M9r5tSfHNqM'
    }
  });
  console.log('DATA:', res.data);
  console.log('ERR:', res.error);
}
run();
