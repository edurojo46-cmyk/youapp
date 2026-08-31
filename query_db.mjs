import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env.local', 'utf-8');
const env = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1]] = match[2].trim();
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function run() {
  console.log("=== youapp_index STATS ===");

  const { count } = await supabase.from('youapp_index').select('*', { count: 'exact', head: true });
  console.log(`Total rows: ${count}`);

  const { data: messiData } = await supabase.from('youapp_index')
    .select('provider, source, title')
    .ilike('title', '%messi%')
    .limit(30);

  console.log(`\nMessi results (${messiData?.length || 0}):`);
  messiData?.forEach(m => {
    console.log(`- [${m.provider}] (${m.source}): ${m.title}`);
  });

  const { data: allData } = await supabase.from('youapp_index').select('source').limit(10000);
  const dist = {};
  allData?.forEach(d => {
     dist[d.source] = (dist[d.source] || 0) + 1;
  });
  console.log("\nSource distribution (sample):");
  Object.entries(dist).sort((a,b) => b[1] - a[1]).forEach(([k,v]) => console.log(`${k}: ${v}`));
}

run();
