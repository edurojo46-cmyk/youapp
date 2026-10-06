import dotenv from 'dotenv';

dotenv.config();

const MEILI_URL = process.env.MEILI_URL || 'http://127.0.0.1:7700';
const MEILI_KEY = process.env.MEILI_MASTER_KEY || process.env.MEILISEARCH_KEY || '';
const HEADERS = { 'Content-Type': 'application/json' };
if (MEILI_KEY) HEADERS['Authorization'] = 'Bearer ' + MEILI_KEY;

const FROZEN_SETTINGS = {
  displayedAttributes: ['*'],
  searchableAttributes: [
    'display_name',
    'display_name_normalized',
    'organization',
    'role',
    'profession',
    'search_text_normalized'
  ],
  rankingRules: ['words', 'typo', 'proximity', 'attribute', 'sort', 'exactness'],
  typoTolerance: { enabled: true, minWordSizeForTypos: { oneTypo: 5, twoTypos: 9 } },
  pagination: { maxTotalHits: 1000 },
  prefixSearch: 'indexingTime'
};

async function waitForTask(taskUid) {
  while (true) {
    const res = await fetch(`${MEILI_URL}/tasks/${taskUid}`, { headers: HEADERS });
    const task = await res.json();
    if (task.status === 'succeeded') return task;
    if (task.status === 'failed') throw new Error(`Task ${taskUid} failed: ${JSON.stringify(task)}`);
    await new Promise(r => setTimeout(r, 50));
  }
}

async function recreateRotorWithSettings(uid) {
  console.log(`Recreating rotor ${uid}...`);
  await fetch(`${MEILI_URL}/indexes/${uid}`, { method: 'DELETE', headers: HEADERS });
  const cRes = await fetch(`${MEILI_URL}/indexes`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ uid, primaryKey: 'atlas_person_id' })
  });
  const cTask = await cRes.json();
  await waitForTask(cTask.taskUid);

  const sRes = await fetch(`${MEILI_URL}/indexes/${uid}/settings`, {
    method: 'PATCH',
    headers: HEADERS,
    body: JSON.stringify(FROZEN_SETTINGS)
  });
  const sTask = await sRes.json();
  await waitForTask(sTask.taskUid);
}

function generateDocBatch(startId, count) {
  const docs = new Array(count);
  for (let i = 0; i < count; i++) {
    const id = startId + i;
    docs[i] = {
      atlas_person_id: `P_v24_canary_1790015958064_${id}`,
      source_id: 'v24_canary_1790015958064',
      source_person_id: `SRC_v24_canary_1790015958064_${id}`,
      projection_version: 1,
      display_name: `Candidate SRC_v24_canary_1790015958064_${id}`,
      display_name_normalized: `candidate SRC_v24_canary_1790015958064_${id}`,
      organization: 'ATLAS MATRIX S.A.',
      role: 'DIRECTOR',
      profession: 'Ingeniero',
      search_text_normalized: `candidate SRC_v24_canary_1790015958064_${id} director atlas matrix s.a.`,
      created_at: new Date().toISOString()
    };
  }
  return docs;
}

async function populateRotor(uid, startId, totalDocs = 50000, batchSize = 10000) {
  console.log(`Populating ${uid} with ${totalDocs} documents starting at ID ${startId}...`);
  for (let b = 0; b < totalDocs; b += batchSize) {
    const count = Math.min(batchSize, totalDocs - b);
    const docs = generateDocBatch(startId + b, count);
    const res = await fetch(`${MEILI_URL}/indexes/${uid}/documents`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify(docs)
    });
    const task = await res.json();
    await waitForTask(task.taskUid);
    console.log(`   ${uid}: indexed ${b + count}/${totalDocs}`);
  }
}

async function prepareAll() {
  console.log('--- PREPARING 7 SEALED ROTORS (350,000 DOCUMENTS) ---');

  // Verify rot_0 to rot_3
  for (let i = 0; i < 4; i++) {
    const uid = `v24_canary_1790015958064_rot_${i}`;
    const sRes = await fetch(`${MEILI_URL}/indexes/${uid}/stats`, { headers: HEADERS });
    const stats = await sRes.json();
    console.log(`Rotor ${uid}: ${stats.numberOfDocuments} docs`);
    if (stats.numberOfDocuments !== 50000) {
      throw new Error(`Expected 50000 docs in ${uid}, found ${stats.numberOfDocuments}`);
    }
  }

  // Populate rot_4 (200000 - 249999)
  const rot4Uid = 'v24_canary_1790015958064_rot_4';
  await recreateRotorWithSettings(rot4Uid);
  await populateRotor(rot4Uid, 200000, 50000);

  // Populate rot_5 (250000 - 299999)
  const rot5Uid = 'v24_canary_1790015958064_rot_5';
  await recreateRotorWithSettings(rot5Uid);
  await populateRotor(rot5Uid, 250000, 50000);

  // Populate rot_6 (300000 - 349999)
  const rot6Uid = 'v24_canary_1790015958064_rot_6';
  await recreateRotorWithSettings(rot6Uid);
  await populateRotor(rot6Uid, 300000, 50000);

  // Recreate rot_7 clean and empty
  const rot7Uid = 'v24_canary_1790015958064_rot_7';
  await recreateRotorWithSettings(rot7Uid);

  console.log('\n--- VERIFICATION OF ALL 8 ROTORS ---');
  let totalDocs = 0;
  for (let i = 0; i < 8; i++) {
    const uid = `v24_canary_1790015958064_rot_${i}`;
    const sRes = await fetch(`${MEILI_URL}/indexes/${uid}/stats`, { headers: HEADERS });
    const stats = await sRes.json();
    console.log(`Rotor ${uid}: ${stats.numberOfDocuments} docs`);
    totalDocs += stats.numberOfDocuments;
  }
  console.log(`\nTotal static docs across 7 sealed rotors: ${totalDocs} (Target: 350,000)`);
}

prepareAll().catch(console.error);
