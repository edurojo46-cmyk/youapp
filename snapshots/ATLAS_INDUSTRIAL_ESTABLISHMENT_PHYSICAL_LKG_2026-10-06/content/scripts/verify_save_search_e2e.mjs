import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();
import { parseDbUrl } from './export_search_projection_v2.mjs';

async function main() {
  console.log('--- STARTING E2E VERIFICATION FOR GENERAL SAVE SEARCH (TEST SEGURO 20) ---');
  const pool = new pg.Pool(parseDbUrl());
  const client = await pool.connect();

  const testUserId = '33333333-aaaa-bbbb-cccc-333333333333';
  const baseName = 'Alimentos Certificados';

  try {
    // 0. Clean previous test data for test user
    await client.query('DELETE FROM public.atlas_user_saved_relations WHERE user_id = $1::uuid;', [testUserId]);
    await client.query('DELETE FROM public.atlas_user_bases WHERE user_id = $1::uuid;', [testUserId]);

    // 1. SAFETY INVARIANT TEST: Try to send >20 items to server
    console.log('[STEP 1: SAFETY INVARIANT] Testing that payload > 20 is rejected server-side...');
    const oversizedPayload = Array.from({ length: 25 }, (_, i) => ({
      product_id: `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
      company_id: null,
      relation_id: null
    }));

    const rejectRes = await fetch('http://localhost:5174/api/user/saved-relations/bulk', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': testUserId
      },
      body: JSON.stringify({
        items: oversizedPayload,
        base_name: 'Overflow Test'
      })
    });

    const rejectData = await rejectRes.json();
    console.log('Oversized payload response status:', rejectRes.status, rejectData);
    if (rejectRes.status !== 400 || !rejectData.rejected) {
      throw new Error(`SAFETY INVARIANT FAILED: Server accepted ${oversizedPayload.length} items!`);
    }
    console.log('✓ Server-side invariant PASS: Payload with >20 IDs rejected with HTTP 400.');

    // 2. Real Catalog Search with forced PAGE_SIZE = 20
    console.log('[STEP 2: REAL CATALOG SEARCH] Searching real catalog products with limit = 20...');
    const testQuery = 'Alimentos';
    const searchRes = await fetch('http://localhost:5174/api/industrial-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: testQuery, page: 1, limit: 20 })
    });
    const searchData = await searchRes.json();
    const results = searchData.results || [];
    const totalCount = searchData.totalCount || 0;

    console.log(`Query: "${testQuery}" | Total in catalog: ${totalCount} | Returned for page: ${results.length}`);
    if (totalCount < 20) {
      throw new Error(`Test query "${testQuery}" has fewer than 20 results (got ${totalCount})`);
    }
    if (results.length !== 20) {
      throw new Error(`Expected exactly 20 visible results on page 1, got ${results.length}`);
    }

    // 3. User saves these 20 visible results
    console.log('[STEP 3: SAVE SEARCH] Saving the 20 visible results into Mi base...');
    const visible20 = results.slice(0, 20);
    const saveItems = visible20.map(r => ({
      product_id: r.PRODUCT_ID || r.id,
      company_id: r.COMPANY_ID || null,
      relation_id: r.EVIDENCE_RELATION_ID || null
    }));

    const saveRes = await fetch('http://localhost:5174/api/user/saved-relations/bulk', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': testUserId
      },
      body: JSON.stringify({
        items: saveItems,
        base_name: baseName,
        metadata: {
          original_query: testQuery,
          filters: {},
          sort: 'Producto A-Z',
          total_results_at_save: totalCount
        }
      })
    });

    const saveData = await saveRes.json();
    console.log('Bulk save response:', saveData);
    if (!saveData.success || saveData.savedCount !== 20 || saveData.duplicatesSkipped !== 0) {
      throw new Error(`Expected savedCount: 20, duplicatesSkipped: 0, got ${JSON.stringify(saveData)}`);
    }

    // 4. Open /mi-base and confirm 20 references
    console.log('[STEP 4: VERIFY IN MI BASE] Checking /mi-base records for user...');
    const baseRes = await fetch(`http://localhost:5174/api/user/saved-relations?user_id=${testUserId}&base_name=${encodeURIComponent(baseName)}`);
    const baseData = await baseRes.json();
    console.log(`Mi base retrieved count: ${baseData.count}`);
    if (baseData.count !== 20) {
      throw new Error(`Expected exactly 20 items in Mi base, got ${baseData.count}`);
    }

    // Verify metadata of base
    const metaRes = await fetch(`http://localhost:5174/api/user/bases?user_id=${testUserId}`);
    const metaData = await metaRes.json();
    const matchedBase = (metaData.bases || []).find(b => b.base_name === baseName);
    console.log('Saved Base Metadata:', matchedBase);
    if (!matchedBase || matchedBase.total_results_at_save !== totalCount) {
      throw new Error('Base metadata was not correctly saved');
    }

    // 5. Refresh / Persistence check
    console.log('[STEP 5: REFRESH PERSISTENCE] Simulating page refresh...');
    const refreshRes = await fetch(`http://localhost:5174/api/user/saved-relations?user_id=${testUserId}&base_name=${encodeURIComponent(baseName)}`);
    const refreshData = await refreshRes.json();
    if (refreshData.count !== 20) {
      throw new Error(`Persistence failed on refresh: got ${refreshData.count} instead of 20`);
    }
    console.log('✓ Persistence after refresh confirmed (20 references intact).');

    // 6. Duplicate save prevention check
    console.log('[STEP 6: DUPLICATE SAVE TEST] Repeating same save search operation...');
    const repeatRes = await fetch('http://localhost:5174/api/user/saved-relations/bulk', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': testUserId
      },
      body: JSON.stringify({
        items: saveItems,
        base_name: baseName,
        metadata: {
          original_query: testQuery,
          filters: {},
          sort: 'Producto A-Z',
          total_results_at_save: totalCount
        }
      })
    });
    const repeatData = await repeatRes.json();
    console.log('Repeat save response:', repeatData);
    if (!repeatData.success || repeatData.savedCount !== 0 || repeatData.duplicatesSkipped !== 20) {
      throw new Error(`Duplicate handling failed: expected savedCount: 0, duplicatesSkipped: 20, got: ${JSON.stringify(repeatData)}`);
    }

    const checkTotalAfterDup = await fetch(`http://localhost:5174/api/user/saved-relations?user_id=${testUserId}&base_name=${encodeURIComponent(baseName)}`);
    const checkTotalData = await checkTotalAfterDup.json();
    if (checkTotalData.count !== 20) {
      throw new Error(`Duplicate was created! Count is ${checkTotalData.count}, expected 20.`);
    }
    console.log('✓ Zero duplicates created: exactly 20 records remain.');

    console.log('\n==================================================');
    console.log('ALL E2E REQUIREMENTS & SAFETY INVARIANTS PASSED!');
    console.log('==================================================');
    return {
      testQuery,
      totalCount,
      visibleResults: visible20.length,
      savedCount: saveData.savedCount,
      duplicatesSkipped: repeatData.duplicatesSkipped
    };
  } finally {
    // Clean up
    await client.query('DELETE FROM public.atlas_user_saved_relations WHERE user_id = $1::uuid;', [testUserId]);
    await client.query('DELETE FROM public.atlas_user_bases WHERE user_id = $1::uuid;', [testUserId]);
    client.release();
    pool.end();
  }
}

main().catch(err => {
  console.error('E2E TEST FAILURE:', err);
  process.exit(1);
});
