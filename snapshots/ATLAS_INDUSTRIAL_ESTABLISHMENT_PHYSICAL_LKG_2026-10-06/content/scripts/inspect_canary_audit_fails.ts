import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function inspectFails() {
  const { data, error } = await supabase
    .from('atlas_people_resolution_items')
    .select('discovery_id, status, territorial_state, metadata')
    .order('completed_at', { ascending: false })
    .limit(200);

  if (error) throw error;

  console.log(`Loaded ${data.length} resolution items from PostgreSQL.`);

  // Find cases with name overlap failure
  for (const item of data) {
    const meta = item.metadata || {};
    const discId = item.discovery_id;

    // Fetch candidate name
    const { data: cand } = await supabase
      .from('atlas_people_discovery_candidates')
      .select('display_name')
      .eq('discovery_id', discId)
      .single();

    const target = cand?.display_name || '';
    const matched = meta.matched_author || '';

    const targetNorm = target.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    const matchedNorm = matched.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

    const tokensTarget = targetNorm.split(' ').filter(t => t.length > 1);
    const tokensMatched = matchedNorm.split(' ').filter(t => t.length > 1);
    const overlap = tokensTarget.filter(t => tokensMatched.includes(t));

    if (matched && overlap.length === 0) {
      console.log('--- FOUND AUDIT FAIL ---');
      console.log('Discovery ID:', discId);
      console.log('Target Name:', target, `(tokens: ${tokensTarget.join(', ')})`);
      console.log('Matched Author:', matched, `(tokens: ${tokensMatched.join(', ')})`);
      console.log('Work DOI:', meta.work_doi);
      console.log('Author Match Method:', meta.author_match_method);
      console.log('Status:', item.status);
      console.log('Territory:', item.territorial_state);
      console.log('------------------------\n');
    }
  }
}

inspectFails().catch(console.error);
