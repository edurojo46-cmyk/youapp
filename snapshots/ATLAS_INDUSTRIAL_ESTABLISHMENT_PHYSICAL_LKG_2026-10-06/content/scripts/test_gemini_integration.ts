import { SmartPersonQueryRouter } from '../src/lib/search/SmartPersonQueryRouter';
import { GeminiGroundedPersonDiscoveryProvider } from '../src/lib/search/adapters/GeminiGroundedPersonDiscoveryProvider';
import { GeminiEvidenceValidator } from '../src/lib/ai/gemini/GeminiEvidenceValidator';

async function runTests() {
  console.log("=== ATLAS GEMINI INTEGRATION TESTS ===");
  
  // Test 1: Camionero
  console.log("\n--- TEST 1: camionero ---");
  let res = await SmartPersonQueryRouter.evaluate("camionero");
  console.log("Deterministic evaluation:", res);
  if (res && res.profession === 'camionero' && res.confidence >= 0.5) {
     console.log("✅ PASS: 'camionero' resolved deterministically to profession.");
  } else {
     console.log("❌ FAIL: 'camionero' did not resolve correctly.");
  }

  // Test 2: empleado CABA
  console.log("\n--- TEST 2: empleado en CABA ---");
  res = await SmartPersonQueryRouter.evaluate("empleado en caba");
  console.log("Deterministic evaluation:", res);
  if (res && res.personCategory === 'WORKER' && res.profession === null && res.location?.jurisdiction === 'CABA') {
     console.log("✅ PASS: 'empleado en caba' resolved deterministically to WORKER and CABA.");
  } else {
     console.log("❌ FAIL: 'empleado en caba' did not resolve correctly.");
  }

  // Test 3: Ambiguous Query (Interpreter)
  console.log("\n--- TEST 3: Ambiguous query (requires Gemini) ---");
  let ambig = await SmartPersonQueryRouter.evaluate("busco un oficinista que viva por el obelisco");
  console.log("Deterministic evaluation (should be null):", ambig);
  if (ambig === null) {
      console.log("✅ PASS: Ambiguous query routed to Gemini.");
  } else {
      console.log("❌ FAIL: Ambiguous query incorrectly resolved deterministically.");
  }
  
  // Test 4: Evidence Validator (Ungrounded candidate rejection)
  console.log("\n--- TEST 4: Evidence Validator ---");
  const ungroundedCandidate = {
      candidateId: "123",
      displayName: "Juan Perez",
      professionClaim: "camionero",
      roleClaim: null,
      organizationClaim: null,
      locationClaim: "CABA",
      evidence: [], // empty evidence
      aiConfidence: 0.99
  };
  
  const isValid = GeminiEvidenceValidator.validate(ungroundedCandidate, { requiredProfession: 'camionero' });
  if (!isValid) {
      console.log("✅ PASS: Ungrounded candidate correctly REJECTED.");
  } else {
      console.log("❌ FAIL: Ungrounded candidate accepted.");
  }

  // Note: Grounded Discovery physical test requires a real API key and the edge function to be deployed/served locally.
  console.log("\n✅ Unit tests completed. Run actual search via UI for integration test.");
}

runTests().catch(console.error);
