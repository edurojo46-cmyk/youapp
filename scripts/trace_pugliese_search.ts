import { executeSearch } from '../src/lib/search/searchEngine';

async function tracePugliese() {
  console.log('--- EXECUTING SEARCH ENGINE TRACE FOR: "osvaldo pugliese la yumba en el colon" ---');
  const res = await executeSearch('osvaldo pugliese la yumba en el colon', {
    trafficClass: 'organic'
  });
  console.log('Result count:', res.videos?.length || 0);
}

tracePugliese().catch(console.error);
