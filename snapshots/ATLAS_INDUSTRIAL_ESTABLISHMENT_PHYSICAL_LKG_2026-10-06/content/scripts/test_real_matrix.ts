import { createClient } from '@supabase/supabase-js';
import { FederatedPersonSearch } from '../src/lib/search/FederatedPersonSearch.js';
import dotenv from 'dotenv';

dotenv.config();

const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!);
const fed = new FederatedPersonSearch(undefined, sb);

async function testQuery(name: string, profession: string, location: string) {
  console.log(`\n========================================`);
  console.log(`TESTING: ${profession} en ${location}`);
  console.log(`========================================`);
  
  const res = await fed.search({
    profession,
    location_filter: location,
    structured_location: { jurisdiction: location, city: location },
    query_intent: {
      profession,
      geography: location,
      intent_confidence: 'HIGH'
    }
  }, 'ALL_SOURCES', true);

  const externals = (res.confirmed_matches || []).filter(m => m.origin_status === 'EXTERNAL' || m.origin_status === 'EXTERNAL_LIVE' || (m.external_sources && m.external_sources.length > 0));
  
  console.log(`Atlas Results: ${res.stats.atlas_results}`);
  console.log(`External Results Found: ${res.stats.external_results}`);
  console.log(`Confirmed External Matches: ${externals.length}`);
  
  const domains = new Set<string>();
  for (const m of externals) {
    console.log(` - ${m.display_name} | ${m.profession} | ${m.location || 'N/A'}`);
    if (m.external_data && m.external_data.length > 0) {
      for (const d of m.external_data) {
        console.log(`    URL: ${d.source_url} (Source: ${d.source_system})`);
        if (d.source_system) domains.add(d.source_system);
      }
    }
  }

  return {
    profession,
    location,
    atlasCount: res.stats.atlas_results,
    externalCount: externals.length,
    domains: Array.from(domains)
  };
}

async function run() {
  const q1 = await testQuery("Programador", "PROGRAMADOR", "BUENOS AIRES");
  const q2 = await testQuery("Plomero", "PLOMERO", "CABA");
  const q3 = await testQuery("Médico", "MEDICO", "CABA");
  const q4 = await testQuery("Abogado", "ABOGADO", "CORDOBA");

  console.log(`\n========================================`);
  console.log(`FINAL RESULTS MATRIX`);
  console.log(`========================================`);
  console.log(`PROGRAMADOR_BUENOS_AIRES_EXTERNAL = ${q1.externalCount}`);
  console.log(`PLOMERO_CABA_EXTERNAL = ${q2.externalCount}`);
  console.log(`MEDICO_CABA_EXTERNAL = ${q3.externalCount}`);
  console.log(`ABOGADO_CORDOBA_EXTERNAL = ${q4.externalCount}`);
  
  const allDomains = new Set([...q1.domains, ...q2.domains, ...q3.domains, ...q4.domains]);
  console.log(`TOTAL_REAL_FACTUAL_SOURCE_DOMAINS = ${allDomains.size} (${Array.from(allDomains).join(', ')})`);
}

run().catch(console.error);
