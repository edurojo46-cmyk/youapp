import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';
import { ConicetWorkFirstResolver } from '../src/lib/search/conicet/ConicetWorkFirstResolver';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function testTwoCases() {
  console.log('=== TEST RE-PROCESAMIENTO DE LOS 2 CASOS ESPECÍFICOS ===\n');

  const testIds = [
    'disc_conicet_oai_6126722007f08f77', // C. Martín Gómez
    'disc_conicet_oai_3009b69abbc570ad'  // I. Echeverría Huarte
  ];

  const resolver = new ConicetWorkFirstResolver('contact@youapp.com');

  for (const id of testIds) {
    const { data: cand, error } = await supabase
      .from('atlas_people_discovery_candidates')
      .select('discovery_id, display_name, person_source_url, source_record_id, organization, location_evidence')
      .eq('discovery_id', id)
      .single();

    if (error || !cand) {
      throw new Error(`Candidate not found: ${id}`);
    }

    console.log(`Testing [${cand.discovery_id}] - "${cand.display_name}"...`);
    const res = await resolver.resolveCandidate(cand);

    console.log('Result:', {
      display_name: res.display_name,
      work_doi: res.work_doi,
      work_resolved: res.work_resolved,
      crossref_work_resolved: res.crossref_openalex_work_resolved,
      authorship_found_external: res.authorship_target_found_in_external_work,
      matched_author: res.matched_author ? `${res.matched_author.given} ${res.matched_author.family}` : null,
      author_match_method: res.author_match_method,
      author_match_confidence: res.author_match_confidence,
      identity_resolved: res.identity_resolved,
      identity_strength: res.identity_strength,
      status: res.status,
      territory: res.territorial_state
    });

    if (!res.crossref_openalex_work_resolved) {
      throw new Error(`Expected work to be resolved for ${cand.display_name}`);
    }

    if (!res.authorship_target_found_in_external_work) {
      throw new Error(`Expected authorship target to be found in external work for ${cand.display_name}`);
    }

    if (res.author_match_method !== 'AUTHORSHIP_EXACT_NAME') {
      throw new Error(`Expected AUTHORSHIP_EXACT_NAME for ${cand.display_name}, got ${res.author_match_method}`);
    }

    console.log(`✓ Case ${cand.display_name}: NAME_NORMALIZATION_EQUIVALENCE = PASS (matched author: ${res.matched_author?.given} ${res.matched_author?.family})\n`);
  }

  console.log('>>> REEVALUACIÓN DE LOS 2 CASOS: 100% PASS <<<');
}

testTwoCases().catch(err => {
  console.error('Error testing two cases:', err);
  process.exit(1);
});
