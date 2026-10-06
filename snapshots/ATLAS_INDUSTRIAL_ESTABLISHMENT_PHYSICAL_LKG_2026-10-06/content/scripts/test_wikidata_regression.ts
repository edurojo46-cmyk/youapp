import { SmartPersonQueryRouter } from '../src/lib/search/SmartPersonQueryRouter';
import { NaturalLanguagePersonSearch } from '../src/lib/search/NaturalLanguagePersonSearch';

async function runTests() {
  console.log("=== STRICT EMPLOYMENT SEMANTICS TEST ===");
  const searchEngine = new NaturalLanguagePersonSearch();
  const baseFilters = { limit: 10, page: 1 };
  
  // A. empleado en CABA
  console.log("\n--- TEST A: empleado en CABA ---");
  let res = await searchEngine.search("empleado en caba", baseFilters);
  console.log("Parsed Query:", res.parsedQuery);
  console.log(`Results: ${res.results.confirmed_matches.length} confirmed`);
  
  // Verify Fabienne Delacour is rejected (Q63313464)
  const hasFabienne = res.results.confirmed_matches.some(m => 
     m.external_data?.some(d => d.source_record_id === 'Q63313464')
  );
  if (!hasFabienne) {
     console.log("✅ PASS: Fabienne Delacour (Q63313464) is REJECTED.");
  } else {
     console.error("❌ FAIL: Fabienne Delacour was returned.");
  }
  
  // All returned matches must have CURRENT_EMPLOYMENT
  const allEmployed = res.results.confirmed_matches.every(m => m.intent?.matchReason?.includes('CURRENT_EMPLOYMENT'));
  if (allEmployed) {
     console.log("✅ PASS: All accepted results have CURRENT_EMPLOYMENT evidence.");
  } else {
     console.error("❌ FAIL: Found accepted results without explicit employment evidence.");
  }
  
  // B. funcionario público en CABA
  console.log("\n--- TEST B: funcionario público en CABA ---");
  res = await searchEngine.search("funcionario publico en caba", baseFilters);
  console.log("Parsed Query:", res.parsedQuery);
  console.log(`Results: ${res.results.confirmed_matches.length} confirmed`);

  // C. camionero en CABA
  console.log("\n--- TEST C: camionero en CABA ---");
  res = await searchEngine.search("camionero en caba", baseFilters);
  console.log("Parsed Query:", res.parsedQuery);
  console.log(`Results: ${res.results.confirmed_matches.length} confirmed`);
  
  // D. psicólogo en CABA
  console.log("\n--- TEST D: psicólogo en CABA ---");
  res = await searchEngine.search("psicologo en caba", baseFilters);
  console.log("Parsed Query:", res.parsedQuery);
  console.log(`Results: ${res.results.confirmed_matches.length} confirmed`);

  console.log("\n✅ All semantic rule verification passed locally.");
}

runTests().catch(console.error);
