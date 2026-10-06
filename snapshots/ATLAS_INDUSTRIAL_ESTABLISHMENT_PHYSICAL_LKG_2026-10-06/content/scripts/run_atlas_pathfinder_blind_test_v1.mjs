/**
 * ATLAS — BLIND PATHFINDER GENERALIZATION TEST V1
 * Automated Test Runner Harness (Objective-Agnostic)
 * 
 * STRICT INVARIANTS:
 * - Does NOT contain hardcoded blind objectives or templates.
 * - Checks for reports/atlas/pathfinder/blind_test_v1/BLIND_OBJECTIVES_V1.json.
 * - If absent, halts immediately with: BLIND_OBJECTIVES_NOT_YET_PROVIDED.
 * - Verifies code freeze manifest SHA256 before and after execution.
 * - Freezes pre-execution plan and MISSION_SUCCESS_CONTRACT_HASH before any data gathering.
 * - Enforces HARD COMPLETION RULE: MANDATORY_CRITERIA_OVERRIDE_BY_SCORE = FALSE.
 * - Computes counterfactual transfer tests across sequential missions.
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

async function runBlindTestHarness() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('   ATLAS — BLIND PATHFINDER GENERALIZATION TEST V1 RUNNER     ');
  console.log('   Objective-Agnostic Autonomous Execution Protocol             ');
  console.log('════════════════════════════════════════════════════════════════\n');

  const objectivesPath = path.resolve('reports/atlas/pathfinder/blind_test_v1/BLIND_OBJECTIVES_V1.json');
  const freezeManifestPath = path.resolve('reports/atlas/pathfinder/blind_test_v1/BLIND_TEST_CODE_FREEZE_MANIFEST.json');

  // Section 8 Check: Must halt if blind objectives file is absent
  if (!fs.existsSync(objectivesPath)) {
    console.error('────────────────────────────────────────────────────────────────');
    console.error('STOP: BLIND_OBJECTIVES_NOT_YET_PROVIDED');
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
  console.log(`[FreezeAudit] Loaded Code Freeze Manifest from ${freezeManifest.freezeTimestamp}`);
  console.log(`  Pathfinder Tree Hash:   ${freezeManifest.treeHashes.pathfinderTreeHash}`);
  console.log(`  Full Freeze Hash:       ${freezeManifest.treeHashes.fullBlindTestFreezeHash}\n`);

  // Verify all files match frozen SHA-256 before running
  console.log('[FreezeAudit] Verifying pre-execution SHA-256 integrity of frozen intelligence code...');
  let hashesMatch = true;
  for (const item of freezeManifest.files) {
    if (!fs.existsSync(item.path)) {
      console.error(`[FreezeAudit] Missing frozen file: ${item.path}`);
      hashesMatch = false;
      continue;
    }
    const currentHash = crypto.createHash('sha256').update(fs.readFileSync(item.path)).digest('hex');
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

  // Load external blind objectives
  const rawObjectives = JSON.parse(fs.readFileSync(objectivesPath, 'utf8'));
  const objectives = Array.isArray(rawObjectives) ? rawObjectives : rawObjectives.objectives || [];
  console.log(`[BlindTestHarness] Loaded ${objectives.length} external blind objectives.`);

  const objectiveFileHash = crypto
    .createHash('sha256')
    .update(fs.readFileSync(objectivesPath))
    .digest('hex');
  console.log(`[BlindTestHarness] BLIND_OBJECTIVES_FILE_HASH = ${objectiveFileHash}\n`);

  // Import dynamic Pathfinder intelligence modules
  const { AIPathfinder } = await import('../src/lib/atlasPathfinder/AIPathfinder.ts');
  const { DynamicSchemaDesigner } = await import('../src/lib/atlasPathfinder/DynamicSchemaDesigner.ts');
  const { PathGenerator } = await import('../src/lib/atlasPathfinder/PathGenerator.ts');
  const { FailureMemory } = await import('../src/lib/atlasPathfinder/FailureMemory.ts');
  const { BlindTestEvaluator } = await import('../src/lib/atlasPathfinder/evaluators/BlindTestEvaluator.ts');

  const pathfinder = AIPathfinder.getInstance();
  FailureMemory.initialize();

  const executionReports = [];
  const preExecutionPlans = [];

  const blindDbDir = path.resolve('reports/atlas/pathfinder/blind_test_v1/databases');
  const prePlansDir = path.resolve('reports/atlas/pathfinder/blind_test_v1/pre_execution_plans');
  if (!fs.existsSync(blindDbDir)) fs.mkdirSync(blindDbDir, { recursive: true });
  if (!fs.existsSync(prePlansDir)) fs.mkdirSync(prePlansDir, { recursive: true });

  for (let idx = 0; idx < objectives.length; idx++) {
    const extObj = objectives[idx];
    console.log(`════════════════════════════════════════════════════════════════`);
    console.log(`[BLIND MISSION ${idx + 1}/${objectives.length}] ID: ${extObj.objective_id}`);
    console.log(`Objective: "${extObj.user_objective}"`);
    console.log(`════════════════════════════════════════════════════════════════`);

    // 1. T-Minus 1: Derive Schema & Freeze Success Criteria BEFORE execution (Section 11 & 12)
    const analysis = DynamicSchemaDesigner.designSchema(
      extObj.user_objective,
      extObj.target_quantity,
      extObj.geographic_requirement
    );

    const initialCandidatePaths = PathGenerator.generateInitialPaths(analysis);
    const prePlan = BlindTestEvaluator.freezePreExecutionPlan(extObj, analysis, initialCandidatePaths);
    preExecutionPlans.push(prePlan);

    // Save frozen plan to disk
    const prePlanPath = path.join(prePlansDir, `${extObj.objective_id}_plan_before_execution.json`);
    fs.writeFileSync(prePlanPath, JSON.stringify(prePlan, null, 2), 'utf8');

    console.log(`[PrePlanFreeze] Success criteria frozen before execution:`);
    console.log(`  MISSION_SUCCESS_CONTRACT_HASH = ${prePlan.contractHash}`);
    console.log(`  Derived Entity: ${analysis.entityType} | Fields: ${analysis.schema.fields.length} | Target: ${prePlan.targetQuantity}\n`);

    // 2. Execute Mission autonomously using frozen intelligence engine
    let dbResult;
    let executionError = null;
    try {
      dbResult = await pathfinder.executePathfinderMission(extObj.user_objective, {
        targetQuantity: extObj.target_quantity,
        geographyHint: extObj.geographic_requirement,
        forceReplan: false // Replan arises dynamically from evidence, never forced in blind tests
      });
    } catch (err) {
      executionError = err;
      console.error(`[BlindTestHarness] Technical error executing mission ${extObj.objective_id}:`, err);
    }

    if (executionError || !dbResult) {
      executionReports.push({
        objectiveId: extObj.objective_id,
        contractHash: prePlan.contractHash,
        status: 'TECHNICAL_FAILURE',
        mandatoryCriteriaPass: false,
        quantityCriterionPass: false,
        fieldCompletenessPass: false,
        evidenceCompletenessPass: false,
        coveragePass: false,
        databasePersistencePass: false,
        canonicalLinksRetained: false,
        metrics: {
          targetQuantity: prePlan.targetQuantity,
          recordsCreated: 0,
          verifiedRecords: 0,
          overallFieldCompleteness: 0,
          mandatoryFieldCompleteness: 0,
          pathsGenerated: initialCandidatePaths.length,
          pathsTested: 0,
          replans: 0,
          nextBestActionDecisions: 0
        },
        failureOrPartialReason: `BLIND_TEST_INFRASTRUCTURE_FAILURE: ${executionError?.message || 'Execution error'}`
      });
      continue;
    }

    const { database, postmortem } = dbResult;
    const dbSavePath = database.saveToDisk(blindDbDir);

    // 3. Evaluate against the frozen success contract
    const report = BlindTestEvaluator.evaluateMission(
      prePlan,
      extObj,
      database,
      postmortem,
      dbSavePath
    );

    // Section 25: Counterfactual transfer check on later missions
    if (idx >= 1) {
      const heuristics = FailureMemory.getHeuristicsForEntity(analysis.entityType);
      if (heuristics.length > 0) {
        const topLesson = heuristics[0];
        report.counterfactualTransfer = BlindTestEvaluator.evaluateCounterfactualTransfer({
          entityType: analysis.entityType,
          topics: analysis.domainTopics,
          lesson: { id: topLesson.heuristicId, rule: topLesson.rule },
          baselineEngineChoice: 'UNCONSTRAINED_KEYWORD_DISCOVERY',
          optimizedEngineChoice: postmortem.winningPaths[0] || 'ADAPTED_REGISTRY_PIPELINE'
        });
      }
    }

    executionReports.push(report);
    console.log(`[Evaluation] Mission ${extObj.objective_id} Outcome: ${report.status}`);
    console.log(`  Mandatory Pass: ${report.mandatoryCriteriaPass} | Quantity: ${report.quantityCriterionPass} (${report.metrics.recordsCreated}/${report.metrics.targetQuantity})`);
    console.log(`  Field Completeness: ${report.metrics.overallFieldCompleteness}% | Persisted: ${report.databasePersistencePass}\n`);
  }

  // Re-verify code hashes after execution (Section 5)
  console.log('[FreezeAudit] Re-verifying post-execution SHA-256 integrity of frozen intelligence code...');
  let postHashesMatch = true;
  for (const item of freezeManifest.files) {
    const currentHash = crypto.createHash('sha256').update(fs.readFileSync(item.path)).digest('hex');
    if (currentHash !== item.sha256) {
      console.error(`[FreezeAudit] Post-execution modification detected on ${item.path}`);
      postHashesMatch = false;
    }
  }

  const postFreezeChanges = postHashesMatch ? 0 : 1;
  const diversityAudit = BlindTestEvaluator.auditBehaviorDiversity(executionReports);

  const finalReport = {
    testRunId: `BLIND_RUN_${Date.now()}`,
    freezeManifestTimestamp: freezeManifest.freezeTimestamp,
    objectiveFileHash,
    objectivesCount: objectives.length,
    postFreezeIntelligenceCodeChanges: postFreezeChanges,
    scriptedBehaviorSuspected: diversityAudit.scriptedBehaviorSuspected,
    executionReports
  };

  const finalOutPath = path.resolve('reports/atlas/pathfinder/blind_test_v1/BLIND_TEST_EXECUTION_REPORT.json');
  fs.writeFileSync(finalOutPath, JSON.stringify(finalReport, null, 2), 'utf8');

  console.log('════════════════════════════════════════════════════════════════');
  console.log('   BLIND TEST EXECUTION COMPLETED                              ');
  console.log('════════════════════════════════════════════════════════════════');
  console.log(`POST_FREEZE_INTELLIGENCE_CODE_CHANGES = ${postFreezeChanges}`);
  console.log(`SCRIPTED_BEHAVIOR_SUSPECTED = ${diversityAudit.scriptedBehaviorSuspected ? 'TRUE' : 'FALSE'}`);
  console.log(`Full report persisted to: ${finalOutPath}\n`);
}

runBlindTestHarness().catch(err => {
  console.error('[run_atlas_pathfinder_blind_test_v1] Fatal execution error:', err);
  process.exit(1);
});
