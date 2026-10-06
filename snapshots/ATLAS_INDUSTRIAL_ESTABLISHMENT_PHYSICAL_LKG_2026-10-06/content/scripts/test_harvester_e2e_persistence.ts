import 'dotenv/config';
import { OrganizationWebsiteHarvester } from '../src/lib/atlasHarvester/people/OrganizationWebsiteHarvester';
import { supabase } from '../src/lib/supabase';

async function runE2E() {
  console.log("=== ATLAS V2 ORGANIZATION HARVESTER E2E PERSISTENCE ===");
  
  // We use Vercel as it consistently returns a deterministic result for Guillermo Rauch
  const domain = 'vercel.com';
  const name = 'Vercel';
  
  const harvester = new OrganizationWebsiteHarvester(domain, name);
  
  // 1. Fetch & Parse
  console.log("\n[Run 1] Fetching and Parsing...");
  const rawData = await harvester.fetch();
  const parsedData = await harvester.parse(rawData);
  const observations = await harvester.normalize(parsedData);
  
  const sourcePeopleParsed = observations.length;
  console.log(`SOURCE_PEOPLE_PARSED = ${sourcePeopleParsed}`);

  if (sourcePeopleParsed === 0) {
      console.log("No people parsed, cannot test E2E. Exiting.");
      return;
  }

  // 2. Insert into DB (Emulate Harvester emitObservations)
  console.log("\n[Run 1] Inserting Observations into DB...");
  const initialMetrics = harvester.reportMetrics();
  await harvester.emitObservations(observations);
  const postInsertMetrics = harvester.reportMetrics();
  const observationsInserted = postInsertMetrics.rowsInserted - initialMetrics.rowsInserted;
  
  console.log(`OBSERVATIONS_INSERTED = ${observationsInserted}`);

  // 3. Replay Idempotency
  console.log("\n[Run 2] Replaying for Idempotency...");
  const harvesterRun2 = new OrganizationWebsiteHarvester(domain, name);
  await harvesterRun2.emitObservations(observations); // emitting the exact same observations
  const run2Metrics = harvesterRun2.reportMetrics();
  
  // In Supabase, an upsert without conflict returns the row, but if we want to track true "new" rows, 
  // we would check if the created_at == updated_at. Our metrics just count successful upserts.
  // To truly prove idempotency, we can count total rows in DB for this source before and after.
  
  const { count: countBefore } = await supabase
      .from('atlas_person_observations')
      .select('*', { count: 'exact', head: true })
      .eq('source_system', 'ORGANIZATION_WEBSITE');
      
  await harvesterRun2.emitObservations(observations);

  const { count: countAfter } = await supabase
      .from('atlas_person_observations')
      .select('*', { count: 'exact', head: true })
      .eq('source_system', 'ORGANIZATION_WEBSITE');

  const secondRunNewObservations = (countAfter || 0) - (countBefore || 0);
  console.log(`SECOND_RUN_NEW_OBSERVATIONS = ${secondRunNewObservations}`);

  // 4. Search Projection
  // Check if it reached atlas_people (Identity Resolution)
  console.log("\n[Identity Resolution Check]");
  // Assuming atlas_person_observations has a trigger or a background job that resolves to atlas_people.
  // We'll just check if it exists in atlas_people based on the observation.
  const { data: peopleData } = await supabase
      .from('atlas_people')
      .select('*')
      .eq('current_company', name);
      
  console.log(`SEARCHABLE_RESULTS (in atlas_people) = ${peopleData?.length || 0}`);

  console.log("\n=== E2E REPORT ===");
  if (secondRunNewObservations === 0 && observationsInserted > 0) {
      console.log("[SUCCESS] E2E PERSISTENCE AND IDEMPOTENCY PROVEN.");
  } else {
      console.log("[FAILED] Idempotency failed or no observations inserted.");
  }
}

runE2E().catch(console.error);
