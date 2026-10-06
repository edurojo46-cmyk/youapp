import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';

const filesToFreeze = [];

function addFilesRecursively(dirPath, category) {
  if (!fs.existsSync(dirPath)) return;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      addFilesRecursively(fullPath, category);
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.mjs') || entry.name.endsWith('.json'))) {
      filesToFreeze.push({ fullPath, category });
    }
  }
}

// 1. Gather all files in scope
addFilesRecursively(path.resolve('src/lib/atlasPathfinder'), 'PATHFINDER_V2');
addFilesRecursively(path.resolve('src/lib/atlasGeneralEngine'), 'GENERAL_ENGINE');
filesToFreeze.push({
  fullPath: path.resolve('scripts/run_atlas_pathfinder_blind_test_v2.mjs'),
  category: 'BLIND_RUNNER'
});

// Sort deterministically by relative path
filesToFreeze.sort((a, b) => a.fullPath.localeCompare(b.fullPath));

const manifestFiles = [];
const hasher = crypto.createHash('sha256');

let pathfinderBytes = Buffer.alloc(0);
let generalEngineBytes = Buffer.alloc(0);
let adapterBytes = Buffer.alloc(0);
let evaluatorBytes = Buffer.alloc(0);
let blindRunnerBytes = Buffer.alloc(0);

for (const { fullPath, category } of filesToFreeze) {
  const content = fs.readFileSync(fullPath);
  const sha256 = crypto.createHash('sha256').update(content).digest('hex');
  const stat = fs.statSync(fullPath);
  const relPath = path.relative(process.cwd(), fullPath).replace(/\\/g, '/');

  manifestFiles.push({
    path: relPath,
    category,
    sha256,
    sizeBytes: stat.size,
    lastModified: stat.mtime.toISOString()
  });

  hasher.update(relPath + ':' + sha256);

  if (category === 'PATHFINDER_V2') {
    pathfinderBytes = Buffer.concat([pathfinderBytes, content]);
    if (relPath.includes('/evaluators/')) {
      evaluatorBytes = Buffer.concat([evaluatorBytes, content]);
    }
  } else if (category === 'GENERAL_ENGINE') {
    generalEngineBytes = Buffer.concat([generalEngineBytes, content]);
    if (relPath.includes('/adapters/')) {
      adapterBytes = Buffer.concat([adapterBytes, content]);
    }
  } else if (category === 'BLIND_RUNNER') {
    blindRunnerBytes = Buffer.concat([blindRunnerBytes, content]);
  }
}

const rootHash = hasher.digest('hex');
const pathfinderTreeHash = crypto.createHash('sha256').update(pathfinderBytes).digest('hex');
const generalEngineTreeHash = crypto.createHash('sha256').update(generalEngineBytes).digest('hex');
const adapterTreeHash = crypto.createHash('sha256').update(adapterBytes).digest('hex');
const evaluatorTreeHash = crypto.createHash('sha256').update(evaluatorBytes).digest('hex');
const blindRunnerHash = crypto.createHash('sha256').update(blindRunnerBytes).digest('hex');

let gitCommit = 'UNKNOWN';
let gitBranch = 'UNKNOWN';
let gitStatus = 'UNKNOWN';
try {
  gitCommit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
  gitStatus = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
} catch (e) {
  // Git commands may fail in restricted shells
}

const manifest = {
  freezeManifestId: 'ATLAS_PATHFINDER_BLIND_V2_FREEZE',
  freezeTimestamp: new Date().toISOString(),
  git: {
    commit: gitCommit,
    branch: gitBranch,
    statusSummary: gitStatus ? 'DIRTY' : 'CLEAN'
  },
  treeHashes: {
    pathfinderTreeHash,
    generalEngineTreeHash,
    adapterTreeHash,
    evaluatorTreeHash,
    blindRunnerHash,
    fullFreezeHash: rootHash
  },
  fileCount: manifestFiles.length,
  files: manifestFiles
};

const outDir = path.resolve('reports/atlas/pathfinder/blind_test_v2');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const outPath = path.join(outDir, 'BLIND_V2_CODE_FREEZE_MANIFEST.json');
fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2), 'utf8');

console.log('FREEZE MANIFEST V2 GENERATED:');
console.log(`Manifest Path: ${outPath}`);
console.log(`Frozen File Count: ${manifestFiles.length}`);
console.log(`Root SHA-256: ${rootHash}`);
console.log(`Pathfinder Tree Hash: ${pathfinderTreeHash}`);
console.log(`General Engine Tree Hash: ${generalEngineTreeHash}`);
