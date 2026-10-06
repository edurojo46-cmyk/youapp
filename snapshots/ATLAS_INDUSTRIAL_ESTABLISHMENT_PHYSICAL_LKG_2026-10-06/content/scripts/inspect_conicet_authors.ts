import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const { data: candidates, error } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('discovery_id, display_name, organization, role, location_relation_type, social_profiles')
    .eq('source_id', 'CONICET_OAI_PMH')
    .limit(10);

  if (error) {
    console.error('Error fetching CONICET candidates:', error);
    return;
  }

  console.log(`Fetched ${candidates?.length} samples:`);
  for (const c of candidates || []) {
    console.log(`ID: ${c.discovery_id} | Name: "${c.display_name}" | Org: "${c.organization}" | Rel: "${c.location_relation_type}"`);
    const url = `https://api.openalex.org/authors?search=${encodeURIComponent(c.display_name)}&per_page=1&mailto=contact@youapp.com`;
    try {
      const res = await fetch(url);
      console.log(`  OpenAlex HTTP status: ${res.status}`);
      if (res.ok) {
        const json = await res.json();
        console.log(`  Results count: ${json.results?.length}`);
        if (json.results?.length > 0) {
          console.log(`  Match: ${json.results[0].display_name} (${json.results[0].id})`);
        }
      }
    } catch (e: any) {
      console.log(`  Fetch error: ${e.message}`);
    }
  }
}

main().catch(console.error);
