import { FederatedPersonSearch } from '../src/lib/search/FederatedPersonSearch';

async function run() {
  const engine = new FederatedPersonSearch();
  console.log('Testing Federated Search: "Software" in "Buenos Aires"');
  
  const results = await engine.search({
    profession: 'Software',
    location: 'Buenos Aires',
  }, 'EXTERNAL_ONLY', true);

  console.log(`\n--- RESULTADOS ---`);
  console.log(`Stats:`, results.stats);
  console.log(`\nConfirmed Matches:`, results.confirmed_matches.length);
  results.confirmed_matches.forEach(m => console.log(` - ${m.display_name} (${m.profession}) [${m.external_sources.join(',')}]`));
  
  console.log(`\nPotential Matches:`, results.potential_matches.length);
  results.potential_matches.forEach(m => console.log(` - ${m.display_name} (${m.profession}) [${m.external_sources.join(',')}]`));
}

run().catch(console.error);
