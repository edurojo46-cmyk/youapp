import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();
import { parseDbUrl } from './export_search_projection_v2.mjs';

async function main() {
  console.log('--- STARTING E2E VERIFICATION FOR MI BASE ---');
  const pool = new pg.Pool(parseDbUrl());
  const client = await pool.connect();

  const userA = '11111111-aaaa-bbbb-cccc-111111111111';
  const userB = '22222222-aaaa-bbbb-cccc-222222222222';

  try {
    // 0. Clean any previous test rows for these test users
    await client.query('DELETE FROM public.atlas_user_saved_relations WHERE user_id IN ($1::uuid, $2::uuid);', [userA, userB]);

    // 1. Search product in Atlas catalog
    console.log('[STEP 1] Searching products in Atlas catalog...');
    const searchRes = await fetch('http://localhost:5174/api/industrial-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '', page: 1, limit: 5 })
    });
    const searchData = await searchRes.json();
    console.log('Search response keys:', Object.keys(searchData), 'Result count:', searchData.results?.length, 'Total:', searchData.totalCount);
    const searchResults = searchData.results || searchData.items || [];
    if (searchResults.length === 0) {
      console.log('Search response sample:', JSON.stringify(searchData).substring(0, 300));
      throw new Error('Search returned 0 items');
    }
    const targetItem = searchResults[0];
    const targetProductId = targetItem.PRODUCT_ID || targetItem.id;
    const targetCompanyId = targetItem.COMPANY_ID || null;
    const targetRelationId = targetItem.EVIDENCE_RELATION_ID || null;
    console.log(`Found product: "${targetItem.PRODUCTS?.[0]?.name || targetItem.COMPANY_NAME}" (ID: ${targetProductId})`);

    // 2. Press Guardar for User A
    console.log('[STEP 2] User A presses [Guardar]...');
    const saveRes = await fetch('http://localhost:5174/api/user/saved-relations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userA
      },
      body: JSON.stringify({
        product_id: targetProductId,
        company_id: targetCompanyId,
        relation_id: targetRelationId,
        base_name: 'Mi base'
      })
    });
    const saveData = await saveRes.json();
    console.log('Save response:', saveData);
    if (!saveData.success || !saveData.saved) {
      throw new Error('Failed to save relation for User A');
    }
    const savedRecordId = saveData.id;

    // 3. Open /mi-base for User A and confirm fields
    console.log('[STEP 3] Opening /mi-base for User A...');
    const getResA = await fetch(`http://localhost:5174/api/user/saved-relations?user_id=${userA}`);
    const getDataA = await getResA.json();
    console.log(`User A saved count: ${getDataA.count}`);
    if (getDataA.count !== 1) {
      throw new Error(`Expected 1 item, got ${getDataA.count}`);
    }
    const item = getDataA.items[0];
    console.log('Saved Item Details:', {
      product_name: item.product_name,
      company_name: item.company_name,
      category: item.category,
      province: item.province,
      website: item.website,
      trust_level: item.trust_level,
      saved_at: item.saved_at
    });
    if (!item.product_name || !item.company_name || !item.trust_level) {
      throw new Error('Missing essential canonical metadata');
    }

    // 4. Duplicate save blocked
    console.log('[STEP 4] Testing duplicate save prevention...');
    const dupRes = await fetch('http://localhost:5174/api/user/saved-relations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userA
      },
      body: JSON.stringify({
        product_id: targetProductId,
        company_id: targetCompanyId,
        relation_id: targetRelationId,
        base_name: 'Mi base'
      })
    });
    const dupData = await dupRes.json();
    console.log('Duplicate response:', dupData);
    if (!dupData.alreadySaved || dupData.saved) {
      throw new Error('Duplicate was not blocked!');
    }
    const checkCount = await fetch(`http://localhost:5174/api/user/saved-relations?user_id=${userA}`);
    const checkCountData = await checkCount.json();
    if (checkCountData.count !== 1) {
      throw new Error('Duplicate was created in database!');
    }

    // 5. Refresh / Persistence check
    console.log('[STEP 5] Simulating page refresh (reload from DB)...');
    const refreshRes = await fetch(`http://localhost:5174/api/user/saved-relations?user_id=${userA}`);
    const refreshData = await refreshRes.json();
    if (refreshData.count !== 1 || refreshData.items[0].product_id !== targetProductId) {
      throw new Error('Persistence failed after simulated refresh');
    }
    console.log('Persistence confirmed.');

    // 6. Search does NOT save (Search remains non-persistent)
    console.log('[STEP 6] Testing search does NOT auto-save...');
    await fetch('http://localhost:5174/api/industrial-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'bomba centrifuga', page: 1, limit: 10 })
    });
    const searchCheck = await fetch(`http://localhost:5174/api/user/saved-relations?user_id=${userA}`);
    const searchCheckData = await searchCheck.json();
    if (searchCheckData.count !== 1) {
      throw new Error('Search unintentionally modified saved relations!');
    }
    console.log('Search remains non-persistent confirmed.');

    // 7. Isolation between users (User A vs User B)
    console.log('[STEP 7] Testing user data isolation...');
    const getResB = await fetch(`http://localhost:5174/api/user/saved-relations?user_id=${userB}`);
    const getDataB = await getResB.json();
    console.log(`User B saved count: ${getDataB.count}`);
    if (getDataB.count !== 0) {
      throw new Error('Isolation failed: User B can see User A items!');
    }

    // User B tries to delete User A's item
    const deleteAttemptByB = await fetch(`http://localhost:5174/api/user/saved-relations/${savedRecordId}`, {
      method: 'DELETE',
      headers: { 'x-user-id': userB }
    });
    const delAttemptData = await deleteAttemptByB.json();
    if (delAttemptData.deleted) {
      throw new Error('Isolation failed: User B was able to delete User A item!');
    }
    console.log('Isolation between users verified: User B cannot see or delete User A data.');

    // 8. Delete from Mi base by User A
    console.log('[STEP 8] User A deletes product from Mi base...');
    const delResA = await fetch(`http://localhost:5174/api/user/saved-relations/${savedRecordId}`, {
      method: 'DELETE',
      headers: { 'x-user-id': userA }
    });
    const delDataA = await delResA.json();
    if (!delDataA.deleted) {
      throw new Error('User A failed to delete item');
    }

    // 9. Confirm item disappeared
    const verifyEmpty = await fetch(`http://localhost:5174/api/user/saved-relations?user_id=${userA}`);
    const verifyEmptyData = await verifyEmpty.json();
    if (verifyEmptyData.count !== 0) {
      throw new Error('Item still exists after deletion!');
    }
    console.log('Deletion confirmed: Mi base is now empty for User A.');

    console.log('--- ALL E2E CRITERIA PASSED SUCCESSFULLY! ---');
  } finally {
    await client.query('DELETE FROM public.atlas_user_saved_relations WHERE user_id IN ($1::uuid, $2::uuid);', [userA, userB]);
    client.release();
    pool.end();
  }
}

main().catch(err => {
  console.error('E2E FAILURE:', err);
  process.exit(1);
});
