import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function testAuthorshipEvidence() {
  console.log('=== TEST DIRECTIVE 5: OPENALEX AUTHORSHIP EVIDENCE ===\n');

  // Sample 5 candidates from OPENALEX_CABA with WORKS_IN / ACTIVE (Current)
  const { data: sample, error } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('discovery_id, display_name, source_record_id, organization, social_profiles')
    .eq('source_id', 'OPENALEX_CABA')
    .eq('location_relation_type', 'WORKS_IN')
    .limit(5);

  if (error || !sample) throw error;

  console.log(`Loaded ${sample.length} sample Current candidates to inspect works authorship:`);

  for (const c of sample) {
    const authorId = c.source_record_id;
    console.log(`\nAuthor: "${c.display_name}" (OpenAlex: ${authorId}, Org: ${c.organization})`);

    // Fetch their most recent work from OpenAlex
    const url = `https://api.openalex.org/works?filter=author.id:${authorId}&sort=publication_year:desc&per_page=1&mailto=contact@youapp.com`;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'YouApp/1.0 (mailto:contact@youapp.com)' } });
      if (!res.ok) {
        console.log(`  Failed to fetch works: ${res.status}`);
        continue;
      }
      const data = await res.json();
      const work = data.results?.[0];
      if (!work) {
        console.log('  No works found.');
        continue;
      }

      console.log(`  Latest Work: "${work.title?.slice(0, 60)}..." (Year: ${work.publication_year}, ID: ${work.id})`);
      // Find the authorship of THIS author in THIS work
      const authorship = (work.authorships || []).find((a: any) => a.author?.id?.includes(authorId));
      if (authorship) {
        const insts = (authorship.institutions || []).map((i: any) => `${i.display_name} (${i.id})`);
        console.log(`  Authorship Institutions for this author:`, insts.length > 0 ? insts : 'None explicitly declared in this work');
        const rawAffils = authorship.raw_affiliation_strings || [];
        console.log(`  Raw affiliation strings:`, rawAffils);
      } else {
        console.log('  Authorship record not found in top author list.');
      }
    } catch (e: any) {
      console.error('  Error:', e.message);
    }
  }
}

testAuthorshipEvidence().catch(console.error);
