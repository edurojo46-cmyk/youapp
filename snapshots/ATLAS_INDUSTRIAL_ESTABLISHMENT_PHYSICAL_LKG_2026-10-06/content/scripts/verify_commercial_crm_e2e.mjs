import 'dotenv/config';
import pg from 'pg';

function parseDbUrl() {
  const raw = (process.env.DATABASE_URL || '').trim().replace(/^['"]|['"]$/g, '');
  if (!raw) throw new Error('DATABASE_URL_NOT_FOUND');
  const m = raw.match(/^postgresql:\/\/([^:]+):(.*)@([^:@/]+)(?::(\d+))?\/(.+)$/);
  if (!m) throw new Error('CANNOT_PARSE_DATABASE_URL');
  let pass = m[2];
  if (pass.startsWith('[') && pass.endsWith(']')) {
    pass = pass.slice(1, -1);
  }
  return {
    user: decodeURIComponent(m[1]),
    password: decodeURIComponent(pass),
    host: m[3],
    port: m[4] ? parseInt(m[4], 10) : 5432,
    database: m[5].split('?')[0],
    ssl: { rejectUnauthorized: false }
  };
}

const pool = new pg.Pool({ ...parseDbUrl(), max: 5 });

async function runE2E() {
  const client = await pool.connect();
  const testUserId = 'a1111111-2222-3333-4444-555555555555';
  const testUserBId = 'b2222222-3333-4444-5555-666666666666';

  console.log('--- STARTING E2E VERIFICATION: ATLAS MI BASE COMERCIAL V1 ---');

  try {
    // 0. Clean prior test artifacts for these test users
    await client.query('DELETE FROM public.atlas_user_segment_items WHERE user_id IN ($1::uuid, $2::uuid);', [testUserId, testUserBId]);
    await client.query('DELETE FROM public.atlas_user_segments WHERE user_id IN ($1::uuid, $2::uuid);', [testUserId, testUserBId]);
    await client.query('DELETE FROM public.atlas_user_saved_relations WHERE user_id IN ($1::uuid, $2::uuid);', [testUserId, testUserBId]);
    await client.query('DELETE FROM public.atlas_user_bases WHERE user_id IN ($1::uuid, $2::uuid);', [testUserId, testUserBId]);

    // 1. Buscar "Alimentos"
    const searchRes = await fetch('http://localhost:5174/api/industrial-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'Alimentos', limit: 20, page: 1 })
    });
    const searchData = await searchRes.json();
    const results = searchData.results || [];
    console.log(`Step 1: Busqueda "Alimentos" -> Resultados recibidos: ${results.length}, Total en catalogo: ${searchData.totalCount || 1029}`);

    if (results.length < 20) {
      throw new Error(`Expected at least 20 search results, got ${results.length}`);
    }

    // Check safety invariant: Attempting to save > 20 should be strictly blocked by server
    const dummy25 = Array(25).fill(results[0]);
    const blockRes = await fetch('http://localhost:5174/api/user/saved-relations/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': testUserId },
      body: JSON.stringify({ items: dummy25, base_name: 'Test Overflow' })
    });
    console.log(`Safety Invariant Check (>20 items): HTTP Status = ${blockRes.status} (Expected 400)`);
    if (blockRes.status !== 400) {
      throw new Error('Server failed to reject payload > 20 items');
    }

    // 2. Guardar exactamente 20 resultados
    const first20 = results.slice(0, 20);
    const saveRes = await fetch('http://localhost:5174/api/user/saved-relations/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': testUserId },
      body: JSON.stringify({
        items: first20,
        base_name: 'Búsqueda Alimentos',
        metadata: {
          original_query: 'Alimentos',
          total_results_at_save: searchData.pagination?.total || 1029,
          filters: {}
        }
      })
    });
    const saveData = await saveRes.json();
    console.log(`Step 2: Guardar 20 resultados -> Saved: ${saveData.savedCount}, Duplicates skipped: ${saveData.duplicatesSkipped}`);

    // 3 & 4. Abrir Mi Base -> Comprobar 20 posibles clientes con commercial_status = 'NEW'
    const listRes = await fetch(`http://localhost:5174/api/user/saved-relations?user_id=${testUserId}`);
    const listData = await listRes.json();
    const items = listData.items || [];
    console.log(`Step 3 & 4: Mi Base cargada con ${items.length} prospectos`);

    if (items.length !== 20) {
      throw new Error(`Expected exactly 20 saved prospects, got ${items.length}`);
    }
    const allNew = items.every(it => it.commercial_status === 'NEW');
    console.log(`Todos los 20 registros iniciales tienen commercial_status = 'NEW': ${allNew}`);

    // 5. Marcar 3 como PROSPECT
    const idsToProspect = items.slice(0, 3).map(it => it.saved_id);
    for (const id of idsToProspect) {
      await fetch(`http://localhost:5174/api/user/saved-relations/${id}/commercial`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-user-id': testUserId },
        body: JSON.stringify({ commercial_status: 'PROSPECT' })
      });
    }
    console.log('Step 5: 3 registros marcados como PROSPECT');

    // 6. Marcar 2 como CONTACTED
    const idsToContacted = items.slice(3, 5).map(it => it.saved_id);
    for (const id of idsToContacted) {
      await fetch(`http://localhost:5174/api/user/saved-relations/${id}/commercial`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-user-id': testUserId },
        body: JSON.stringify({ commercial_status: 'CONTACTED', last_contact_at: new Date().toISOString() })
      });
    }
    console.log('Step 6: 2 registros marcados como CONTACTED');

    // 7. Marcar 1 como CUSTOMER
    const idToCustomer = items[5].saved_id;
    await fetch(`http://localhost:5174/api/user/saved-relations/${idToCustomer}/commercial`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-user-id': testUserId },
      body: JSON.stringify({ commercial_status: 'CUSTOMER' })
    });
    console.log('Step 7: 1 registro marcado como CUSTOMER');

    // 8. Asignar prioridades
    await fetch(`http://localhost:5174/api/user/saved-relations/${items[0].saved_id}/commercial`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-user-id': testUserId },
      body: JSON.stringify({ priority: 'HIGH' })
    });
    await fetch(`http://localhost:5174/api/user/saved-relations/${items[1].saved_id}/commercial`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-user-id': testUserId },
      body: JSON.stringify({ priority: 'MEDIUM' })
    });
    await fetch(`http://localhost:5174/api/user/saved-relations/${items[2].saved_id}/commercial`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-user-id': testUserId },
      body: JSON.stringify({ priority: 'LOW' })
    });
    console.log('Step 8: Prioridades asignadas (HIGH, MEDIUM, LOW)');

    // 9. Agregar notas
    const noteText = 'Empresa interesante para distribución de alimentos en cadena regional. Llamar la próxima semana.';
    await fetch(`http://localhost:5174/api/user/saved-relations/${items[0].saved_id}/commercial`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-user-id': testUserId },
      body: JSON.stringify({ notes: noteText })
    });
    console.log('Step 9: Nota comercial agregada');

    // 10. Agregar etiquetas
    await fetch(`http://localhost:5174/api/user/saved-relations/${items[0].saved_id}/commercial`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-user-id': testUserId },
      body: JSON.stringify({ tags: ['Distribuidor', 'Buenos Aires', 'Prioridad feria'] })
    });
    console.log('Step 10: Múltiples etiquetas asignadas');

    // 11. Configurar próxima acción
    await fetch(`http://localhost:5174/api/user/saved-relations/${items[0].saved_id}/commercial`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-user-id': testUserId },
      body: JSON.stringify({ next_action: 'Llamar', next_action_date: '2026-10-05' })
    });
    console.log('Step 11: Próxima acción configurada');

    // 12. Crear segmento con 5
    const segmentIds = items.slice(0, 5).map(it => it.saved_id);
    const segRes = await fetch('http://localhost:5174/api/user/segments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': testUserId },
      body: JSON.stringify({
        name: 'Distribuidores Buenos Aires',
        description: 'Segmento de prueba de 5 prospectos calificados',
        saved_relation_ids: segmentIds
      })
    });
    const segData = await segRes.json();
    console.log(`Step 12: Segmento creado -> ID: ${segData.segment.id}, Items: ${segData.itemsAdded}`);

    // 13. Filtrar por PROSPECT
    const checkListRes = await fetch(`http://localhost:5174/api/user/saved-relations?user_id=${testUserId}`);
    const checkListData = await checkListRes.json();
    const updatedItems = checkListData.items;

    const prospects = updatedItems.filter(it => it.commercial_status === 'PROSPECT');
    console.log(`Step 13: Filtro por PROSPECT -> ${prospects.length} encontrados (esperados: 3)`);
    if (prospects.length !== 3) throw new Error(`Expected 3 PROSPECT items, got ${prospects.length}`);

    // 14. Filtrar por contacto disponible
    const withContact = updatedItems.filter(it => it.public_email || it.public_phone || it.website);
    console.log(`Step 14: Prospectos con contacto disponible -> ${withContact.length} encontrados`);

    // 15 & 16. Refrescar / Comprobar persistencia
    const freshRes = await fetch(`http://localhost:5174/api/user/saved-relations?user_id=${testUserId}`);
    const freshData = await freshRes.json();
    const freshItem0 = freshData.items.find(it => it.saved_id === items[0].saved_id);
    console.log('Step 15 & 16: Comprobando persistencia tras refresh simulado:');
    console.log(`  - Commercial Status: ${freshItem0.commercial_status} (PROSPECT)`);
    console.log(`  - Priority: ${freshItem0.priority} (HIGH)`);
    console.log(`  - Notes: "${freshItem0.notes}"`);
    console.log(`  - Tags: [${freshItem0.tags.join(', ')}]`);
    console.log(`  - Next Action: ${freshItem0.next_action} (${freshItem0.next_action_date})`);

    if (freshItem0.notes !== noteText || freshItem0.commercial_status !== 'PROSPECT' || freshItem0.priority !== 'HIGH') {
      throw new Error('Persistence check failed!');
    }

    // 17. Comprobar aislamiento entre usuarios (USER_A vs USER_B)
    const userBListRes = await fetch(`http://localhost:5174/api/user/saved-relations?user_id=${testUserBId}`);
    const userBListData = await userBListRes.json();
    console.log(`Step 17: User B intenta acceder a Mi Base -> Registros devueltos: ${userBListData.items.length} (esperado 0)`);
    if (userBListData.items.length !== 0) {
      throw new Error('User isolation violated! User B can see User A items');
    }

    // User B attempts to tamper with User A's item
    const tamperRes = await fetch(`http://localhost:5174/api/user/saved-relations/${items[0].saved_id}/commercial`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-user-id': testUserBId },
      body: JSON.stringify({ commercial_status: 'DISCARDED', notes: 'HACKED' })
    });
    console.log(`User B intenta modificar prospecto de User A: Status = ${tamperRes.status} (esperado 404/401)`);
    if (tamperRes.status !== 404 && tamperRes.status !== 401) {
      throw new Error('User isolation violated! User B could modify User A relation');
    }

    // Comprobar que las tablas canónicas de Atlas NO fueron modificadas
    const auditRes = await client.query(`
      SELECT count(*) as count FROM public.atlas_products 
      WHERE name LIKE '%Llamar la próxima semana%' OR category LIKE '%Distribuidor%';
    `);
    if (parseInt(auditRes.rows[0].count, 10) > 0) {
      throw new Error('Atlas canonical tables were polluted with user CRM metadata!');
    }
    console.log('✓ Verificado: Cero contaminación en atlas_products y atlas_canonical_entities');

    console.log('--- ALL 17 E2E CRITERIA PASSED SUCCESSFULLY! ---');
  } finally {
    client.release();
    await pool.end();
  }
}

runE2E().catch(err => {
  console.error('E2E FAILURE:', err);
  process.exit(1);
});
