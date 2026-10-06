import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const supabaseKey = process.env.SUPABASE_SECRET_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('=== DATABASE SOURCE AUDIT ===');
  
  const tables = [
    'creator_entities',
    'atlas_people',
    'atlas_person_attribute_evidence',
    'atlas_person_identifiers',
    'seed_sources',
    'atlas_products',
    'videos',
    'youtube_creators',
    'youtube_videos',
    'youtube_channels',
    'organizations',
    'companies',
    'jobs',
    'job_postings',
    'locations',
    'catalog',
    'commerce_orders',
    'demand_signals',
    'atlas_entities',
    'atlas_assertions',
    'atlas_relationships',
    'atlas_evidence',
    'atlas_inferences',
    'atlas_contradictions',
    'atlas_entity_source_observations',
    'atlas_person_profiles'
  ];

  for (const t of tables) {
    try {
      const { count, error } = await supabase.from(t).select('*', { count: 'exact', head: true });
      if (error) {
        continue;
      }
      const { data: sample } = await supabase.from(t).select('*').limit(3);
      const cols = sample && sample.length > 0 ? Object.keys(sample[0]) : [];
      console.log(`\n--- TABLE: ${t} (Count: ${count}) ---`);
      console.log(`Columns: ${cols.join(', ')}`);
      if (sample && sample.length > 0) {
        console.log(`Sample 1:`, JSON.stringify(sample[0], null, 2).slice(0, 500));
      }
    } catch (e: any) {
      console.log(`Error on ${t}: ${e.message}`);
    }
  }
}

main().catch(console.error);
