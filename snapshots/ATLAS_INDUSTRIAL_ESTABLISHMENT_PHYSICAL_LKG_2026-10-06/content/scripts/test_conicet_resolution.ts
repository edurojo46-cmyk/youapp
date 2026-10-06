import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';
import https from 'https';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL as string,
  (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) as string
);

const agent = new https.Agent({ rejectUnauthorized: false });
const MAILTO = 'contact@youapp.com';

async function testConicetResolution() {
  console.log('=== FASE B.3: CONICET RESOLUTION ENGINE PREFLIGHT ===\n');

  // Load a random sample of 20 CONICET candidates from Discovery
  const { data: sample, error } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('discovery_id, display_name, organization, role, location_evidence, person_source_url')
    .eq('source_id', 'CONICET_OAI_PMH')
    .limit(20);

  if (error || !sample) {
    throw new Error('Error loading CONICET sample');
  }

  console.log(`Loaded ${sample.length} CONICET candidates from Discovery.`);

  let resolvedCount = 0;
  let withOrcidCount = 0;
  let withCabaAffiliationCount = 0;
  let withContemporaryWorksCount = 0; // 2024-2026 works

  const resolvedExamples = [];

  for (const c of sample) {
    const name = c.display_name;
    const url = `https://api.openalex.org/authors?search=${encodeURIComponent(name)}&mailto=${MAILTO}`;
    try {
      const res = await fetch(url, { agent, headers: { 'User-Agent': 'AtlasHarvester/1.0' } } as any);
      if (!res.ok) continue;
      const json = await res.json();
      const match = json.results?.[0];

      if (match && match.display_name) {
        resolvedCount++;
        const orcid = match.orcid || null;
        if (orcid) withOrcidCount++;

        // Check if last known institution or affiliations include CABA / Buenos Aires / UBA / CONICET
        const insts = (match.affiliations || []).map((a: any) => a.institution?.display_name || '').join('; ') +
          '; ' + (match.last_known_institutions || []).map((i: any) => i.display_name + ' ' + (i.country_code || '')).join('; ');

        const isCaba = /buenos aires|caba|uba|exactas|filo|medicina|italiano|di tella|san andres|conicet/i.test(insts);
        if (isCaba) withCabaAffiliationCount++;

        // Temporal check via works or summary stats
        const currentYear = 2026;
        const worksCount = match.works_count || 0;
        // OpenAlex counts by year
        const countsByYear = match.counts_by_year || [];
        const recentWorks = countsByYear.some((y: any) => y.year >= 2023 && y.works_count > 0);
        if (recentWorks) withContemporaryWorksCount++;

        resolvedExamples.push({
          name,
          openalex_name: match.display_name,
          orcid,
          works_count: worksCount,
          recent_works_2023_2026: recentWorks,
          is_caba_affiliated: isCaba,
          institutions_snippet: insts.slice(0, 100)
        });
      }
    } catch (e: any) {
      console.log(`Error resolving "${name}":`, e.message);
    }
  }

  console.log('\n--- CONICET RESOLUTION PREFLIGHT RESULTS ---');
  console.log(`SAMPLE_SIZE:                  ${sample.length}`);
  console.log(`RESOLVED_IN_OPENALEX:         ${resolvedCount} (${((resolvedCount / sample.length) * 100).toFixed(1)}%)`);
  console.log(`WITH_STRONG_ORCID:            ${withOrcidCount} (${((withOrcidCount / sample.length) * 100).toFixed(1)}%)`);
  console.log(`WITH_CABA_AFFILIATION:        ${withCabaAffiliationCount} (${((withCabaAffiliationCount / sample.length) * 100).toFixed(1)}%)`);
  console.log(`RECENT_WORKS_ACTIVE:          ${withContemporaryWorksCount} (${((withContemporaryWorksCount / sample.length) * 100).toFixed(1)}%)`);

  console.log('\nSample Resolved Entries:');
  console.table(resolvedExamples.slice(0, 5));

  // Projections for the 9,491 CONICET authors
  const totalConicetPool = 9491;
  const projectedResolved = Math.round(totalConicetPool * (resolvedCount / sample.length));
  const projectedOrcid = Math.round(totalConicetPool * (withOrcidCount / sample.length));
  const projectedCabaAffiliated = Math.round(totalConicetPool * (withCabaAffiliationCount / sample.length));
  const projectedActiveContemporary = Math.round(totalConicetPool * (withContemporaryWorksCount / sample.length));

  console.log('\n--- PROYECCIÓN MASIVA PARA LOS 9.491 AUTORES CONICET ---');
  console.log(`AUTORES EXISTENTES EN ATLAS:           ${totalConicetPool}`);
  console.log(`RESOLUBLES VÍA OPENALEX:               ~${projectedResolved}`);
  console.log(`CON IDENTIFICADOR FUERTE (ORCID):      ~${projectedOrcid}`);
  console.log(`CON AFILIACIÓN CABA COMPROBADA:        ~${projectedCabaAffiliated}`);
  console.log(`ACTIVOS CONTEMPORÁNEOS (2023-2026):    ~${projectedActiveContemporary}`);

  return {
    sampleSize: sample.length,
    resolvedCount,
    withOrcidCount,
    withCabaAffiliationCount,
    withContemporaryWorksCount
  };
}

testConicetResolution().catch(console.error);
