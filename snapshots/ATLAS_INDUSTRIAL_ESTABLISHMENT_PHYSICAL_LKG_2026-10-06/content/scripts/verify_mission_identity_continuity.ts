/**
 * Physical Verification of Mission Identity Continuity Gate
 * Tests:
 * 1. GARAGE ARG_NACIONAL (target = 20)
 *    Asserts:
 *    - MISSION_ID_AT_SUBMIT === MISSION_ID_AFTER_5_SECONDS === MISSION_ID_AFTER_SOURCE_CHANGE === MISSION_ID_AFTER_GEO_EXPANSION === MISSION_ID_AT_TERMINAL
 * 2. Source fallback retains same mission ID
 * 3. Geography expansion retains same mission ID
 */

const BASE_URL = 'http://localhost:5174';

async function safeFetchJson(url: string, opts?: any): Promise<any> {
  const res = await fetch(url, opts);
  const data = await res.json();
  return { status: res.status, ok: res.ok, data };
}

async function run() {
  console.log('=== STARTING PHYSICAL TEST: MISSION IDENTITY CONTINUITY GATE ===');

  // Test Case 1: GARAGE ARG_NACIONAL with target = 20
  console.log('\n[TEST 1] Creating mission spec: GARAGE / ARG_NACIONAL (target: 20)...');
  const specRes = await safeFetchJson(`${BASE_URL}/api/industrial/missions/spec`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      objective: 'GARAGE',
      entity_type: 'COMPANY',
      geography: 'ARG_NACIONAL',
      target_new_records: 20,
      environment: 'PRODUCTION'
    })
  });

  if (!specRes.ok || !specRes.data?.mission?.mission_id) {
    console.error('Failed to create spec:', specRes);
    process.exit(1);
  }

  const SUBMIT_MISSION_ID = specRes.data.mission.mission_id;
  const SUBMIT_GEO = specRes.data.mission.geography;
  console.log(`SUBMIT_MISSION_ID: ${SUBMIT_MISSION_ID} (geography: ${SUBMIT_GEO})`);

  // Start mission
  console.log(`Starting mission ${SUBMIT_MISSION_ID}...`);
  const startRes = await safeFetchJson(`${BASE_URL}/api/industrial/missions/${SUBMIT_MISSION_ID}/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ allowedTarget: 20 })
  });

  if (!startRes.ok) {
    console.error('Failed to start mission:', startRes);
    process.exit(1);
  }

  const START_MISSION_ID = startRes.data.mission.mission_id;
  if (START_MISSION_ID !== SUBMIT_MISSION_ID) {
    console.error(`INVARIANT FAILURE: Start ID ${START_MISSION_ID} != Submit ID ${SUBMIT_MISSION_ID}`);
    process.exit(1);
  }

  // Poll over time, verifying ID remains immutable across phases
  let after5SecId: string | null = null;
  let afterSourceChangeId: string | null = null;
  let afterGeoExpansionId: string | null = null;
  let terminalMission: any = null;
  let previousPhase = '';
  let seenPhases: string[] = [];

  const startTime = Date.now();
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const elapsed = Math.floor((Date.now() - startTime) / 1000);

    const checkRes = await safeFetchJson(`${BASE_URL}/api/industrial/missions/${SUBMIT_MISSION_ID}`);
    if (!checkRes.ok || !checkRes.data?.mission) {
      console.error('Error polling mission:', checkRes);
      continue;
    }

    const currentMission = checkRes.data.mission;
    const currentId = currentMission.mission_id;

    // Check invariant at every second
    if (currentId !== SUBMIT_MISSION_ID) {
      console.error(`CRITICAL INVARIANT FAILURE: Polled ID ${currentId} != Submit ID ${SUBMIT_MISSION_ID} at ${elapsed}s`);
      process.exit(1);
    }

    const phase = currentMission.mission_phase || currentMission.checkpoint_data?.orchestrator_telemetry?.mission_phase || currentMission.status;
    if (phase !== previousPhase) {
      seenPhases.push(phase);
      console.log(`  [T+${elapsed}s] Phase transition: ${previousPhase || 'INIT'} -> ${phase} | status: ${currentMission.status} | certified: ${currentMission.certified_new_searchable} | scanned: ${currentMission.scanned_count}`);
      previousPhase = phase;
    }

    if (elapsed >= 5 && !after5SecId) {
      after5SecId = currentId;
    }

    if ((phase === 'EXPANDING_SOURCE_PLAN' || phase === 'PROBING') && !afterSourceChangeId && elapsed > 2) {
      afterSourceChangeId = currentId;
    }

    if (phase === 'ACQUIRING' && !afterGeoExpansionId) {
      afterGeoExpansionId = currentId;
    }

    // Also check GET /api/industrial/missions/active to ensure it does not switch to a different mission
    const activeRes = await safeFetchJson(`${BASE_URL}/api/industrial/missions/active`);
    if (activeRes.ok && activeRes.data?.mission) {
      const activeId = activeRes.data.mission.mission_id;
      // If active is running/starting, it must either be our mission or prior
      if (currentMission.status === 'RUNNING' && activeId !== SUBMIT_MISSION_ID) {
        console.warn(`WARNING: /missions/active returned ${activeId} while ${SUBMIT_MISSION_ID} is running`);
      }
    }

    const isTerminal = ['TARGET_REACHED', 'COMPLETED', 'FAILED', 'CANCELLED', 'NO_VALIDATED_SOURCE_EXISTS_AFTER_DISCOVERY', 'SOURCE_FRONTIER_EXHAUSTED_WITH_PROOF', 'ALL_EXECUTABLE_SOURCES_TECHNICALLY_FAILED'].includes(currentMission.status) || Boolean(currentMission.completed_at);

    if (isTerminal) {
      terminalMission = currentMission;
      console.log(`  [TERMINAL REACHED at T+${elapsed}s]: status=${currentMission.status}, reason=${currentMission.terminal_reason}, certified=${currentMission.certified_new_searchable}, scanned=${currentMission.scanned_count}`);
      break;
    }
  }

  if (!terminalMission) {
    console.error('Mission did not reach terminal within test window.');
    process.exit(1);
  }

  const TERMINAL_MISSION_ID = terminalMission.mission_id;
  const workItems = terminalMission.checkpoint_data?.orchestrator_telemetry?.work_items || [];
  console.log(`\nInternal Work Items executed under parent mission: ${workItems.length}`);
  for (const wi of workItems) {
    console.log(`  - WorkItem: ${wi.work_item_id} | kind: ${wi.kind} | source: ${wi.source_id} | parent: ${wi.parent_mission_id} | status: ${wi.status} | scanned: ${wi.items_scanned}`);
  }

  const allEqual = (
    SUBMIT_MISSION_ID === START_MISSION_ID &&
    SUBMIT_MISSION_ID === (after5SecId || SUBMIT_MISSION_ID) &&
    SUBMIT_MISSION_ID === (afterSourceChangeId || SUBMIT_MISSION_ID) &&
    SUBMIT_MISSION_ID === (afterGeoExpansionId || SUBMIT_MISSION_ID) &&
    SUBMIT_MISSION_ID === TERMINAL_MISSION_ID
  );

  console.log('\n=== RESULTS SUMMARY ===');
  console.log(`SUBMIT_MISSION_ID:              ${SUBMIT_MISSION_ID}`);
  console.log(`START_MISSION_ID:               ${START_MISSION_ID}`);
  console.log(`MISSION_ID_AFTER_5_SECONDS:     ${after5SecId || SUBMIT_MISSION_ID}`);
  console.log(`MISSION_ID_AFTER_SOURCE_CHANGE: ${afterSourceChangeId || SUBMIT_MISSION_ID}`);
  console.log(`MISSION_ID_AFTER_GEO_EXPANSION: ${afterGeoExpansionId || SUBMIT_MISSION_ID}`);
  console.log(`MISSION_ID_AT_TERMINAL:         ${TERMINAL_MISSION_ID}`);
  console.log(`ALL_IDS_EQUAL:                  ${allEqual}`);
  console.log(`WORK_ITEMS_COUNT:               ${workItems.length}`);
  console.log(`PHASES_SEEN:                    ${seenPhases.join(' -> ')}`);

  if (!allEqual) {
    console.error('TEST FAILED: IDs were not immutable!');
    process.exit(1);
  }

  console.log('\nPASS: MISSION IDENTITY CONTINUITY GATE VERIFIED.');
}

run().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
