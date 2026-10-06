import 'dotenv/config';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const envContent = fs.readFileSync('.env', 'utf8');
let url = '', serviceKey = '';
for (const line of envContent.split('\n')) {
  if (line.startsWith('VITE_SUPABASE_URL=')) url = line.split('=').slice(1).join('=').trim().replace(/['"]/g, '');
  if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) serviceKey = line.split('=').slice(1).join('=').trim().replace(/['"]/g, '');
}
const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

// Read the updated migration SQL
let sql = fs.readFileSync('supabase/migrations/20260917000001_atlas_search_people_unified_v2.sql', 'utf8');

// Replace Step C1 condition to include search_text_normalized
sql = sql.replace(
  `WHERE (c.display_name ILIKE ('%' || v_clean_q || '%') OR (v_accented_q IS NOT NULL AND c.display_name ILIKE ('%' || v_accented_q || '%')))`,
  `WHERE (c.display_name ILIKE ('%' || v_clean_q || '%') OR c.search_text_normalized ILIKE ('%' || lower(v_clean_q) || '%') OR (v_accented_q IS NOT NULL AND (c.display_name ILIKE ('%' || v_accented_q || '%') OR c.search_text_normalized ILIKE ('%' || lower(v_accented_q) || '%'))))`
);

async function main() {
  console.log('Applying atlas_search_people_unified_v2 with normalized search matching...');
  const { data, error } = await supabase.rpc('exec_sql', { query: sql });
  if (error) {
    console.error('Migration error:', error);
    process.exit(1);
  }
  console.log('✅ Migration applied successfully!');

  // Test Pavon search now
  const { data: res } = await supabase.rpc('atlas_search_people_unified_v2', {
    p_query: 'Pavon Brenda Nayla',
    p_evidence_state: 'ALL_ARGENTINA',
    p_limit: 5
  });
  console.log('Pavon Brenda Nayla search test:', res);
}

main().catch(console.error);
