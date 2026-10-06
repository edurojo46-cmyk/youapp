/**
 * ATLAS — INDUSTRIAL EMAIL 1M CRYPTOGRAPHIC FREEZE GENERATOR
 * Computes deterministic SHA-256 tree over all intelligence code:
 * - atlasPathfinder
 * - atlasIndustrialEmail
 * - atlasGeneralEngine
 * - atlas/discovery
 * - atlasDiscoveryAI
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const rootDir = process.cwd();

function computeFileHash(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function getFilesRecursively(dir, filter = () => true) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const dirent of list) {
    const fullPath = path.join(dir, dirent.name);
    if (dirent.isDirectory()) {
      results = results.concat(getFilesRecursively(fullPath, filter));
    } else if (filter(fullPath)) {
      results.push(fullPath);
    }
  }
  return results;
}

export function generateIndustrialEmailFreezeManifest() {
  const scanTargets = [
    'src/lib/atlasPathfinder',
    'src/lib/atlasIndustrialEmail',
    'src/lib/atlasGeneralEngine',
    'src/lib/atlas/discovery',
    'src/lib/atlasDiscoveryAI'
  ];

  let allFiles = [];
  for (const relDir of scanTargets) {
    const absDir = path.resolve(rootDir, relDir);
    const files = getFilesRecursively(absDir, p => p.endsWith('.ts') || p.endsWith('.js') || p.endsWith('.mjs'));
    allFiles = allFiles.concat(files);
  }

  // Deduplicate and normalize
  const uniqueRelativeFiles = Array.from(
    new Set(allFiles.map(f => path.relative(rootDir, f).replace(/\\/g, '/')))
  ).sort();

  console.log(`[FreezeGenerator] Found ${uniqueRelativeFiles.length} intelligence files to freeze.`);

  const manifestFiles = [];
  const rootHasher = crypto.createHash('sha256');

  for (const relPath of uniqueRelativeFiles) {
    const fullPath = path.resolve(rootDir, relPath);
    const hash = computeFileHash(fullPath);
    const bytes = fs.statSync(fullPath).size;

    manifestFiles.push({
      path: relPath,
      sha256: hash,
      sizeBytes: bytes
    });

    rootHasher.update(`${relPath}:${hash}\n`);
  }

  const rootSha256 = rootHasher.digest('hex');

  const manifest = {
    freezeManifestId: 'ATLAS_INDUSTRIAL_EMAIL_1M_FREEZE',
    frozenAt: new Date().toISOString(),
    totalFiles: manifestFiles.length,
    rootSha256Email1M: rootSha256,
    frozenDirectories: scanTargets,
    files: manifestFiles
  };

  const outDir = path.resolve(rootDir, 'reports/atlas/pathfinder/industrial_1m');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'INDUSTRIAL_EMAIL_1M_FREEZE_MANIFEST.json');
  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2), 'utf8');

  console.log(`\n════════════════════════════════════════════════════════════════`);
  console.log(`  ATLAS — INDUSTRIAL EMAIL 1M CODE FREEZE MANIFEST CERTIFIED   `);
  console.log(`  Total Frozen Files: ${manifest.totalFiles}                   `);
  console.log(`  ROOT_SHA256_EMAIL_1M = ${rootSha256}                         `);
  console.log(`  Manifest: ${outPath}                                         `);
  console.log(`════════════════════════════════════════════════════════════════\n`);

  return manifest;
}

if (process.argv[1] && process.argv[1].endsWith('create_industrial_email_1m_freeze_manifest.mjs')) {
  generateIndustrialEmailFreezeManifest();
}
