import dotenv from 'dotenv';
dotenv.config();

import { GeminiGroundedPersonDiscoveryProvider } from '../src/lib/search/adapters/GeminiGroundedPersonDiscoveryProvider';

async function testComerciante() {
  const provider = new GeminiGroundedPersonDiscoveryProvider();
  const res = await provider.discover('comerciante en CABA', {
    requiredLocation: 'CABA',
    requiredProfession: 'Comerciante'
  });

  console.log('Candidates found:', res.candidates.length);
  for (const c of res.candidates) {
    console.log(`- [${c.entityType}] ${c.fullName || c.businessName} (${c.professionClaim}) in ${c.geographyClaim}`);
  }
  console.log('Businesses found:', res.businesses.length);
  for (const b of res.businesses) {
    console.log(`- [BUSINESS] ${b.businessName} in ${b.geographyClaim}`);
  }
}

testComerciante();
