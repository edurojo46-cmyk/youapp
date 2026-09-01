import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envContent = fs.readFileSync(path.resolve(process.cwd(), '.env.local'), 'utf-8');
let supabaseUrl = '';
let supabaseKey = '';

envContent.split('\n').forEach(line => {
  if (line.startsWith('VITE_SUPABASE_URL=')) supabaseUrl = line.split('=')[1].trim();
  if (line.startsWith('VITE_SUPABASE_ANON_KEY=')) supabaseKey = line.split('=')[1].trim();
});

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTelemetry() {
  console.log("Checking Telemetry Tables...");

  // 1. Check telemetry_provider_events
  const { count: eventsCount, error: eventsError } = await supabase
    .from('telemetry_provider_events')
    .select('*', { count: 'exact', head: true });

  if (eventsError) {
    console.error("Error querying telemetry_provider_events:", eventsError.message);
  } else {
    console.log(`telemetry_provider_events count: ${eventsCount}`);
  }

  // Distribution of events by provider
  const { data: eventsData, error: eventsDataError } = await supabase
    .from('telemetry_provider_events')
    .select('provider');
    
  if (eventsData && eventsData.length > 0) {
    const distribution: Record<string, number> = {};
    eventsData.forEach(e => {
        distribution[e.provider] = (distribution[e.provider] || 0) + 1;
    });
    console.log("Events by provider:", distribution);
  }

  // 2. Check telemetry_provider_conversion
  const { count: convCount, error: convError } = await supabase
    .from('telemetry_provider_conversion')
    .select('*', { count: 'exact', head: true });

  if (convError) {
    console.error("Error querying telemetry_provider_conversion:", convError.message);
  } else {
    console.log(`telemetry_provider_conversion count: ${convCount}`);
  }

  // 3. Check provider_health_current
  const { count: healthCount, error: healthError } = await supabase
    .from('provider_health_current')
    .select('*', { count: 'exact', head: true });

  if (healthError) {
    console.error("Error querying provider_health_current:", healthError.message);
  } else {
    console.log(`provider_health_current count: ${healthCount}`);
  }

  console.log("\nAttempting to INSERT a test event...");
  const { error: insertError } = await supabase.from('telemetry_provider_events').insert([{
    request_id: 'test-req-123',
    provider: 'atlas',
    status: 'success'
  }]);

  if (insertError) {
    console.error("Failed to insert event (Permissions/RLS issue?):", insertError);
  } else {
    console.log("Successfully inserted test event!");
    
    // Check count again
    const { count: finalCount } = await supabase.from('telemetry_provider_events').select('*', { count: 'exact', head: true });
    console.log(`telemetry_provider_events count AFTER insert: ${finalCount}`);
  }
}

checkTelemetry();
