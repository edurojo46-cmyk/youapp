import { supabase } from '../src/lib/supabase';

async function testPlanDiscovery() {
  console.log('Testing plan_discovery on deployed ai-gateway...');
  const t0 = Date.now();
  const { data, error } = await supabase.functions.invoke('ai-gateway', {
    body: {
      action: 'plan_discovery',
      prompt: 'Generate discovery plan for query: "osvaldo pugliese la yumba en el colon"'
    }
  });
  console.log(`Latency: ${Date.now() - t0}ms`);
  console.log('Error:', error);
  console.log('Data:', typeof data === 'object' ? JSON.stringify(data, null, 2) : data);
}

testPlanDiscovery().catch(console.error);
