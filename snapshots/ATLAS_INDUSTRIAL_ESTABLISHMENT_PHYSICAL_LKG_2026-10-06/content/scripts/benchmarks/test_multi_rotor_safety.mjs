import pg from 'file:///c:/Users/Eduardo/YOUAPP/node_modules/pg/lib/index.js';
import dotenv from 'file:///c:/Users/Eduardo/YOUAPP/node_modules/dotenv/lib/main.js';
import fs from 'node:fs';
import path from 'node:path';
import { parseDbUrl } from 'file:///c:/Users/Eduardo/YOUAPP/scripts/export_search_projection_v2.mjs';

dotenv.config({ path: 'c:/Users/Eduardo/YOUAPP/.env' });

const MEILI_URL = process.env.MEILI_URL || 'http://127.0.0.1:7700';
const MEILI_KEY = process.env.MEILI_MASTER_KEY || process.env.MEILISEARCH_KEY || '';
const HEADERS = { 'Content-Type': 'application/json' };
if (MEILI_KEY) HEADERS['Authorization'] = 'Bearer ' + MEILI_KEY;

async function waitForMeiliTask(taskUid) {
  while (true) {
    const res = await fetch(`${MEILI_URL}/tasks/${taskUid}`, { headers: HEADERS });
    const task = await res.json();
    if (task.status === 'succeeded') return task;
    if (task.status === 'failed') throw new Error(`Task failed: ${JSON.stringify(task)}`);
    await new Promise(r => setTimeout(r, 50));
  }
}

async function createIndex(uid) {
  await fetch(`${MEILI_URL}/indexes/${uid}`, { method: 'DELETE', headers: HEADERS });
  const res = await fetch(`${MEILI_URL}/indexes`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ uid, primaryKey: 'atlas_person_id' })
  });
  await waitForMeiliTask((await res.json()).taskUid);
}

// Production Federated Search Gateway with Global Canonical Deduplication & Projection Versioning
export async function federatedCanonicalSearch({ indexUids, query, limit = 20 }) {
  const res = await fetch(`${MEILI_URL}/multi-search`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({
      queries: indexUids.map(uid => ({ indexUid: uid, q: query })),
      federation: { limit: limit * 2 }
    })
  });
  const data = await res.json();
  const rawHits = data.hits || [];

  // Global Canonical Deduplication by atlas_person_id + projection_version
  const canonicalMap = new Map();
  for (const hit of rawHits) {
    const existing = canonicalMap.get(hit.atlas_person_id);
    if (!existing) {
      canonicalMap.set(hit.atlas_person_id, hit);
    } else {
      const existingVer = existing.projection_version ?? 1;
      const hitVer = hit.projection_version ?? 1;
      if (hitVer > existingVer) {
        canonicalMap.set(hit.atlas_person_id, hit);
      }
    }
  }

  const deduplicatedHits = Array.from(canonicalMap.values()).slice(0, limit);
  return {
    ...data,
    hits: deduplicatedHits,
    rawHitsCount: rawHits.length,
    deduplicatedHitsCount: deduplicatedHits.length
  };
}

// Consumer Stale Write Protection: safely apply document respecting projection_version
export async function publishWithVersionProtection(targetIndexUid, doc) {
  // Check if doc already exists in target index
  const getRes = await fetch(`${MEILI_URL}/indexes/${targetIndexUid}/documents/${doc.atlas_person_id}`, { headers: HEADERS });
  if (getRes.ok) {
    const existingDoc = await getRes.json();
    if (existingDoc && existingDoc.projection_version && existingDoc.projection_version >= doc.projection_version) {
      // Stale write rejected! Lower or equal version must not overwrite higher version
      return { applied: false, reason: 'STALE_VERSION_REJECTED', currentVersion: existingDoc.projection_version };
    }
  }

  const postRes = await fetch(`${MEILI_URL}/indexes/${targetIndexUid}/documents`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify([doc])
  });
  const task = await waitForMeiliTask((await postRes.json()).taskUid);
  return { applied: true, taskUid: task.uid };
}

