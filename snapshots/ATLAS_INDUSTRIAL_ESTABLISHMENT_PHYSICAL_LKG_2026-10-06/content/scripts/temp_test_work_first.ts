import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';
import { ConicetWorkFirstResolver } from '../src/lib/search/conicet/ConicetWorkFirstResolver';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function testResolver() {
  const resolver = new ConicetWorkFirstResolver('contact@youapp.com');

  // Load 5 sample unresolved CONICET candidates
  const { data: candidates, error } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('discovery_id, display_name, person_source_url, source_record_id, organization, location_evidence')
    .eq('source_id', 'CONICET_OAI_PMH')
    .limit(5);

  if (error || !candidates) {
    console.error('Error loading candidates:', error);
    return;
  }

  console.log(`Loaded ${candidates.length} candidates for pre-testing.\n`);

  for (const c of candidates) {
    console.log(`Resolving: "${c.display_name}" (${c.person_source_url})`);
    const res = await resolver.resolveCandidate(c);
    console.log({
      discovery_id: res.discovery_id,
      display_name: res.display_name,
      work_resolved: res.work_resolved,
      work_doi: res.work_doi,
      work_year: res.work_year,
      identity_confidence: res.identity_confidence,
      matched_author: res.matched_author ? `${res.matched_author.given} ${res.matched_author.family}` : null,
      matched_orcid: res.matched_orcid,
      territorial_state: res.territorial_state,
      status: res.status,
      evidence_summary: res.evidence_summary
    });
    console.log('----------------------------------------------------');
  }
}

testResolver();
