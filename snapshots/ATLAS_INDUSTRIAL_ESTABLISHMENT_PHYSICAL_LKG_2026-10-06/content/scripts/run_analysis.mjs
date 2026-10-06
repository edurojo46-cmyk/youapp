import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
let url = '', key = '';
for (const l of env.split('\n')) {
  if (l.startsWith('VITE_SUPABASE_URL=')) url = l.split('=').slice(1).join('=').trim().replace(/['"]/g, '');
  if (l.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) key = l.split('=').slice(1).join('=').trim().replace(/['"]/g, '');
}
const sb = createClient(url, key, { auth: { persistSession: false } });

async function run() {
  const query = `
    WITH missing_rows AS (
        SELECT source_id, source_record_id, discovery_id
        FROM public.atlas_people_discovery_candidates
        WHERE social_profiles IS NULL 
           OR jsonb_array_length(social_profiles) = 0
    ),
    identity_matches AS (
        SELECT 
            m.discovery_id,
            map.atlas_person_id
        FROM missing_rows m
        LEFT JOIN public.atlas_person_identity_map map 
          ON m.source_id = map.source_id 
          AND m.source_record_id = map.source_person_id
    ),
    match_stats AS (
        SELECT 
            discovery_id,
            COUNT(atlas_person_id) as match_count,
            COUNT(DISTINCT atlas_person_id) as distinct_person_ids
        FROM identity_matches
        GROUP BY discovery_id
    ),
    classification AS (
        SELECT 
            m.discovery_id,
            CASE
                WHEN ms.match_count = 0 THEN 'REPAIR_NO_MATCH'
                WHEN ms.match_count = 1 THEN 'REPAIR_SINGLE_CANONICAL_MATCH'
                WHEN ms.distinct_person_ids = 1 THEN 'REPAIR_MULTIPLE_SAME_CANONICAL_ID'
                ELSE 'REPAIR_CONFLICTING_CANONICAL_IDS'
            END as status
        FROM missing_rows m
        JOIN match_stats ms ON m.discovery_id = ms.discovery_id
    )
    SELECT status, COUNT(*) as count 
    FROM classification 
    GROUP BY status;
  `;
  const { data, error } = await sb.rpc('exec_sql', { query });
  if (error) console.error('Error:', error);
  else console.log('Result:', data);
}
run();