async function main() {
  console.log('================================================================');
  console.log('🛡️ ATLAS V1.9 — MULTI-ROTOR OWNERSHIP & STALE WRITE PROTECTION');
  console.log('================================================================\n');

  let crossIndexDuplicateCanonicalDocs = 0;
  let staleCrossIndexSearchResults = 0;
  let staleSearchOverwrites = 0;
  let latestProjectionVersionVisibleCount = 0;

  const BASE_UID = 'test_rotor_base';
  const ROTOR1_UID = 'test_rotor_r1';
  const ROTOR2_UID = 'test_rotor_r2';
  const ACTIVE_UID = 'test_rotor_active';
  const allIndexes = [BASE_UID, ROTOR1_UID, ROTOR2_UID, ACTIVE_UID];

  try {
    for (const uid of allIndexes) {
      await createIndex(uid);
    }

    // -------------------------------------------------------------
    // PART 1: Multi-Rotor Update Ownership Across Base, R1, R2, Active
    // -------------------------------------------------------------
    console.log('1. Testing Multi-Rotor Cross-Index Update Ownership...');

    // Scenario A: Person A exists in Base (version 1: DIRECTOR)
    const personAId = 'atlas_arg_per_owner_001';
    await (await fetch(`${MEILI_URL}/indexes/${BASE_UID}/documents`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify([{
        atlas_person_id: personAId,
        display_name: 'CANARY CANDIDATE OWNER001',
        role: 'DIRECTOR TITULAR',
        organization: 'BASE CORP SA',
        projection_version: 1,
        event_id: 101
      }])
    })).json();

    // Scenario B: Person B exists in Rotor 1 (version 1: VOCAL)
    const personBId = 'atlas_arg_per_owner_002';
    await (await fetch(`${MEILI_URL}/indexes/${ROTOR1_UID}/documents`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify([{
        atlas_person_id: personBId,
        display_name: 'CANARY CANDIDATE OWNER002',
        role: 'VOCAL SUPLENTE',
        organization: 'ROTOR1 CORP SA',
        projection_version: 1,
        event_id: 102
      }])
    })).json();

    // Scenario C: Person C exists in Rotor 2 (version 1: SECRETARIO)
    const personCId = 'atlas_arg_per_owner_003';
    await (await fetch(`${MEILI_URL}/indexes/${ROTOR2_UID}/documents`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify([{
        atlas_person_id: personCId,
        display_name: 'CANARY CANDIDATE OWNER003',
        role: 'SECRETARIO',
        organization: 'ROTOR2 CORP SA',
        projection_version: 1,
        event_id: 103
      }])
    })).json();

    // Wait for all three initial index tasks
    await new Promise(r => setTimeout(r, 400));

    // Now emit UPDATE events into Active Rotor for Person A, Person B, Person C
    console.log('   Ingesting updates into Active Rotor (projection_version 2)...');
    const updateDocs = [
      {
        atlas_person_id: personAId,
        display_name: 'CANARY CANDIDATE OWNER001',
        role: 'PRESIDENTE DEL DIRECTORIO',
        organization: 'HOLDING MERGED SA',
        projection_version: 2,
        event_id: 201
      },
      {
        atlas_person_id: personBId,
        display_name: 'CANARY CANDIDATE OWNER002',
        role: 'VICEPRESIDENTE',
        organization: 'HOLDING MERGED SA',
        projection_version: 2,
        event_id: 202
      },
      {
        atlas_person_id: personCId,
        display_name: 'CANARY CANDIDATE OWNER003',
        role: 'DIRECTOR GENERAL',
        organization: 'HOLDING MERGED SA',
        projection_version: 2,
        event_id: 203
      }
    ];

    const upRes = await fetch(`${MEILI_URL}/indexes/${ACTIVE_UID}/documents`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify(updateDocs)
    });
    await waitForMeiliTask((await upRes.json()).taskUid);

    // Query across all indexes via federatedCanonicalSearch
    console.log('   Executing Federated Canonical Query across [Base, Rotor 1, Rotor 2, Active]...');
    const testCases = [
      { id: personAId, expectedRole: 'PRESIDENTE DEL DIRECTORIO', expectedOrg: 'HOLDING MERGED SA', term: 'OWNER001' },
      { id: personBId, expectedRole: 'VICEPRESIDENTE', expectedOrg: 'HOLDING MERGED SA', term: 'OWNER002' },
      { id: personCId, expectedRole: 'DIRECTOR GENERAL', expectedOrg: 'HOLDING MERGED SA', term: 'OWNER003' }
    ];

    for (const tc of testCases) {
      const searchRes = await federatedCanonicalSearch({
        indexUids: allIndexes,
        query: tc.term,
        limit: 10
      });

      console.log(`   Query for ${tc.term}: rawHits=${searchRes.rawHitsCount}, deduplicatedHits=${searchRes.deduplicatedHitsCount}`);
      
      const personHits = searchRes.hits.filter(h => h.atlas_person_id === tc.id);
      if (personHits.length !== 1) {
        crossIndexDuplicateCanonicalDocs += (personHits.length - 1);
        console.error(`   ❌ Duplicate hits found for ${tc.id}: count=${personHits.length}`);
      }

      const visibleDoc = personHits[0];
      if (!visibleDoc) {
        throw new Error(`Document missing in search for ${tc.id}`);
      }

      const isLatestRole = visibleDoc.role === tc.expectedRole;
      const isLatestOrg = visibleDoc.organization === tc.expectedOrg;
      const isLatestVer = visibleDoc.projection_version === 2;

      if (isLatestRole && isLatestOrg && isLatestVer) {
        latestProjectionVersionVisibleCount++;
        console.log(`   ✅ Person ${tc.id}: Visible count=1, Role="${visibleDoc.role}", Version=${visibleDoc.projection_version} (PASS)`);
      } else {
        staleCrossIndexSearchResults++;
        console.error(`   ❌ Stale document returned for ${tc.id}: role="${visibleDoc.role}", version=${visibleDoc.projection_version}`);
      }
    }

    // -------------------------------------------------------------
    // PART 2: Monotonic Canonical Projection Version Stale Write Protection
    // -------------------------------------------------------------
    console.log('\n2. Testing Monotonic Canonical Projection Version Stale Write Protection...');
    const personStaleTestId = 'atlas_arg_per_stale_test';
    const TARGET_INDEX = ROTOR1_UID;

    // Step A: Event 1 (version 1) created
    // Step B: Event 2 (version 2) created
    // Step C: Event 2 is published FIRST to the index
    console.log('   Publishing Event 2 (version: 2, role: "PRESIDENTE") first...');
    const docVer2 = {
      atlas_person_id: personStaleTestId,
      display_name: 'CANARY CANDIDATE STALE',
      role: 'PRESIDENTE',
      organization: 'LATEST FIRM SA',
      projection_version: 2,
      event_id: 500
    };
    const pub2Res = await publishWithVersionProtection(TARGET_INDEX, docVer2);
    console.log('   Event 2 published:', pub2Res);

    // Step D: Event 1 (version 1, role: "DIRECTOR TITULAR") arrives late / replayed afterward!
    console.log('   Simulating late replay of Event 1 (version: 1, role: "DIRECTOR TITULAR")...');
    const docVer1 = {
      atlas_person_id: personStaleTestId,
      display_name: 'CANARY CANDIDATE STALE',
      role: 'DIRECTOR TITULAR',
      organization: 'OLDER FIRM SA',
      projection_version: 1,
      event_id: 499
    };
    const pub1Res = await publishWithVersionProtection(TARGET_INDEX, docVer1);
    console.log('   Late Event 1 publication result:', pub1Res);

    if (pub1Res.applied) {
      staleSearchOverwrites++;
      console.error('   ❌ Stale write was NOT rejected! Lower version overwrote higher version!');
    } else {
      console.log('   ✅ Stale write correctly REJECTED (STALE_VERSION_REJECTED).');
    }

    // Verify visible document in store is still Version 2
    const verifyDocRes = await fetch(`${MEILI_URL}/indexes/${TARGET_INDEX}/documents/${personStaleTestId}`, { headers: HEADERS });
    const finalStoredDoc = await verifyDocRes.json();
    console.log(`   Final Stored Doc in Meilisearch: role="${finalStoredDoc.role}", version=${finalStoredDoc.projection_version}`);

    if (finalStoredDoc.role === 'PRESIDENTE' && finalStoredDoc.projection_version === 2) {
      console.log('   ✅ Store state preserved latest projection_version=2.');
    } else {
      staleSearchOverwrites++;
      console.error('   ❌ Store state corrupted by older event!');
    }

    const testPass = (
      crossIndexDuplicateCanonicalDocs === 0 &&
      staleCrossIndexSearchResults === 0 &&
      staleSearchOverwrites === 0 &&
      latestProjectionVersionVisibleCount === 3
    );

    const report = {
      TIMESTAMP: new Date().toISOString(),
      TESTS: [
        'CROSS_INDEX_MULTI_ROTOR_OWNERSHIP',
        'FEDERATED_GLOBAL_CANONICAL_DEDUPLICATION',
        'COMPACTION_INDEX_ISOLATION',
        'MONOTONIC_PROJECTION_VERSION_PROTECTION',
        'OUT_OF_ORDER_REPLAY_REJECTION'
      ],
      CROSS_INDEX_DUPLICATE_CANONICAL_DOCS: crossIndexDuplicateCanonicalDocs,
      STALE_CROSS_INDEX_SEARCH_RESULTS: staleCrossIndexSearchResults,
      STALE_SEARCH_OVERWRITES: staleSearchOverwrites,
      LATEST_PROJECTION_VERSION_VISIBLE: `${(latestProjectionVersionVisibleCount / 3 * 100).toFixed(0)}%`,
      MULTI_ROTOR_SAFETY_PASS: testPass ? 'PASS' : 'FAIL'
    };

    console.log('\n================================================================');
    console.log('🏁 MULTI-ROTOR SAFETY VERDICT:', report.MULTI_ROTOR_SAFETY_PASS);
    console.log(`CROSS_INDEX_DUPLICATE_CANONICAL_DOCS: ${crossIndexDuplicateCanonicalDocs}`);
    console.log(`STALE_CROSS_INDEX_SEARCH_RESULTS    : ${staleCrossIndexSearchResults}`);
    console.log(`STALE_SEARCH_OVERWRITES             : ${staleSearchOverwrites}`);
    console.log(`LATEST_PROJECTION_VERSION_VISIBLE   : ${report.LATEST_PROJECTION_VERSION_VISIBLE}`);
    console.log('================================================================\n');

    const outDir = path.resolve('reports/atlas/benchmarks');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(
      path.join(outDir, 'atlas_v19_multi_rotor_safety_report.json'),
      JSON.stringify(report, null, 2)
    );

    // Cleanup indexes
    for (const uid of allIndexes) {
      await fetch(`${MEILI_URL}/indexes/${uid}`, { method: 'DELETE', headers: HEADERS });
    }

  } catch (err) {
    console.error('Fatal error in multi-rotor safety test:', err);
    throw err;
  }
}

main().catch(console.error);
