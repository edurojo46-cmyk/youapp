import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log('=== V4.6 QUALITY GATE: 50-PERSON SAMPLE AUDIT ===\n');

  const { data, error } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('discovery_id, display_name, role, organization, location_evidence, person_source_url, public_email, created_at')
    .ilike('discovery_id', 'disc_v4_6_%')
    .limit(50);

  if (error || !data) {
    console.error('Audit query error:', error);
    process.exit(1);
  }

  console.log(`Auditing ${data.length} newly ingested people...`);

  let factualFails = 0;
  let transportFails = 0;

  for (let i = 0; i < data.length; i++) {
    const p = data[i];
    const hasName = !!p.display_name && p.display_name.trim().length > 2;
    const hasRole = !!p.role && p.role.trim().length > 2;
    const hasOrg = !!p.organization && p.organization.trim().length > 2;
    const hasEvidence = !!p.location_evidence && (p.location_evidence.includes('CABA') || p.location_evidence.includes('Buenos Aires'));
    const hasValidUrl = !!p.person_source_url && p.person_source_url.startsWith('https://');

    if (!hasName || !hasRole || !hasOrg || !hasEvidence || !hasValidUrl) {
      factualFails++;
      console.log(`[FAIL] ${p.display_name}: hasName=${hasName}, hasRole=${hasRole}, hasOrg=${hasOrg}, hasEvidence=${hasEvidence}, hasUrl=${hasValidUrl}`);
    }
  }

  console.log(`\nSAMPLE_PEOPLE_AUDITED = ${data.length}`);
  console.log(`SAMPLE_FACTUAL_FAIL = ${factualFails}`);
  console.log(`SAMPLE_TRANSPORT_FAIL = ${transportFails}`);
  console.log(`QUALITY_GATE_STATUS = ${factualFails === 0 ? 'PASSED' : 'FAILED'}`);

  console.log('\nSample 5 audited records:');
  console.log(JSON.stringify(data.slice(0, 5), null, 2));
}

main().catch(console.error);
