/**
 * Tests 2 & 3:
 * Test 2: Source fallback (Source A fails, Source B continues) -> MISSION_ID MUST REMAIN EQUAL.
 * Test 3: Geography expansion -> MISSION_ID MUST REMAIN EQUAL.
 */

const BASE_URL = 'http://localhost:5174';

async function safeFetchJson(url: string, opts?: any): Promise<any> {
  const res = await fetch(url, opts);
  const data = await res.json();
  return { status: res.status, ok: res.ok, data };
}

async function testSourceFallbackAndGeoExpansion() {
  console.log('=== TEST 2: SOURCE FALLBACK MISSION IDENTITY TEST ===');
  
  // Concept with multiple potential sources
  const specRes = await safeFetchJson(`${BASE_URL}/api/industrial/missions/spec`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      objective: 'FARMACIAS',
      entity_type: 'COMPANY',
      geography: 'ARG_CABA',
      target_new_records: 10,
      environment: 'PRODUCTION'
    })
  });

  if (!specRes.ok || !specRes.data?.mission?.mission_id) {
    console.error('Failed to create spec for Test 2:', specRes);
    process.exit(1);
  }

  const M2_ID = specRes.data.mission.mission_id;
  console.log(`Created mission for source fallback test: ${M2_ID}`);

  const startRes = await safeFetchJson(`${BASE_URL}/api/industrial/missions/${M2_ID}/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ allowedTarget: 10 })
  });

  if (!startRes.ok) {
    console.error('Failed to start mission for Test 2:', startRes);
    process.exit(1);
  }

  let finalM2: any = null;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const chk = await safeFetchJson(`${BASE_URL}/api/industrial/missions/${M2_ID}`);
    if (chk.ok && chk.data?.mission) {
      if (chk.data.mission.mission_id !== M2_ID) {
        console.error(`INVARIANT FAILURE in Test 2: Polled ${chk.data.mission.mission_id} != ${M2_ID}`);
        process.exit(1);
      }
      if (chk.data.mission.completed_at || ['TARGET_REACHED', 'COMPLETED', 'FAILED', 'CANCELLED', 'NO_VALIDATED_SOURCE_EXISTS_AFTER_DISCOVERY', 'SOURCE_FRONTIER_EXHAUSTED_WITH_PROOF'].includes(chk.data.mission.status)) {
        finalM2 = chk.data.mission;
        break;
      }
    }
  }

  console.log(`Test 2 Terminal ID: ${finalM2?.mission_id} | Status: ${finalM2?.status} | Certified: ${finalM2?.certified_new_searchable}`);
  const test2Pass = finalM2?.mission_id === M2_ID;

  console.log('\n=== TEST 3: GEOGRAPHY EXPANSION MISSION IDENTITY TEST ===');
  const specRes3 = await safeFetchJson(`${BASE_URL}/api/industrial/missions/spec`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      objective: 'BODEGAS Y VINEDOS',
      entity_type: 'COMPANY',
      geography: 'ARG_NACIONAL',
      target_new_records: 15,
      environment: 'PRODUCTION'
    })
  });

  if (!specRes3.ok || !specRes3.data?.mission?.mission_id) {
    console.error('Failed to create spec for Test 3:', specRes3);
    process.exit(1);
  }

  const M3_ID = specRes3.data.mission.mission_id;
  console.log(`Created mission for geo expansion test: ${M3_ID}`);

  const startRes3 = await safeFetchJson(`${BASE_URL}/api/industrial/missions/${M3_ID}/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ allowedTarget: 15 })
  });

  if (!startRes3.ok) {
    console.error('Failed to start mission for Test 3:', startRes3);
    process.exit(1);
  }

  let finalM3: any = null;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const chk = await safeFetchJson(`${BASE_URL}/api/industrial/missions/${M3_ID}`);
    if (chk.ok && chk.data?.mission) {
      if (chk.data.mission.mission_id !== M3_ID) {
        console.error(`INVARIANT FAILURE in Test 3: Polled ${chk.data.mission.mission_id} != ${M3_ID}`);
        process.exit(1);
      }
      if (chk.data.mission.completed_at || ['TARGET_REACHED', 'COMPLETED', 'FAILED', 'CANCELLED', 'NO_VALIDATED_SOURCE_EXISTS_AFTER_DISCOVERY', 'SOURCE_FRONTIER_EXHAUSTED_WITH_PROOF'].includes(chk.data.mission.status)) {
        finalM3 = chk.data.mission;
        break;
      }
    }
  }

  console.log(`Test 3 Terminal ID: ${finalM3?.mission_id} | Status: ${finalM3?.status} | Certified: ${finalM3?.certified_new_searchable}`);
  const test3Pass = finalM3?.mission_id === M3_ID;

  console.log('\n=== SUITE SUMMARY ===');
  console.log(`TEST_2_SOURCE_FALLBACK_STABLE: ${test2Pass}`);
  console.log(`TEST_3_GEO_EXPANSION_STABLE:   ${test3Pass}`);

  if (!test2Pass || !test3Pass) {
    process.exit(1);
  }
}

testSourceFallbackAndGeoExpansion().catch(err => {
  console.error('Suite error:', err);
  process.exit(1);
});
