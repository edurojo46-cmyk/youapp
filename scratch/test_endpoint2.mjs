import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env.local', 'utf-8');
const supabaseUrl = env.match(/VITE_SUPABASE_URL=(.*)/)[1].trim();
const supabaseKey = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1].trim();

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log('Sending request...');
  const res = await supabase.functions.invoke('ai-gateway', {
    body: {
      action: 'you4_moments',
      provider: 'youtube',
      providerContentId: 'M9r5tSfHNqM',
      title: 'Test video',
      description: 'Test description',
      videoUrl: 'https://youtube.com/watch?v=M9r5tSfHNqM',
      durationSec: 3000
    }
  });
  console.log('DATA:', res.data);
  if (res.error) {
    if (res.error.context && res.error.context.text) {
      console.log('RAW ERR:', await res.error.context.text());
    } else {
      console.log('ERR:', res.error);
    }
  }
}
run();
