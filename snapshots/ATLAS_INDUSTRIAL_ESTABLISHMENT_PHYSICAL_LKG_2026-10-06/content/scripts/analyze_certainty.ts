import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL as string,
  (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) as string
);

async function analyzeCurrentRecords() {
  const { data: records, error } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('*');

  if (error || !records) {
    console.error('Error:', error);
    return;
  }

  console.log(`TOTAL RECORDS: ${records.length}`);

  const bySource: Record<string, number> = {};
  for (const r of records) {
    bySource[r.source_id] = (bySource[r.source_id] || 0) + 1;
  }
  console.log('BY SOURCE:', bySource);

  // Evaluate certainty level:
  // - CROSS_SOURCE_VERIFIED_PERSON: corroborated across >= 2 independent sources
  // - VALIDATED_PERSON: factual roster/registry/direct professional evidence (Wikidata, Conicet, GitHub with email/repos, official news)
  // - ENTITY_CLASSIFIED_AS_PERSON: single social profile classified as human (e.g. YouTube person channel without independent cross-corroboration)
  let classifiedOnly = 0;
  let validated = 0;
  let crossSource = 0;

  for (const r of records) {
    const hasMultipleSources = (r.social_profiles && r.social_profiles.length > 1) || (r.website && r.person_source_url && !r.website.includes(r.source_id.toLowerCase()));
    const isSocialOnly = r.source_id === 'YOUTUBE_PUBLIC' || r.source_id.includes('SOCIAL');
    const isOfficialOrRegistry = r.source_id === 'WIKIDATA_PUBLIC' || r.source_id === 'REFEPS_REGISTRY' || r.source_id === 'CONICET_PUBLIC' || r.source_id === 'IGJ_REGISTRY';
    const isGitHub = r.source_id === 'GITHUB_API';

    if (hasMultipleSources) {
      crossSource++;
    } else if (isOfficialOrRegistry || (isGitHub && (r.public_email || r.website))) {
      validated++;
    } else if (isSocialOnly) {
      classifiedOnly++;
    } else {
      validated++;
    }
  }

  console.log(`\nCERTAINTY BREAKDOWN:`);
  console.log(`ENTITY_CLASSIFIED_AS_PERSON: ${classifiedOnly}`);
  console.log(`VALIDATED_PERSON: ${validated}`);
  console.log(`CROSS_SOURCE_VERIFIED_PERSON: ${crossSource}`);
  console.log(`TOTAL: ${classifiedOnly + validated + crossSource}`);
}

analyzeCurrentRecords().catch(console.error);
