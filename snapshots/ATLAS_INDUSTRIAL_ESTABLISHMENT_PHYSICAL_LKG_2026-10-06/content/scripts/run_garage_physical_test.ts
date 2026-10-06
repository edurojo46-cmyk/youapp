async function runPhysicalTest() {
  console.log('--- Step 1: Compiling mission spec for GARAGE in ARG_CABA with target 20 ---');
  const specRes = await fetch('http://localhost:5174/api/industrial/missions/spec', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      objective: 'GARAGE',
      entity_type: 'ESTABLISHMENT',
      geography: 'ARG_CABA',
      target_new_records: 20,
      environment: 'PRODUCTION'
    })
  });

  const specData = await specRes.json();
  console.log('Spec response:', JSON.stringify(specData, null, 2));
  if (!specData.success || !specData.mission) {
    throw new Error('Failed to create spec');
  }

  const missionId = specData.mission.mission_id;
  console.log(`Mission created: ${missionId}`);

  console.log('--- Step 2: Starting mission ---');
  const startRes = await fetch(`http://localhost:5174/api/industrial/missions/${missionId}/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ allowedTarget: 20 })
  });

  const startData = await startRes.json();
  console.log('Start response:', JSON.stringify(startData, null, 2));

  console.log('--- Step 3: Polling mission progress ---');
  let done = false;
  let pollCount = 0;
  while (!done && pollCount < 40) {
    await new Promise(r => setTimeout(r, 1500));
    pollCount++;

    const pollRes = await fetch(`http://localhost:5174/api/industrial/missions/${missionId}`);
    const mission = await pollRes.json();

    const m = mission.data || mission.mission || mission;
    console.log(`[Poll #${pollCount}] Status: ${m.status} | Phase: ${m.checkpoint_data?.orchestrator_telemetry?.mission_phase} | Scanned: ${m.scanned_count} | Certified: ${m.certified_new_searchable} | TargetReached: ${m.target_reached}`);

    if (m.status !== 'STARTING' && m.status !== 'RUNNING') {
      console.log('=== FINAL MISSION RESULT ===');
      console.log('Status:', m.status);
      console.log('Terminal Reason:', m.terminal_reason);
      console.log('Scanned:', m.scanned_count);
      console.log('Certified New:', m.certified_new_searchable);
      console.log('Termination Proof:', JSON.stringify(m.checkpoint_data?.termination_proof, null, 2));
      console.log('Frontier:', JSON.stringify(m.checkpoint_data?.source_frontier, null, 2));
      console.log('Telemetry:', JSON.stringify(m.checkpoint_data?.orchestrator_telemetry, null, 2));
      done = true;
    }
  }
}

runPhysicalTest().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
