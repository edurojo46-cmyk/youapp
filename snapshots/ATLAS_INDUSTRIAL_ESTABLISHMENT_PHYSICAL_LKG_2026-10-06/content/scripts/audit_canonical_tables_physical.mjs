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

async function auditCanonicalTables() {
  console.log('================================================================');
  console.log('AUDITORÍA FÍSICA DIRECTA DE TABLAS EN POSTGRESQL (SUPABASE)');
  console.log('================================================================\n');

  // 1. atlas_person_identity_map
  const { count: mapCount, error: mapErr } = await supabase
    .from('atlas_person_identity_map')
    .select('*', { count: 'exact', head: true });
  console.log(`1. atlas_person_identity_map:`);
  console.log(`   - COUNT(*): ${mapCount} ${mapErr ? `(Error: ${mapErr.message})` : ''}`);

  // Sample distinct atlas_person_id in identity map
  const { data: sampleMap } = await supabase
    .from('atlas_person_identity_map')
    .select('atlas_person_id, source_id, identifier_type, confidence')
    .limit(10);
  console.log(`   - Sample Rows:`, sampleMap?.slice(0, 3));

  // 2. atlas_canonical_entities
  const { count: canCount, error: canErr } = await supabase
    .from('atlas_canonical_entities')
    .select('*', { count: 'exact', head: true });
  console.log(`\n2. atlas_canonical_entities:`);
  console.log(`   - COUNT(*): ${canCount} ${canErr ? `(Error: ${canErr.message})` : ''}`);

  // 3. atlas_people
  const { count: peopleCount, error: peopleErr } = await supabase
    .from('atlas_people')
    .select('*', { count: 'exact', head: true });
  console.log(`\n3. atlas_people:`);
  console.log(`   - COUNT(*): ${peopleCount} ${peopleErr ? `(Error: ${peopleErr.message})` : ''}`);

  // 4. atlas_people_discovery_candidates
  const { count: candCount, error: candErr } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('*', { count: 'exact', head: true });
  console.log(`\n4. atlas_people_discovery_candidates:`);
  console.log(`   - COUNT(*): ${candCount} ${candErr ? `(Error: ${candErr.message})` : ''}`);

  // 5. atlas_person_observations
  const { count: obsCount, error: obsErr } = await supabase
    .from('atlas_person_observations')
    .select('*', { count: 'exact', head: true });
  console.log(`\n5. atlas_person_observations:`);
  console.log(`   - COUNT(*): ${obsCount} ${obsErr ? `(Error: ${obsErr.message})` : ''}`);

  // 6. atlas_people_live_metrics
  const { data: metricsData, error: metricsErr } = await supabase
    .from('atlas_people_live_metrics')
    .select('*');
  console.log(`\n6. atlas_people_live_metrics:`);
  console.log(`   - Rows: ${metricsData?.length}`);
  console.log(`   - unique_people: ${metricsData?.[0]?.unique_people}`);
  console.log(`   - verified_entities: ${metricsData?.[0]?.verified_entities}`);
  console.log(`   - indexed_entities: ${metricsData?.[0]?.indexed_entities}`);
  console.log(`   - index_version: ${metricsData?.[0]?.index_version}`);
}

auditCanonicalTables().catch(console.error);
