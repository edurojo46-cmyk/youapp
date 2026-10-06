/**
 * ATLAS — BLIND PATHFINDER GENERALIZATION TEST V2 RUNNER
 * Objective-Agnostic Autonomous Execution Protocol
 * 
 * STRICT INVARIANTS:
 * - Does NOT contain hardcoded blind objectives, templates, or shortcuts.
 * - Expects reports/atlas/pathfinder/blind_test_v2/BLIND_OBJECTIVES_V2.json.
 * - If absent, halts immediately with: BLIND_V2_OBJECTIVES_NOT_YET_PROVIDED.
 * - Verifies code freeze manifest SHA256 before and after execution.
 * - Freezes pre-execution plan and MISSION_SUCCESS_CONTRACT_HASH before any data gathering.
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

async function runBlindTestV2Harness() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('   ATLAS — BLIND PATHFINDER GENERALIZATION TEST V2 RUNNER     ');
  console.log('   Ontology-First Autonomous Execution Protocol                 ');
  console.log('════════════════════════════════════════════════════════════════\n');

  const objectivesPath = path.resolve('reports/atlas/pathfinder/blind_test_v2/BLIND_OBJECTIVES_V2.json');
  const freezeManifestPath = path.resolve('reports/atlas/pathfinder/blind_test_v2/BLIND_V2_CODE_FREEZE_MANIFEST.json');

  // Section 12 Check: Must halt if blind objectives file is absent
  if (!fs.existsSync(objectivesPath)) {
    console.error('────────────────────────────────────────────────────────────────');
    console.error('STOP: BLIND_V2_OBJECTIVES_NOT_YET_PROVIDED');
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
  console.log(`[FreezeAudit] Loaded Code Freeze Manifest V2 from ${freezeManifest.freezeTimestamp}`);
  console.log(`  Pathfinder V2 Tree Hash: ${freezeManifest.treeHashes.pathfinderTreeHash}`);
  console.log(`  Full Freeze Hash:        ${freezeManifest.treeHashes.fullFreezeHash}\n`);

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
  console.log(`[BlindTestHarness V2] Loaded ${objectives.length} external blind objectives.`);

  const objectiveFileHash = crypto
    .createHash('sha256')
    .update(fs.readFileSync(objectivesPath))
    .digest('hex');
  console.log(`[BlindTestHarness V2] BLIND_OBJECTIVES_FILE_HASH = ${objectiveFileHash}\n`);

  // Import dynamic Pathfinder intelligence modules
  const { AIPathfinder } = await import('../src/lib/atlasPathfinder/AIPathfinder.ts');
  const { DynamicSchemaDesigner } = await import('../src/lib/atlasPathfinder/DynamicSchemaDesigner.ts');
  const { PathGenerator } = await import('../src/lib/atlasPathfinder/PathGenerator.ts');
  const { FailureMemory } = await import('../src/lib/atlasPathfinder/FailureMemory.ts');
  const { AtlasOntologyMemory } = await import('../src/lib/atlasPathfinder/AtlasOntologyMemory.ts');
  const { BlindTestEvaluator } = await import('../src/lib/atlasPathfinder/evaluators/BlindTestEvaluator.ts');

  const pathfinder = AIPathfinder.getInstance();
  FailureMemory.initialize();
  AtlasOntologyMemory.initialize();

  const executionReports = [];
  const preExecutionPlans = [];

  const blindDbDir = path.resolve('reports/atlas/pathfinder/blind_test_v2/databases');
  const prePlansDir = path.resolve('reports/atlas/pathfinder/blind_test_v2/pre_execution_plans');
  if (!fs.existsSync(blindDbDir)) fs.mkdirSync(blindDbDir, { recursive: true });
  if (!fs.existsSync(prePlansDir)) fs.mkdirSync(prePlansDir, { recursive: true });

  for (let idx = 0; idx < objectives.length; idx++) {
    const extObj = objectives[idx];
    const objectiveId = extObj.objective_id || extObj.OBJECTIVE_ID || `OBJ_${idx + 1}`;
    const userObjective = extObj.user_objective || extObj.USER_OBJECTIVE;
    const targetQuantity = extObj.target_quantity || extObj.TARGET_QUANTITY || 10;
    const geographicRequirement = extObj.geographic_requirement || extObj.GEOGRAPHIC_REQUIREMENT;
    const mandatoryCriteria = extObj.mandatory_criteria || extObj.MANDATORY_CRITERIA || [];

    console.log(`════════════════════════════════════════════════════════════════`);
    console.log(`[BLIND MISSION ${idx + 1}/${objectives.length}] ID: ${objectiveId}`);
    console.log(`Objective: "${userObjective}"`);
    console.log(`════════════════════════════════════════════════════════════════`);

    // 1. T-Minus 1: Derive Ontology, Schema & Freeze Success Contract BEFORE execution (Section 15)
    const analysis = DynamicSchemaDesigner.designSchema(
      userObjective,
      targetQuantity,
      geographicRequirement,
      mandatoryCriteria
    );

    const initialCandidatePaths = PathGenerator.generateInitialPaths(analysis);
    const prePlan = BlindTestEvaluator.freezePreExecutionPlanV2(extObj, analysis, initialCandidatePaths);
    preExecutionPlans.push(prePlan);

    // Save frozen plan to disk
    const prePlanPath = path.join(prePlansDir, `${objectiveId}_plan_before_execution.json`);
    fs.writeFileSync(prePlanPath, JSON.stringify(prePlan, null, 2), 'utf8');

    console.log(`[PrePlanFreeze] Success contract frozen before execution:`);
    console.log(`  MISSION_SUCCESS_CONTRACT_HASH = ${prePlan.contractHash}`);
    console.log(`  Primary Unit: ${prePlan.primaryUnit} (${prePlan.primaryUnitCategory}) | Fields: ${analysis.schema.fields.length} | Target: ${prePlan.targetQuantity}\n`);

    // 2. Execute Mission autonomously using frozen intelligence engine
    let dbResult;
    let executionError = null;
    try {
      dbResult = await pathfinder.executePathfinderMission(userObjective, {
        targetQuantity,
        geographyHint: geographicRequirement,
        mandatoryCriteria,
        forceReplan: false
      });
    } catch (err) {
      executionError = err;
      console.error(`[BlindTestHarness V2] Technical error executing mission ${objectiveId}:`, err);
    }

    if (executionError || !dbResult) {
      executionReports.push({
        objectiveId,
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
          entitiesVerified: 0,
          missionQualifiedRecords: 0,
          missionRejectedRecords: 0,
          qualificationUnknownCount: 0,
          overallFieldCompleteness: 0,
          structuralCompleteness: 0,
          semanticCompleteness: 0,
          evidenceCompleteness: 0,
          qualificationCompleteness: 0,
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
    const report = BlindTestEvaluator.evaluateMissionV2(
      prePlan,
      extObj,
      database,
      postmortem,
      dbSavePath
    );

    executionReports.push(report);
    console.log(`[Evaluation V2] Mission ${objectiveId} Outcome: ${report.status}`);
    console.log(`  Primary Unit: ${prePlan.primaryUnit} (${prePlan.primaryUnitCategory})`);
    console.log(`  Mandatory Pass: ${report.mandatoryCriteriaPass} | Qualified Records: ${report.metrics.missionQualifiedRecords}/${report.metrics.targetQuantity}`);
    console.log(`  Structural: ${report.metrics.structuralCompleteness}% | Semantic: ${report.metrics.semanticCompleteness}% | Qualification: ${report.metrics.qualificationCompleteness}%`);
    if (postmortem.telemetry) {
      console.log(`  Telemetry: Ontology=${postmortem.telemetry.time_to_ontology}ms | Schema=${postmortem.telemetry.time_to_schema}ms | FirstQualified=${postmortem.telemetry.time_to_first_qualified}ms | TargetQualified=${postmortem.telemetry.time_to_target_qualified}ms`);
    }
    console.log('');
  }

  // Re-verify code hashes after execution
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
  const diversityAudit = BlindTestEvaluator.auditBehaviorDiversityV2(preExecutionPlans, executionReports);

  const finalReport = {
    testRunId: `BLIND_RUN_V2_${Date.now()}`,
    freezeManifestTimestamp: freezeManifest.freezeTimestamp,
    objectiveFileHash,
    objectivesCount: objectives.length,
    postFreezeIntelligenceCodeChanges: postFreezeChanges,
    diversityAudit,
    executionReports
  };

  const finalOutPath = path.resolve('reports/atlas/pathfinder/blind_test_v2/BLIND_TEST_V2_EXECUTION_REPORT.json');
  fs.writeFileSync(finalOutPath, JSON.stringify(finalReport, null, 2), 'utf8');

  console.log('════════════════════════════════════════════════════════════════');
  console.log('   BLIND TEST V2 EXECUTION COMPLETED                           ');
  console.log('════════════════════════════════════════════════════════════════');
  console.log(`POST_FREEZE_INTELLIGENCE_CODE_CHANGES = ${postFreezeChanges}`);
  console.log(`BUILT_IN_PRIMARY_UNITS = ${diversityAudit.builtInPrimaryUnitsUsed.join(', ')}`);
  console.log(`MISSION_DEFINED_PRIMARY_UNITS = ${diversityAudit.missionDefinedPrimaryUnitsCreated.join(', ')}`);
  console.log(`SCHEMA_FIELDSET_DIVERSITY = ${diversityAudit.schemaFieldsetDiversity}`);
  console.log(`ONTOLOGY_TEMPLATE_COLLAPSE_SUSPECTED = ${diversityAudit.ontologyTemplateCollapseSuspected ? 'TRUE' : 'FALSE'}`);
  console.log(`Full report persisted to: ${finalOutPath}\n`);
}

runBlindTestV2Harness().catch(err => {
  console.error('[run_atlas_pathfinder_blind_test_v2] Fatal execution error:', err);
  process.exit(1);
});
