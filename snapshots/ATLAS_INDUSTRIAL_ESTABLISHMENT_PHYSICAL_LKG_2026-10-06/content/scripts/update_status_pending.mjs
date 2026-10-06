import 'dotenv/config';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const envContent = fs.readFileSync('.env', 'utf8');
let url = '', key = '';
for (const line of envContent.split('\n')) {
  if (line.startsWith('VITE_SUPABASE_URL=')) url = line.split('=')[1].trim().replace(/["']/g, '');
  if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) key = line.split('=')[1].trim().replace(/["']/g, '');
}
if (!key) {
  for (const line of envContent.split('\n')) {
    if (line.startsWith('VITE_SUPABASE_ANON_KEY=')) key = line.split('=')[1].trim().replace(/["']/g, '');
  }
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function updateStatus() {
  const { error } = await supabase
    .from('atlas_people_live_metrics')
    .update({
      runtime_status: '10M_REPORTED_PENDING_CANONICAL_REALITY_GATE',
      active_strategy: 'CANONICAL_REALITY_GATE_AUDIT_COMPLETE',
      updated_at: new Date().toISOString()
    })
    .eq('id', 'current');

  if (error) {
    console.error('Error updating status:', error.message);
  } else {
    console.log('Successfully set runtime_status = 10M_REPORTED_PENDING_CANONICAL_REALITY_GATE');
  }
}

updateStatus().catch(console.error);
