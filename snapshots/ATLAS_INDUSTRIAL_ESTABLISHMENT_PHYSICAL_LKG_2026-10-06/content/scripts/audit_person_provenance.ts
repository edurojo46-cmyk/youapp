import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';

const url = process.env.VITE_SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SECRET_KEY || '';
const client = createClient(url, serviceKey);

async function query(sql: string) {
  const { data, error } = await client.rpc('exec_sql', { sql });
  if (error) {
    console.error(`Error executing ${sql}:`, error.message);
    return null;
  }
  return data;
}

async function main() {
  console.log('=== ATLAS PERSON DATA PROVENANCE AUDIT ===\n');

  // 1. TOTAL POPULATION
  const { count: totalPersons } = await client.from('atlas_people').select('*', { count: 'exact', head: true });
  console.log('TOTAL_PERSONS =', totalPersons);

  // Check how many tenants exist
  const { data: tenants } = await client.from('atlas_people').select('tenant_id');
  const tenantCounts: Record<string, number> = {};
  tenants?.forEach(t => { tenantCounts[t.tenant_id] = (tenantCounts[t.tenant_id] || 0) + 1; });
  console.log('TOTAL_TENANTS =', Object.keys(tenantCounts).length);
  console.log('\nTENANT DISTRIBUTION:');
  Object.entries(tenantCounts).sort((a, b) => b[1] - a[1]).forEach(([t, c]) => {
    console.log(`  ${t}: ${c} persons`);
  });

  // 2. CARLOS GOMEZ & VALERIA ROSSI DUPLICATES
  console.log('\n--- CARLOS GOMEZ ---');
  const { data: carlosData } = await client.from('atlas_people').select('tenant_id').ilike('full_name', '%Carlos Gomez%');
  console.log(`CARLOS_GOMEZ_TOTAL = ${carlosData?.length || 0}`);
  const carlosTenants = new Set(carlosData?.map(r => r.tenant_id));
  console.log(`CARLOS_GOMEZ_TENANTS = ${carlosTenants.size}`);

  console.log('\n--- VALERIA ROSSI ---');
  const { data: valeriaData } = await client.from('atlas_people').select('tenant_id').ilike('full_name', '%Valeria Rossi%');
  console.log(`VALERIA_ROSSI_TOTAL = ${valeriaData?.length || 0}`);
  const valeriaTenants = new Set(valeriaData?.map(r => r.tenant_id));
  console.log(`VALERIA_ROSSI_TENANTS = ${valeriaTenants.size}`);

  // 3. ATTRIBUTE PROVENANCE
  console.log('\n--- ATTRIBUTE PROVENANCE (atlas_person_attribute_evidence) ---');
  const attributes = ['profession', 'DOB', 'residence_city', 'company', 'role', 'photo_url', 'avatar_url', 'profile_photo'];
  
  for (const attr of attributes) {
    const { data: evData, error } = await client.from('atlas_person_attribute_evidence').select('*').eq('attribute_key', attr);
    if (error) {
      console.error(`ERROR FETCHING ATTR ${attr}:`, error.message);
    }
    if (!evData || evData.length === 0) {
      console.log(`\nAttribute: ${attr} -> 0 records`);
      continue;
    }
    console.log(`\nAttribute: ${attr} -> ${evData.length} total records`);
    const sources: Record<string, number> = {};
    const statuses: Record<string, number> = {};
    evData.forEach(r => {
      sources[r.source || 'UNKNOWN'] = (sources[r.source || 'UNKNOWN'] || 0) + 1;
      statuses[r.verification_status || 'UNKNOWN'] = (statuses[r.verification_status || 'UNKNOWN'] || 0) + 1;
    });
    console.log('  Sources:', sources);
    console.log('  Statuses:', statuses);
    
    // For profession specifically, let's see values
    if (attr === 'profession') {
      const { data: profVals } = await client.from('atlas_person_attribute_evidence').select('normalized_value').eq('attribute_key', 'profession');
      const vals: Record<string, number> = {};
      profVals?.forEach(v => vals[v.normalized_value] = (vals[v.normalized_value] || 0) + 1);
      console.log('  Profession Values:', vals);
    }
  }

  // 4. EVIDENCE SOURCES GLOBALLY
  console.log('\n--- GLOBAL EVIDENCE SOURCES ---');
  const { data: allSources } = await client.from('atlas_person_attribute_evidence').select('source');
  const globalSources: Record<string, number> = {};
  allSources?.forEach(r => {
    globalSources[r.source || 'UNKNOWN'] = (globalSources[r.source || 'UNKNOWN'] || 0) + 1;
  });
  console.log('All Sources Distribution:', globalSources);
}

main().catch(console.error);
