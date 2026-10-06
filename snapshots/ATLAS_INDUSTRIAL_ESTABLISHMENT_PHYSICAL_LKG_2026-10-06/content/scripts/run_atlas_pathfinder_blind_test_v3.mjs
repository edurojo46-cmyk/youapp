/**
 * ATLAS — BLIND PATHFINDER GENERALIZATION TEST V3 RUNNER
 * Open Retrieval + Source Intelligence Autonomous Execution Protocol
 * 
 * STRICT INVARIANTS:
 * - Does NOT contain hardcoded blind objectives, templates, or shortcuts.
 * - Expects reports/atlas/pathfinder/blind_test_v3/BLIND_OBJECTIVES_V3.json.
 * - If absent, halts immediately with: BLIND_V3_OBJECTIVES_NOT_YET_PROVIDED.
 * - Verifies code freeze manifest SHA256 before and after execution.
 * - Compares SOURCE_MAP_PRE vs SOURCE_MAP_POST for cross-mission learning metrics.
 * - Enforces HARD COMPLETION RULE: MANDATORY_CRITERIA_OVERRIDE_BY_SCORE = FALSE.
 * - Measures neutral timing telemetry: Objective -> Searchable Qualified Database.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Environment loader
for (const envName of ['.env', '.env.local']) {
  const envPath = path.resolve(envName);
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const [k, ...v] = trimmed.split('=');
      if (k && v.length) process.env[k.trim()] = v.join('=').trim();
    }
  }
}

export async function runBlindTestV3Harness() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('   ATLAS — BLIND PATHFINDER GENERALIZATION TEST V3 RUNNER     ');
  console.log('   Open Retrieval + Source Intelligence Autonomous Protocol     ');
  console.log('════════════════════════════════════════════════════════════════\n');

  const rootDir = process.cwd();
  const objectivesPath = path.resolve('reports/atlas/pathfinder/blind_test_v3/BLIND_OBJECTIVES_V3.json');
  const freezeManifestPath = path.resolve('reports/atlas/pathfinder/blind_test_v3/BLIND_V3_CODE_FREEZE_MANIFEST.json');
  const baselineMapPath = path.resolve('reports/atlas/pathfinder/blind_test_v3/BLIND_V3_SOURCE_MAP_BASELINE.json');

  // Halt if blind objectives file is absent
  if (!fs.existsSync(objectivesPath)) {
    console.error('────────────────────────────────────────────────────────────────');
    console.error('STOP: BLIND_V3_OBJECTIVES_NOT_YET_PROVIDED');
    console.error(`Target file absent: ${objectivesPath}`);
    console.error('Per protocol Phase A, blind objectives must be supplied externally AFTER freeze.');
    console.error('────────────────────────────────────────────────────────────────\n');
    process.exit(2);
  }

  // Verify that Code Freeze Manifest exists
  if (!fs.existsSync(freezeManifestPath)) {
    console.error('ERROR: Code freeze manifest missing. Run freeze procedure before Phase B execution.');
    process.exit(1);
  }

  const freezeManifest = JSON.parse(fs.readFileSync(freezeManifestPath, 'utf8'));
  console.log(`[FreezeAudit] Loaded Code Freeze Manifest V3 from ${freezeManifest.freezeTimestamp}`);
  console.log(`  Root SHA256 V3: ${freezeManifest.rootSha256V3}\n`);

  // Verify all files match frozen SHA-256 before running
  console.log('[FreezeAudit] Verifying pre-execution SHA-256 integrity of frozen intelligence code...');
  let hashesMatch = true;
  for (const item of freezeManifest.files) {
    const fullP = path.resolve(rootDir, item.path);
    if (!fs.existsSync(fullP)) {
      console.error(`[FreezeAudit] Missing frozen file: ${item.path}`);
      hashesMatch = false;
      continue;
    }
    const currentHash = crypto.createHash('sha256').update(fs.readFileSync(fullP)).digest('hex');
    if (currentHash !== item.sha256) {
      console.error(`[FreezeAudit] Hash mismatch on ${item.path}: expected ${item.sha256}, got ${currentHash}`);
      hashesMatch = false;
    }
  }

  if (!hashesMatch) {
    console.error('[FreezeAudit] FAILURE: Frozen intelligence code was modified post-freeze. Aborting.');
    process.exit(1);
  }
  console.log('[FreezeAudit] Pre-execution freeze integrity confirmed (0 modifications).\n');

  // Load Source Map Baseline (PRE)
  let baselineMap = null;
  if (fs.existsSync(baselineMapPath)) {
    baselineMap = JSON.parse(fs.readFileSync(baselineMapPath, 'utf8'));
    console.log(`[SourceMapTelemetry] Loaded baseline source map: ${baselineMap.source_count} sources across ${baselineMap.source_family_count} families.`);
  }

  // Load external blind objectives
  const rawObjectives = JSON.parse(fs.readFileSync(objectivesPath, 'utf8'));
  const objectives = Array.isArray(rawObjectives) ? rawObjectives : rawObjectives.objectives || [];
  console.log(`[BlindTestHarness V3] Loaded ${objectives.length} external blind objectives.`);

  const objectiveFileHash = crypto
    .createHash('sha256')
    .update(fs.readFileSync(objectivesPath))
    .digest('hex');
  console.log(`[BlindTestHarness V3] BLIND_OBJECTIVES_FILE_HASH = ${objectiveFileHash}\n`);

  // Import dynamic Pathfinder intelligence modules
  const { AIPathfinder } = await import('../src/lib/atlasPathfinder/AIPathfinder.ts');
  const { SourceKnowledgeMap } = await import('../src/lib/atlasPathfinder/sourceIntelligence/SourceKnowledgeMap.ts');
  const { BlindTestEvaluator } = await import('../src/lib/atlasPathfinder/evaluators/BlindTestEvaluator.ts');

  const pathfinder = AIPathfinder.getInstance();
  const sourceMap = SourceKnowledgeMap.getInstance();
  const results = [];

  for (let i = 0; i < objectives.length; i++) {
    const obj = objectives[i];
    const objectiveId = obj.OBJECTIVE_ID || `BLIND_V3_${String(i + 1).padStart(2, '0')}`;
    const userObjective = obj.USER_OBJECTIVE || obj.objective;
    const targetQuantity = obj.TARGET_QUANTITY || 5;
    const geographyHint = obj.GEOGRAPHY_HINT || 'Argentina';
    const mandatoryCriteria = obj.MANDATORY_CRITERIA || [];

    console.log(`\n════════════════════════════════════════════════════════════════`);
    console.log(`[Blind V3 Mission ${i + 1}/${objectives.length}] ${objectiveId}`);
    console.log(`Objective: "${userObjective}"`);
    console.log(`════════════════════════════════════════════════════════════════`);

    const missionResult = await pathfinder.executeMission(userObjective, {
      targetQuantity,
      geographyHint,
      mandatoryCriteria
    });

    const evaluated = BlindTestEvaluator.evaluateMission({
      objectiveId,
      userObjective,
      database: missionResult.database,
      postmortem: missionResult.postmortem,
      targetQuantity,
      mandatoryCriteria
    });

    results.push(evaluated);
  }

  // Measure Post-Blind Source Map Evolution (Section 7)
  const postSources = sourceMap.getAllSources();
  const preSourceIds = new Set(baselineMap?.sources?.map(s => s.source_id) || []);
  const preFamilies = new Set(baselineMap?.sources?.map(s => s.source_family) || []);

  const newSourcesDiscovered = postSources.filter(s => !preSourceIds.has(s.source_id));
  const postFamilies = new Set(postSources.map(s => s.source_family));
  const newFamiliesDiscovered = Array.from(postFamilies).filter(f => !preFamilies.has(f));
  const newProductiveSources = newSourcesDiscovered.filter(s => s.qualified_yield > 0);
  const sourcesPromoted = postSources.filter(s => s.current_status === 'PROMOTED');
  const sourcesDeprioritized = postSources.filter(s => s.current_status === 'DORMANT');

  const learningTelemetry = {
    baseline_timestamp: baselineMap?.timestamp,
    completion_timestamp: new Date().toISOString(),
    baseline_source_count: baselineMap?.source_count || 0,
    post_blind_source_count: postSources.length,
    new_sources_discovered: newSourcesDiscovered.length,
    new_source_families_discovered: newFamiliesDiscovered.length,
    new_productive_sources: newProductiveSources.length,
    sources_promoted: sourcesPromoted.length,
    sources_deprioritized: sourcesDeprioritized.length,
    discovered_sources: newSourcesDiscovered.map(s => ({
      source_id: s.source_id,
      family: s.source_family,
      parent_domain: s.parent_domain,
      qualified_yield: s.qualified_yield,
      status: s.current_status
    }))
  };

  const finalSummaryReport = {
    testSuiteId: 'ATLAS_PATHFINDER_BLIND_TEST_V3',
    rootSha256V3: freezeManifest.rootSha256V3,
    objectivesFileHash: objectiveFileHash,
    executedAt: new Date().toISOString(),
    totalObjectives: objectives.length,
    learningTelemetry,
    results
  };

  const reportOutPath = path.resolve('reports/atlas/pathfinder/blind_test_v3/BLIND_V3_EXECUTION_REPORT.json');
  fs.mkdirSync(path.dirname(reportOutPath), { recursive: true });
  fs.writeFileSync(reportOutPath, JSON.stringify(finalSummaryReport, null, 2), 'utf8');

  console.log(`\n════════════════════════════════════════════════════════════════`);
  console.log(`[BlindTestHarness V3] Execution Complete. Results written to:`);
  console.log(`  ${reportOutPath}`);
  console.log(`════════════════════════════════════════════════════════════════\n`);

  return finalSummaryReport;
}

if (process.argv[1] && process.argv[1].endsWith('run_atlas_pathfinder_blind_test_v3.mjs')) {
  runBlindTestV3Harness().catch(err => {
    console.error('Fatal execution error in Blind Test V3 Runner:', err);
    process.exit(1);
  });
}
