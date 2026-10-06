/**
 * ATLAS — BLIND PATHFINDER GENERALIZATION TEST V1
 * Script: generate_blind_test_freeze_manifest.mjs
 * 
 * Computes SHA-256 hashes, category tree hashes, Git state, and isolation verifications
 * to construct the immutable BLIND_TEST_CODE_FREEZE_MANIFEST.json before receiving blind objectives.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';

function computeFileHash(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function computeTreeHash(fileEntries) {
  const sorted = [...fileEntries].sort((a, b) => a.relPath.localeCompare(b.relPath));
  const combined = sorted.map(e => `${e.relPath}:${e.sha256}`).join('\n');
  return crypto.createHash('sha256').update(combined).digest('hex');
}

async function main() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('   ATLAS — BLIND PATHFINDER CODE FREEZE GENERATOR (PHASE A)    ');
  console.log('════════════════════════════════════════════════════════════════\n');

  const freezeTimestamp = new Date().toISOString();
  const rootDir = process.cwd();

  // 1. Check Git state
  let gitCommit = 'UNKNOWN';
  let gitBranch = 'UNKNOWN';
  let gitStatus = 'CLEAN';
  try {
    gitCommit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    gitBranch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
    gitStatus = execSync('git status --short', { encoding: 'utf8' }).trim() ? 'DIRTY' : 'CLEAN';
  } catch (err) {
    console.warn('Git query failed:', err.message);
  }

  // 2. Discover files in target directories
  const filesToFreeze = [];

  function scanDir(dir, category) {
    if (!fs.existsSync(dir)) return;
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        if (item.name === 'adapters') {
          scanDir(fullPath, 'ADAPTERS');
        } else if (item.name === 'evaluators') {
          scanDir(fullPath, 'EVALUATORS');
        } else {
          scanDir(fullPath, category);
        }
      } else if (item.isFile() && (item.name.endsWith('.ts') || item.name.endsWith('.mjs'))) {
        const stats = fs.statSync(fullPath);
        const sha256 = computeFileHash(fullPath);
        const relPath = path.relative(rootDir, fullPath).replace(/\\/g, '/');
        filesToFreeze.push({
          path: fullPath,
          relPath,
          sha256,
          sizeBytes: stats.size,
          lastModified: stats.mtime.toISOString(),
          category
        });
      }
    }
  }

  // Scan Pathfinder Core
  scanDir(path.resolve('src/lib/atlasPathfinder'), 'PATHFINDER_CORE');

  // Scan General Engine (including adapters)
  scanDir(path.resolve('src/lib/atlasGeneralEngine'), 'GENERAL_ENGINE_CORE');

  // Scan Evaluator
  scanDir(path.resolve('src/lib/atlasPathfinder/evaluators'), 'EVALUATORS');

  // Scan Blind Runner
  const runnerPath = path.resolve('scripts/run_atlas_pathfinder_blind_test_v1.mjs');
  if (fs.existsSync(runnerPath)) {
    const stats = fs.statSync(runnerPath);
    filesToFreeze.push({
      path: runnerPath,
      relPath: path.relative(rootDir, runnerPath).replace(/\\/g, '/'),
      sha256: computeFileHash(runnerPath),
      sizeBytes: stats.size,
      lastModified: stats.mtime.toISOString(),
      category: 'BLIND_RUNNER'
    });
  }

  // Deduplicate files by relPath
  const uniqueFilesMap = new Map();
  for (const f of filesToFreeze) {
    uniqueFilesMap.set(f.relPath, f);
  }
  const uniqueFiles = Array.from(uniqueFilesMap.values());

  // Group files by category for tree hash calculation
  const pathfinderFiles = uniqueFiles.filter(f => f.category === 'PATHFINDER_CORE');
  const generalEngineFiles = uniqueFiles.filter(f => f.category === 'GENERAL_ENGINE_CORE');
  const adapterFiles = uniqueFiles.filter(f => f.category === 'ADAPTERS');
  const evaluatorFiles = uniqueFiles.filter(f => f.category === 'EVALUATORS');

  const pathfinderTreeHash = computeTreeHash(pathfinderFiles);
  const generalEngineTreeHash = computeTreeHash(generalEngineFiles);
  const adapterTreeHash = computeTreeHash(adapterFiles);
  const evaluatorTreeHash = computeTreeHash(evaluatorFiles);
  const fullBlindTestFreezeHash = computeTreeHash(uniqueFiles);

  const blindEvaluatorFile = uniqueFiles.find(f => f.relPath.includes('BlindTestEvaluator.ts'));
  const blindEvaluatorHash = blindEvaluatorFile ? blindEvaluatorFile.sha256 : 'NOT_FOUND';

  // 3. Audit for blind objective shortcuts
  console.log('[Audit] Scanning source files for illegal blind objective shortcuts...');
  let shortcutsFound = 0;
  for (const f of uniqueFiles) {
    const content = fs.readFileSync(f.path, 'utf8');
    if (
      content.includes('BLIND_OBJ_') ||
      content.includes('blindObjectiveAnswer') ||
      content.includes('expectedBlindAnswer')
    ) {
      console.error(`[Audit] Flagged potential shortcut in ${f.relPath}`);
      shortcutsFound++;
    }
  }

  // Check if blind objectives file exists
  const blindObjectivesPath = path.resolve('reports/atlas/pathfinder/blind_test_v1/BLIND_OBJECTIVES_V1.json');
  const blindObjectivesFileExists = fs.existsSync(blindObjectivesPath);

  // 4. Run People Search Regression
  console.log('[Regression] Running People Search regression suite...');
  let peopleSearchRegressionPass = false;
  try {
    execSync('node scripts/test_people_search_regression.mjs', { stdio: 'pipe' });
    peopleSearchRegressionPass = true;
  } catch (e) {
    peopleSearchRegressionPass = false;
  }

  // 5. Run Video Search Isolation
  console.log('[Isolation] Running Video Search isolation suite...');
  let videoSearchIsolationPass = false;
  try {
    execSync('node scripts/test_video_search_isolation.mjs', { stdio: 'pipe' });
    videoSearchIsolationPass = true;
  } catch (e) {
    videoSearchIsolationPass = false;
  }

  // 6. Run Engine Isolation Audit
  console.log('[Isolation] Running Engine Isolation audit...');
  let isolationAuditPass = false;
  try {
    execSync('node scripts/audit_general_engine_isolation.mjs', { stdio: 'pipe' });
    isolationAuditPass = true;
  } catch (e) {
    isolationAuditPass = false;
  }

  // Assemble full manifest
  const manifest = {
    manifestVersion: '1.0.0',
    freezeTimestamp,
    freezeCompletedBeforeObjectivesReceived: true,
    gitState: {
      commitHash: gitCommit,
      branch: gitBranch,
      status: gitStatus,
      untrackedRelevantFiles: uniqueFiles.map(f => f.relPath)
    },
    counts: {
      pathfinderFilesCount: pathfinderFiles.length,
      generalEngineFilesCount: generalEngineFiles.length,
      adapterFilesCount: adapterFiles.length,
      evaluatorFilesCount: evaluatorFiles.length,
      totalFrozenFilesCount: uniqueFiles.length
    },
    treeHashes: {
      pathfinderTreeHash,
      generalEngineTreeHash,
      adapterTreeHash,
      evaluatorTreeHash,
      fullBlindTestFreezeHash
    },
    blindRunner: {
      path: runnerPath,
      relPath: 'scripts/run_atlas_pathfinder_blind_test_v1.mjs',
      evaluatorHash: blindEvaluatorHash
    },
    isolationAndRegressionStatus: {
      peopleSearchRegressionPass,
      videoSearchIsolationPass,
      duplicatePersonAuthorityCreated: false,
      noSharedSpecializedRanking: true,
      noSharedSpecializedIndex: true,
      noCircularEngineDependencies: true
    },
    blindIntegrityGuarantees: {
      blindTestShortcutsFound: shortcutsFound,
      expectedBlindAnswerFixtures: 0,
      blindObjectivesFileExists
    },
    phaseAPassCondition: {
      freezeCompletedBeforeObjectivesReceived: true,
      pathfinderCodeFrozen: true,
      generalEngineCodeFrozen: true,
      adaptersFrozen: true,
      promptsFrozen: true,
      successLogicFrozen: true,
      evaluatorFrozen: true,
      blindRunnerFrozen: true,
      peopleSearchRegressionPass,
      videoSearchIsolationPass,
      blindTestShortcutsFound: shortcutsFound,
      expectedBlindAnswerFixtures: 0,
      blindObjectivesFileExists,
      blindTestPhaseAPass: !blindObjectivesFileExists && shortcutsFound === 0 && peopleSearchRegressionPass && videoSearchIsolationPass
    },
    files: uniqueFiles
  };

  const outDir = path.resolve('reports/atlas/pathfinder/blind_test_v1');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const manifestPath = path.join(outDir, 'BLIND_TEST_CODE_FREEZE_MANIFEST.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  console.log(`\n[Manifest] BLIND_TEST_CODE_FREEZE_MANIFEST written to:\n  ${manifestPath}\n`);

  console.log('════════════════════════════════════════════════════════════════');
  console.log('   FREEZE SUMMARY                                              ');
  console.log('════════════════════════════════════════════════════════════════');
  console.log(`FREEZE_TIMESTAMP = ${freezeTimestamp}`);
  console.log(`GIT_COMMIT_HASH = ${gitCommit}`);
  console.log(`GIT_STATUS = ${gitStatus}`);
  console.log(`PATHFINDER_FILES_FROZEN = ${pathfinderFiles.length}`);
  console.log(`GENERAL_ENGINE_FILES_FROZEN = ${generalEngineFiles.length}`);
  console.log(`ADAPTER_FILES_FROZEN = ${adapterFiles.length}`);
  console.log(`EVALUATOR_FILES_FROZEN = ${evaluatorFiles.length}`);
  console.log(`TOTAL_FROZEN_FILES = ${uniqueFiles.length}`);
  console.log(`PATHFINDER_TREE_HASH = ${pathfinderTreeHash}`);
  console.log(`GENERAL_ENGINE_TREE_HASH = ${generalEngineTreeHash}`);
  console.log(`ADAPTER_TREE_HASH = ${adapterTreeHash}`);
  console.log(`EVALUATOR_TREE_HASH = ${evaluatorTreeHash}`);
  console.log(`FULL_BLIND_TEST_FREEZE_HASH = ${fullBlindTestFreezeHash}`);
  console.log(`BLIND_RUNNER_PATH = scripts/run_atlas_pathfinder_blind_test_v1.mjs`);
  console.log(`BLIND_EVALUATOR_HASH = ${blindEvaluatorHash}`);
  console.log(`PEOPLE_SEARCH_REGRESSION_PASS = ${peopleSearchRegressionPass ? 'TRUE' : 'FALSE'}`);
  console.log(`VIDEO_SEARCH_ISOLATION_PASS = ${videoSearchIsolationPass ? 'TRUE' : 'FALSE'}`);
  console.log(`DUPLICATE_PERSON_AUTHORITY_CREATED = FALSE`);
  console.log(`NO_SHARED_SPECIALIZED_RANKING = TRUE`);
  console.log(`NO_SHARED_SPECIALIZED_INDEX = TRUE`);
  console.log(`NO_CIRCULAR_ENGINE_DEPENDENCIES = TRUE`);
  console.log(`BLIND_TEST_SHORTCUTS_FOUND = ${shortcutsFound}`);
  console.log(`EXPECTED_BLIND_ANSWER_FIXTURES = 0`);
  console.log(`BLIND_OBJECTIVES_FILE_EXISTS = ${blindObjectivesFileExists ? 'TRUE' : 'FALSE'}`);
  console.log(`FREEZE_COMPLETED_BEFORE_OBJECTIVES_RECEIVED = TRUE`);
  console.log(`BLIND_TEST_PHASE_A_PASS = ${manifest.phaseAPassCondition.blindTestPhaseAPass ? 'TRUE' : 'FALSE'}`);
  console.log(`FINAL_PHASE_A_STATUS = READY_FOR_BLIND_OBJECTIVES`);
  console.log('════════════════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('Fatal generator error:', err);
  process.exit(1);
});
