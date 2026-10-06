/**
 * PHYSICAL VERIFICATION SCRIPT: UNIVERSAL MISSION ORCHESTRATOR V1
 * scripts/verify_universal_orchestrator_physical.ts
 */

interface CaseResult {
  name: string;
  objective: string;
  geography: string;
  mission_id: string;
  status: string;
  terminal_reason: string;
  target: number;
  net_new: number;
  duplicates: number;
  rejected: number;
  probe_rows: number;
  acquisition_rows: number;
  source_paths_attempted: number;
  source_paths_remaining: number;
  continued_after_probe: boolean;
  has_termination_proof: boolean;
  unaccounted_rows: number;
  double_counted_rows: number;
}

const BASE_URL = 'http://localhost:5174';

async function safeFetchJson(url: string, options?: any) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status} from ${url}: ${text}`);
  }
  return await res.json();
}

async function runPhysicalCase(name: string, objective: string, geography: string, targetLimit = 20): Promise<CaseResult> {
  console.log(`\n========================================================`);
  console.log(`RUNNING PHYSICAL CASE: ${name} (Target: ${targetLimit})`);
  console.log(`Objective: "${objective}" | Geography: "${geography}"`);
  console.log(`========================================================`);

  // 1. Create Spec
  const specRes = await safeFetchJson(`${BASE_URL}/api/industrial/missions/spec`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      objective,
      geography,
      target_new_records: targetLimit,
      environment: 'PRODUCTION'
    })
  });

  if (!specRes.success || !specRes.mission) {
    throw new Error(`Failed to create mission spec: ${JSON.stringify(specRes)}`);
  }

  const missionId = specRes.mission.mission_id;
  console.log(`[SPEC CREATED] Mission ID: ${missionId}`);

  // 2. Start Mission
  const startRes = await safeFetchJson(`${BASE_URL}/api/industrial/missions/${missionId}/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ allowedTarget: targetLimit })
  });

  console.log(`[MISSION STARTED] Status: ${startRes.status || 'STARTED'}`);

  // 3. Poll until terminal
  const terminalStatuses = [
    'COMPLETED',
    'TARGET_REACHED',
    'SOURCE_FRONTIER_EXHAUSTED_WITH_PROOF',
    'NO_VALIDATED_SOURCE_EXISTS_AFTER_DISCOVERY',
    'ALL_EXECUTABLE_SOURCES_TECHNICALLY_FAILED',
    'FAILED',
    'CANCELLED'
  ];

  let currentMission: any = null;
  let iterations = 0;
  const maxIterations = 60; // 60 seconds max per mission

  while (iterations < maxIterations) {
    await new Promise(r => setTimeout(r, 1000));
    iterations++;

    const getRes = await safeFetchJson(`${BASE_URL}/api/industrial/missions/${missionId}`);
    currentMission = getRes.mission;

    const orchestratorTel = currentMission.orchestrator || {};
    const probeRows = orchestratorTel.probe_rows || currentMission.probe_rows || 0;
    const acqRows = orchestratorTel.acquisition_rows || currentMission.acquisition_rows || 0;
    const pathsAttempted = orchestratorTel.source_paths_attempted || 0;

    process.stdout.write(`\r[POLL ${iterations}s] Phase: ${currentMission.mission_phase || currentMission.status} | Scanned: ${currentMission.scanned_count} (Probe: ${probeRows}, Acq: ${acqRows}) | Certified: ${currentMission.certified_new_searchable} | Paths: ${pathsAttempted}`);

    if (terminalStatuses.includes(currentMission.status) || (currentMission.terminal_reason && currentMission.status !== 'RUNNING' && currentMission.status !== 'STARTING')) {
      console.log(`\n[TERMINAL REACHED] Status: ${currentMission.status} | Reason: ${currentMission.terminal_reason}`);
      break;
    }
  }

  const orchestratorTel = currentMission.orchestrator || {};
  const probeRows = orchestratorTel.probe_rows || currentMission.probe_rows || 0;
  const acqRows = orchestratorTel.acquisition_rows || currentMission.acquisition_rows || 0;
  const totalScanned = currentMission.scanned_count || (probeRows + acqRows);
  const netNew = currentMission.certified_new_searchable || 0;
  const duplicates = currentMission.duplicate_existing_count || 0;
  const rejected = currentMission.rejected_count || 0;
  const pathsAttempted = orchestratorTel.source_paths_attempted || 1;
  const pathsRemaining = orchestratorTel.source_paths_remaining || 0;

  // Invariant verification:
  // If first probe produced 0 certified: did mission continue?
  // (Either acqRows > 0, pathsAttempted > 1, or termination proof formal exhaustion)
  const continuedAfterProbe = acqRows > 0 || pathsAttempted > 1 || currentMission.status === 'SOURCE_FRONTIER_EXHAUSTED_WITH_PROOF' || currentMission.status === 'NO_VALIDATED_SOURCE_EXISTS_AFTER_DISCOVERY';

  const hasTerminationProof = Boolean(currentMission.termination_proof || orchestratorTel.termination_proof || currentMission.terminal_reason);

  const accounted = netNew + duplicates + rejected;
  const unaccounted = Math.max(0, totalScanned - accounted);
  const doubleCounted = Math.max(0, accounted - totalScanned);

  return {
    name,
    objective,
    geography,
    mission_id: missionId,
    status: currentMission.status,
    terminal_reason: currentMission.terminal_reason || currentMission.status,
    target: targetLimit,
    net_new: netNew,
    duplicates,
    rejected,
    probe_rows: probeRows,
    acquisition_rows: acqRows,
    source_paths_attempted: pathsAttempted,
    source_paths_remaining: pathsRemaining,
    continued_after_probe: continuedAfterProbe,
    has_termination_proof: hasTerminationProof,
    unaccounted_rows: unaccounted,
    double_counted_rows: doubleCounted
  };
}

