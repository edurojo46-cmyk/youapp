import dotenv from 'dotenv';
dotenv.config();

const MEILI_URL = 'http://127.0.0.1:7701';
const INDEX_UID = 'atlas_people_discovery_gate32_delta';

async function main() {
  console.log('================================================================');
  console.log('⚡ VERIFYING 6-FIELD REAL-DOCUMENT SEARCH CONTRACT');
  console.log('================================================================\n');

  const fields = [
    'search_text_normalized',
    'display_name',
    'display_name_normalized',
    'organization',
    'role',
    'profession'
  ];

  // Fetch index settings
  const setRes = await fetch(`${MEILI_URL}/indexes/${INDEX_UID}/settings`);
  const settings = await setRes.json();
  console.log('Searchable Attributes:', settings.searchableAttributes);
  console.log('Primary Key:', (await (await fetch(`${MEILI_URL}/indexes/${INDEX_UID}`)).json()).primaryKey);

  // For each field, find a document in the index that has that field populated
  const fieldResults = {};
  let passedCount = 0;

  for (const field of fields) {
    // Search for documents having this field
    // In our index, organization/role/profession exist in some documents (e.g. from canary/IGJ or ARCA)
    // Let's do a search or fetch docs
    let testDoc = null;
    let queryTerm = '';

    // Search query or scan
    const searchRes = await fetch(`${MEILI_URL}/indexes/${INDEX_UID}/documents?limit=100`);
    const docs = (await searchRes.json()).results;

    for (const d of docs) {
      if (d[field] && typeof d[field] === 'string' && d[field].trim().length > 2) {
        testDoc = d;
        break;
      }
    }

    if (!testDoc) {
      // Try searching with query
      const sRes = await fetch(`${MEILI_URL}/indexes/${INDEX_UID}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: 'NACIONAL', limit: 10 })
      });
      const hits = (await sRes.json()).hits;
      for (const h of hits) {
        if (h[field] && typeof h[field] === 'string' && h[field].trim().length > 2) {
          testDoc = h;
          break;
        }
      }
    }

    if (!testDoc) {
      // Check documents with offset
      const sRes2 = await fetch(`${MEILI_URL}/indexes/${INDEX_UID}/documents?offset=1000&limit=100`);
      const hits2 = (await sRes2.json()).results;
      for (const h of hits2) {
        if (h[field] && typeof h[field] === 'string' && h[field].trim().length > 2) {
          testDoc = h;
          break;
        }
      }
    }

    if (!testDoc) {
      console.error(`FAILED to find document with field: ${field}`);
      fieldResults[field] = { status: 'MISSING_FIELD' };
      continue;
    }

    // Pick a distinct word from testDoc[field]
    const words = testDoc[field].split(/\s+/).filter(w => w.length >= 4);
    queryTerm = words[0] || testDoc[field].substring(0, 5);

    // Perform real search
    const queryRes = await fetch(`${MEILI_URL}/indexes/${INDEX_UID}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: queryTerm, limit: 10 })
    });
    const queryJson = await queryRes.json();
    const foundDoc = queryJson.hits.some(h => h.atlas_person_id === testDoc.atlas_person_id);

    fieldResults[field] = {
      tested_field: field,
      doc_id: testDoc.atlas_person_id,
      field_value: testDoc[field],
      query_term: queryTerm,
      hits_count: queryJson.hits.length,
      doc_found_in_hits: foundDoc,
      status: foundDoc ? 'PASS' : 'FAIL'
    };

    if (foundDoc) passedCount++;
    console.log(`Field '${field}': ${foundDoc ? 'PASS' : 'FAIL'} (query: '${queryTerm}', hits: ${queryJson.hits.length})`);
  }

  const coverageStr = `${passedCount}/${fields.length}`;
  const parityStr = `${((passedCount / fields.length) * 100).toFixed(0)}%`;

  console.log('\n================================================================');
  console.log(`SEARCH_FIELD_COVERAGE:  ${coverageStr}`);
  console.log(`SEARCH_CONTRACT_PARITY: ${parityStr}`);
  console.log('================================================================\n');

  console.log(JSON.stringify(fieldResults, null, 2));
}

main().catch(console.error);
