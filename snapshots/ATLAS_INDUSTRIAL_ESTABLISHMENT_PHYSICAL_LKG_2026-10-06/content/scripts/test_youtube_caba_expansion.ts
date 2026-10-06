import dotenv from 'dotenv';
dotenv.config();

import { YouTubePublicAdapter } from '../src/lib/search/adapters/YouTubePublicAdapter';

async function testYouTube() {
  console.log('=== TEST YOUTUBE PUBLIC CABA EXPANSION ===\n');

  const adapter = new YouTubePublicAdapter();

  const queries = [
    { prof: 'médico', geo: 'Palermo' },
    { prof: 'psicólogo', geo: 'Caballito' },
    { prof: 'arquitecto', geo: 'Belgrano' },
    { prof: 'abogado', geo: 'Recoleta' },
    { prof: 'comerciante', geo: 'Flores' },
    { prof: 'programador', geo: 'Villa Urquiza' }
  ];

  let totalFound = 0;

  for (const q of queries) {
    console.log(`\n--- QUERY: "${q.prof} ${q.geo}" ---`);
    const records = await adapter.fetchPeople({
      profession: q.prof,
      neighborhood: q.geo,
      geography: 'CABA',
      raw_query: `${q.prof} ${q.geo} CABA`
    }, 5);

    console.log(`Found: ${records.length} channels/people`);
    totalFound += records.length;
    for (const r of records) {
      console.log(`  - [${r.display_name}] | Role: ${r.role_claim} | URL: ${r.person_source_url} | LocRelation: ${r.location_relation_type}`);
    }
  }

  console.log(`\nTOTAL YOUTUBE CANDIDATES FOUND: ${totalFound}`);
}

testYouTube().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
