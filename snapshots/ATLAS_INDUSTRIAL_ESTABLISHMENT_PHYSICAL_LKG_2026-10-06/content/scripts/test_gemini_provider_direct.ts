import dotenv from 'dotenv';
dotenv.config();
import { GeminiGroundedPersonDiscoveryProvider } from '../src/lib/search/adapters/GeminiGroundedPersonDiscoveryProvider.js';

async function main() {
  const p = new GeminiGroundedPersonDiscoveryProvider();
  console.log('Provider initialized');

  console.log('\n--- TESTING "comerciante en CABA" ---');
  const res1 = await p.discover('comerciante en CABA', { requiredLocation: 'CABA', profession: 'comerciante' });
  console.log('Telemetry 1:', res1.telemetry);
  console.log('Candidates count 1:', res1.candidates.length);
  for (const c of res1.candidates) {
    console.log(`  - ${c.displayName} (${c.professionClaim}) @ ${c.locationClaim} [${c.evidence[0]?.url}]`);
  }
  console.log('Businesses count 1:', res1.businesses?.length);

  console.log('\n--- TESTING "empleado en CABA" ---');
  const res2 = await p.discover('empleado en CABA', { requiredLocation: 'CABA', profession: 'empleado' });
  console.log('Telemetry 2:', res2.telemetry);
  console.log('Candidates count 2:', res2.candidates.length);
  for (const c of res2.candidates) {
    console.log(`  - ${c.displayName} (${c.professionClaim}) @ ${c.locationClaim} [${c.evidence[0]?.url}]`);
  }
  console.log('Businesses count 2:', res2.businesses?.length);
}

main().catch(console.error);
