/**
 * ATLAS — CRYPTOGRAPHIC CODE FREEZE V3 GENERATOR
 * Pre-Blind V3 Immutable Architecture Freeze & Source Map Baseline Snapshot
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';

const rootDir = process.cwd();

function computeFileHash(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

async function main() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('       ATLAS — CRYPTOGRAPHIC CODE FREEZE V3 GENERATOR          ');
  console.log('════════════════════════════════════════════════════════════════\n');

  // 1. GATHER ALL FILES IN SCOPE FOR V3 FREEZE
  const filesToFreeze = [];

  function addFilesRecursively(dirPath, category) {
    if (!fs.existsSync(dirPath)) return;
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        addFilesRecursively(fullPath, category);
      } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.mjs') || entry.name.endsWith('.json'))) {
        // Skip scratch or temporary report files
        if (entry.name.endsWith('_postmortem.json') || entry.name.includes('.tmp')) continue;
        filesToFreeze.push({ fullPath, category });
      }
    }
  }

  // Include comprehensive architecture layers
  addFilesRecursively(path.resolve('src/lib/atlasPathfinder'), 'ATLAS_PATHFINDER_V3');
  addFilesRecursively(path.resolve('src/lib/atlasGeneralEngine'), 'ATLAS_GENERAL_ENGINE');
  addFilesRecursively(path.resolve('src/lib/atlas/discovery'), 'ATLAS_SOURCE_DISCOVERY_CORE');
  addFilesRecursively(path.resolve('src/lib/atlasDiscoveryAI'), 'ATLAS_DISCOVERY_AI');

  // Include blind test runner
  const v3Runner = path.resolve('scripts/run_atlas_pathfinder_blind_test_v3.mjs');
  if (fs.existsSync(v3Runner)) {
    filesToFreeze.push({ fullPath: v3Runner, category: 'BLIND_RUNNER_V3' });
  }

  // Deduplicate and sort deterministically
  const uniqueMap = new Map();
  for (const item of filesToFreeze) {
    const relPath = path.relative(rootDir, item.fullPath).replace(/\\/g, '/');
    if (!uniqueMap.has(relPath)) {
      uniqueMap.set(relPath, item);
    }
  }

  const sortedRelPaths = Array.from(uniqueMap.keys()).sort();

  console.log(`[Freeze] Total files discovered across intelligence layers: ${sortedRelPaths.length}`);

  const manifestFiles = [];
  const hasher = crypto.createHash('sha256');

  for (const relPath of sortedRelPaths) {
    const { fullPath, category } = uniqueMap.get(relPath);
    const stat = fs.statSync(fullPath);
    const sha256 = computeFileHash(fullPath);

    manifestFiles.push({
      path: relPath,
      category,
      sha256,
      sizeBytes: stat.size,
      lastModified: stat.mtime.toISOString()
    });

    hasher.update(`${relPath}:${sha256}\n`);
  }

  const rootSha256V3 = hasher.digest('hex');

  // Git state
  let gitCommit = 'UNKNOWN';
  let gitBranch = 'UNKNOWN';
  let gitStatus = 'UNKNOWN';
  try {
    gitCommit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
    gitStatus = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
  } catch (e) {
    // Git might be restricted
  }

  const manifest = {
    freezeManifestId: 'ATLAS_PATHFINDER_BLIND_V3_FREEZE',
    freezeTimestamp: new Date().toISOString(),
    protocolVersion: 'V3.0_OPEN_RETRIEVAL_SOURCE_INTELLIGENCE',
    rootSha256V3,
    totalFrozenFiles: manifestFiles.length,
    git: {
      commit: gitCommit,
      branch: gitBranch,
      statusSummary: gitStatus ? 'DIRTY' : 'CLEAN'
    },
    rules: {
      CODE_MUTATION_DURING_BLIND: 'STRICTLY_PROHIBITED',
      SOURCE_KNOWLEDGE_MAP_DATA_UPDATE_FROM_EXECUTION: 'PERMITTED_AND_MEASURED',
      FALLBACK_TO_PEOPLE_SEARCH_FOR_NOVEL_ENTITIES: 'STRICTLY_PROHIBITED'
    },
    files: manifestFiles
  };

  // 2. CREATE SOURCE MAP BASELINE (Section 4)
  const { SourceKnowledgeMap } = await import('../src/lib/atlasPathfinder/sourceIntelligence/SourceKnowledgeMap.ts');
  const sourceMap = SourceKnowledgeMap.getInstance();
  const initialSources = sourceMap.getAllSources();

  const families = new Set(initialSources.map(s => s.source_family));
  const winners = initialSources.filter(s => s.current_status === 'PROMOTED');
  const alternatives = initialSources.filter(s => s.current_status === 'ACTIVE' || s.current_status === 'CANARY');
  const dormant = initialSources.filter(s => s.current_status === 'DORMANT' || s.current_status === 'DEPLETED');
  const solvedGoals = new Set(initialSources.flatMap(s => s.evidence_goals_solved));

  const realizedYieldAvg = initialSources.reduce((acc, s) => acc + s.realized_yield, 0) / (initialSources.length || 1);
  const qualifiedYieldAvg = initialSources.reduce((acc, s) => acc + s.qualified_yield, 0) / (initialSources.length || 1);

  const baselineSnapshot = {
    baselineId: 'ATLAS_SOURCE_MAP_BASELINE_V3',
    version: 'V3.0-PRE-BLIND',
    timestamp: new Date().toISOString(),
    source_count: initialSources.length,
    source_family_count: families.size,
    known_winners: winners.length,
    known_alternatives: alternatives.length,
    known_dormant_exhausted: dormant.length,
    evidence_goals_covered: Array.from(solvedGoals),
    evidence_goals_count: solvedGoals.size,
    yield_known_avg: parseFloat(realizedYieldAvg.toFixed(2)),
    qualified_yield_avg: parseFloat(qualifiedYieldAvg.toFixed(2)),
    families_list: Array.from(families),
    sources: initialSources.map(s => ({
      source_id: s.source_id,
      source_name: s.source_name,
      source_family: s.source_family,
      parent_domain: s.parent_domain,
      access_method: s.access_method,
      protocol: s.protocol,
      source_class: s.source_class,
      qualified_yield: s.qualified_yield,
      current_status: s.current_status,
      evidence_goals_solved: s.evidence_goals_solved
    }))
  };

  // 3. PERSIST MANIFEST AND BASELINE IN TARGET LOCATIONS
  const targetDir = path.resolve('reports/atlas/pathfinder/blind_test_v3');
  fs.mkdirSync(targetDir, { recursive: true });

  const manifestPathTarget = path.join(targetDir, 'BLIND_V3_CODE_FREEZE_MANIFEST.json');
  const manifestPathRoot = path.resolve('BLIND_V3_CODE_FREEZE_MANIFEST.json');

  const baselinePathTarget = path.join(targetDir, 'BLIND_V3_SOURCE_MAP_BASELINE.json');
  const baselinePathRoot = path.resolve('BLIND_V3_SOURCE_MAP_BASELINE.json');

  fs.writeFileSync(manifestPathTarget, JSON.stringify(manifest, null, 2), 'utf8');
  fs.writeFileSync(manifestPathRoot, JSON.stringify(manifest, null, 2), 'utf8');

  fs.writeFileSync(baselinePathTarget, JSON.stringify(baselineSnapshot, null, 2), 'utf8');
  fs.writeFileSync(baselinePathRoot, JSON.stringify(baselineSnapshot, null, 2), 'utf8');

  console.log('────────────────────────────────────────────────────────────────');
  console.log(`FREEZE COMPLETED SUCCESSFULLY.`);
  console.log(`ROOT_SHA256_V3: ${rootSha256V3}`);
  console.log(`Frozen Files Count: ${manifestFiles.length}`);
  console.log(`Manifest Path: ${manifestPathTarget}`);
  console.log(`Baseline Path: ${baselinePathTarget}`);
  console.log(`Baseline Source Count: ${initialSources.length}`);
  console.log(`Baseline Family Count: ${families.size}`);
  console.log('────────────────────────────────────────────────────────────────\n');

  return {
    rootSha256V3,
    frozenFileCount: manifestFiles.length,
    manifestPathTarget,
    baselinePathTarget,
    baselineSourceCount: initialSources.length,
    baselineFamilyCount: families.size
  };
}

main().catch(err => {
  console.error('Fatal Freeze Error:', err);
  process.exit(1);
});