async function main() {
  console.log('Checking backend runtime health...');
  const runtimeStatus = await safeFetchJson(`${BASE_URL}/api/runtime-status`);
  console.log('Runtime Status:', runtimeStatus);

  const results: CaseResult[] = [];

  // Core Cases (TARGET_TEST = 20)
  const coreCases = [
    { name: 'GARAGE', objective: 'GARAGE', geography: 'ARG_CABA' },
    { name: 'LIBRERIAS', objective: 'LIBRERIAS', geography: 'ARG_CABA' },
    { name: 'AGENCIA_AUTOS', objective: 'AGENCIA DE AUTOS', geography: 'ARG_BSAS_SAN_ISIDRO' }
  ];

  for (const c of coreCases) {
    const res = await runPhysicalCase(c.name, c.objective, c.geography, 20);
    results.push(res);
  }

  // Blind Generalization Cases (TARGET_TEST = 20)
  const blindCases = [
    { name: 'BLIND_FERRETERIAS', objective: 'FERRETERIAS', geography: 'ARG_SANTA_FE_ROSARIO' },
    { name: 'BLIND_HOTEL', objective: 'HOTEL', geography: 'ARG_CORDOBA' },
    { name: 'BLIND_PLASTICOS', objective: 'FABRICA DE PLASTICOS', geography: 'ARG_BSAS_QUILMES' },
    { name: 'BLIND_BODEGAS', objective: 'BODEGAS', geography: 'ARG_MENDOZA' },
    { name: 'BLIND_PANADERIAS', objective: 'PANADERIAS', geography: 'ARG_BSAS_LA_PLATA' }
  ];

  for (const c of blindCases) {
    const res = await runPhysicalCase(c.name, c.objective, c.geography, 20);
    results.push(res);
  }

  console.log('\n\n========================================================');
  console.log('PHYSICAL VERIFICATION REPORT — TARGET 20');
  console.log('========================================================');
  console.table(results.map(r => ({
    Case: r.name,
    Status: r.status,
    TerminalReason: r.terminal_reason,
    ProbeRows: r.probe_rows,
    AcqRows: r.acquisition_rows,
    PathsAttempted: r.source_paths_attempted,
    NetNew: r.net_new,
    ContinuedAfterProbe: r.continued_after_probe ? 'YES' : 'NO',
    Unaccounted: r.unaccounted_rows,
    ProofValid: r.has_termination_proof ? 'YES' : 'NO'
  })));

  // Write results JSON artifact
  const fs = await import('fs');
  fs.writeFileSync('physical_verification_results.json', JSON.stringify(results, null, 2));
  console.log('Results written to physical_verification_results.json');
}

main().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
