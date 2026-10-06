import dotenv from 'dotenv';
dotenv.config();

const MEILI_URL = process.env.MEILISEARCH_URL || 'http://127.0.0.1:7700';
const MEILI_KEY = process.env.MEILISEARCH_MASTER_KEY || 'youapp_meilisearch_master_key_2026';

async function main() {
  console.log('Querying Meilisearch at', MEILI_URL);
  try {
    const indexesRes = await fetch(`${MEILI_URL}/indexes`, {
      headers: { 'Authorization': `Bearer ${MEILI_KEY}` }
    });
    const indexes = await indexesRes.json();
    console.log('Indexes:', indexes);

    for (const idx of (indexes.results || [])) {
      const statsRes = await fetch(`${MEILI_URL}/indexes/${idx.uid}/stats`, {
        headers: { 'Authorization': `Bearer ${MEILI_KEY}` }
      });
      const stats = await statsRes.json();
      console.log(`Index ${idx.uid} stats:`, stats);

      // Facet distribution search for geography and province
      const searchRes = await fetch(`${MEILI_URL}/indexes/${idx.uid}/search`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${MEILI_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          q: '',
          facets: ['geography', 'province', 'evidence_state'],
          limit: 0
        })
      });
      const searchData = await searchRes.json();
      console.log(`Index ${idx.uid} facetDistribution:`, searchData.facetDistribution);
    }
  } catch (err) {
    console.error('Meilisearch query failed:', err.message);
  }
}

main().catch(console.error);
