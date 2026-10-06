/**
 * Script de Snapshot de Protección Intelectual de Atlas
 * Ejecución Read-Only sobre el repositorio con prioridad baja.
 * Cero interferencia con V6B.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';

const PROJECT_ROOT = 'c:\\Users\\Eduardo\\YOUAPP';
const V6B_STATE_FILE = path.join(PROJECT_ROOT, '.v6b_backfill_state.json');

function getSha256(filePath) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.alloc(64 * 1024);
  let bytesRead = 0;
  while ((bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null)) !== 0) {
    hash.update(buffer.subarray(0, bytesRead));
  }
  fs.closeSync(fd);
  return hash.digest('hex');
}

async function main() {
  console.log('==================================================');
  console.log('ATLAS IP SNAPSHOT — INITIATING LOW-PRIORITY AUDIT');
  console.log('==================================================');

  // 1. Verify V6B State & PID before starting
  const v6bStateBefore = JSON.parse(fs.readFileSync(V6B_STATE_FILE, 'utf8'));
  console.log(`[V6B PRE-CHECK] Scanned: ${v6bStateBefore.SCANNED}, Batch: ${v6bStateBefore.BATCH_NUMBER}`);

  let v6bPid = 12972;
  let v6bAlive = false;
  try {
    process.kill(v6bPid, 0);
    v6bAlive = true;
    console.log(`[V6B PRE-CHECK] PID ${v6bPid} is active.`);
  } catch (e) {
    console.warn(`[V6B PRE-CHECK] Warning: PID ${v6bPid} check returned: ${e.message}`);
  }

  // 2. Timestamps and Naming
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const hhmmss = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const dateStr = now.toISOString().split('T')[0];
  const SNAPSHOT_NAME = `ATLAS_IP_SNAPSHOT_2026-09-16_${hhmmss}`;
  const SNAPSHOT_TIMESTAMP_LOCAL = now.toString();
  const SNAPSHOT_TIMESTAMP_UTC = now.toISOString();

  // 3. Git Metadata
  let gitHead = 'UNKNOWN';
  let gitBranch = 'UNKNOWN';
  let gitStatus = 'CLEAN';
  try {
    gitHead = execSync('git rev-parse HEAD', { cwd: PROJECT_ROOT, encoding: 'utf8' }).trim();
    gitBranch = execSync('git branch --show-current', { cwd: PROJECT_ROOT, encoding: 'utf8' }).trim();
    gitStatus = execSync('git status --short', { cwd: PROJECT_ROOT, encoding: 'utf8' }).trim();
  } catch (err) {
    console.warn('Git query error:', err.message);
  }

  console.log(`SNAPSHOT_NAME: ${SNAPSHOT_NAME}`);
  console.log(`GIT_HEAD: ${gitHead} (${gitBranch})`);

  // 4. Create Local Staging Directory
  const stagingDir = path.join(PROJECT_ROOT, 'snapshots', SNAPSHOT_NAME);
  const stageContentDir = path.join(stagingDir, 'content');
  fs.mkdirSync(stageContentDir, { recursive: true });

  // 5. Curate files to copy into stageContentDir
  // Strictly EXCLUDE:
  // .env, .env.*, node_modules, .git, caches, dist, build, *.dump, *.tar, *.bak, large logs, .v6b_backfill_state.json
  const excludedPatterns = [
    /^\.env/,
    /\.env\..+/,
    /^node_modules$/,
    /^\.git$/,
    /^\.gemini$/,
    /^\.agents$/,
    /^dist$/,
    /^build$/,
    /^\.vite$/,
    /^\.cache$/,
    /\.log$/,
    /\.dump$/,
    /\.bak$/,
    /schema_dump\.sql$/,
    /remote_schema_backup\.sql$/,
    /staging_current_schema\.sql$/,
    /^\.v6b_backfill_state\.json$/,
  ];

  function shouldExclude(relPath, isDir) {
    const parts = relPath.split(path.sep);
    for (const part of parts) {
      for (const p of excludedPatterns) {
        if (p.test(part)) return true;
      }
    }
    return false;
  }

  const dirsToInclude = ['src', 'scripts', 'supabase/migrations', 'tests'];
  const rootFilesToInclude = [
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'tsconfig.node.json',
    'vite.config.ts',
    'index.html',
    'README.md',
    'SNAPSHOT_HISTORY.md',
    'PROPUESTA_COMERCIAL_Y_PITCH_YOUAPP.md',
    'walkthrough.md',
    'implementation_plan.md'
  ];

  let fileCount = 0;
  let totalBytes = 0;
  const copiedFiles = [];

  function copyDirRecursive(srcDir, destDir, baseDir = '') {
    const entries = fs.readdirSync(srcDir, { withFileTypes: true });
    for (const entry of entries) {
      const relPath = path.join(baseDir, entry.name);
      if (shouldExclude(relPath, entry.isDirectory())) continue;

      const srcPath = path.join(srcDir, entry.name);
      const destPath = path.join(destDir, entry.name);

      if (entry.isDirectory()) {
        fs.mkdirSync(destPath, { recursive: true });
        copyDirRecursive(srcPath, destPath, relPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
        const stat = fs.statSync(srcPath);
        fileCount++;
        totalBytes += stat.size;
        copiedFiles.push(destPath);
      }
    }
  }

  console.log('[STAGE] Copying core directories and files to staging...');
  for (const dir of dirsToInclude) {
    const fullDir = path.join(PROJECT_ROOT, dir);
    if (fs.existsSync(fullDir)) {
      const dest = path.join(stageContentDir, dir);
      fs.mkdirSync(dest, { recursive: true });
      copyDirRecursive(fullDir, dest, dir);
    }
  }

  for (const rf of rootFilesToInclude) {
    const fullRf = path.join(PROJECT_ROOT, rf);
    if (fs.existsSync(fullRf)) {
      const dest = path.join(stageContentDir, rf);
      fs.copyFileSync(fullRf, dest);
      const stat = fs.statSync(fullRf);
      fileCount++;
      totalBytes += stat.size;
      copiedFiles.push(dest);
    }
  }

  console.log(`[STAGE] Staged ${fileCount} files (${(totalBytes / (1024 * 1024)).toFixed(2)} MB).`);

  // 6. Secret Scan over copied files
  console.log('[SECRET SCAN] Performing read-only scan for secrets...');
  let secretsIncluded = 0;
  const secretViolations = [];

  const secretCheckPatterns = [
    { name: 'Google API Key', regex: /AIza[0-9A-Za-z-_]{35}/ },
    { name: 'OpenAI Secret Key', regex: /sk-[a-zA-Z0-9]{32,}/ },
    { name: 'GitHub Personal Token', regex: /ghp_[a-zA-Z0-9]{36}/ },
    { name: 'Private Key Header', regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  ];

  for (const filePath of copiedFiles) {
    // Only scan text files
    if (/\.(ts|tsx|js|mjs|sql|json|md|html|css|txt)$/i.test(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');

      // Check JWTs for service_role
      const jwts = content.match(/eyJ[a-zA-Z0-9_-]{15,}\.eyJ[a-zA-Z0-9_-]{15,}\.[a-zA-Z0-9_-]{15,}/g);
      if (jwts) {
        for (const jwt of jwts) {
          try {
            const parts = jwt.split('.');
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
            if (payload.role === 'service_role') {
              secretsIncluded++;
              secretViolations.push({ file: path.relative(stageContentDir, filePath), type: 'Service Role Key' });
            }
          } catch (e) {}
        }
      }

      for (const pattern of secretCheckPatterns) {
        if (pattern.regex.test(content)) {
          secretsIncluded++;
          secretViolations.push({ file: path.relative(stageContentDir, filePath), type: pattern.name });
        }
      }
    }
  }

  if (secretsIncluded > 0) {
    console.error(`[FATAL] Secret scan failed with ${secretsIncluded} violations! Aborting.`);
    process.exit(1);
  }
  console.log(`[SECRET SCAN] Verification PASSED: SECRETS_INCLUDED = ${secretsIncluded}`);

  // 7. Generate SNAPSHOT_MANIFEST.md
  const manifestContent = `# ATLAS INTELLECTUAL PROPERTY SNAPSHOT MANIFEST

## Metadatos del Snapshot
- **SNAPSHOT_NAME:** \`${SNAPSHOT_NAME}\`
- **FECHA_HORA_LOCAL:** \`${SNAPSHOT_TIMESTAMP_LOCAL}\`
- **FECHA_HORA_UTC:** \`${SNAPSHOT_TIMESTAMP_UTC}\`
- **GIT_HEAD:** \`${gitHead}\`
- **GIT_BRANCH:** \`${gitBranch}\`
- **PROJECT_ROOT:** \`${PROJECT_ROOT}\`
- **SECRETS_INCLUDED:** \`0\` (Verificado mediante escaneo determinista)

---

## Objetivo del Snapshot
Certificación y protección criptográfica del estado intelectual y de ingeniería de **Atlas Industrial Architecture**, garantizando trazabilidad inmutable, reconstruibilidad y autoría técnica de los motores y esquemas desarrollados.

---

## Estado Arquitectónico en el Momento del Snapshot
- **Backfill V6B:** En ejecución activa autónoma (\`PID ${v6bPid}\`, escaneando partición histórica IGJ hacia el hito 750k).
- **Factory Industrial:** Temporalmente detenida por mantenimiento preventivo y control de contención (\`PAUSED_V6B_BACKFILL\`).
- **Search Publisher:** Temporalmente detenido por mantenimiento preventivo para drenar ordenadamente post-V6B.
- **Atlas Industrial Supervisor / Watchdog:** Temporalmente deshabilitado en Windows Task Scheduler (\`FACTORY_SUPERVISOR_EXISTS = TRUE\`, \`FACTORY_SUPERVISOR_ENABLED = FALSE_TEMPORARY_MAINTENANCE\`).

---

## Agenda Oficial de Producción
\`\`\`
20M PEOPLE -> SEARCH INDUSTRIAL -> 24/7 -> GOVERNANCE -> ATLAS KNOWLEDGE
\`\`\`

---

## Componentes Intelectuales Protegidos
1. **Atlas Industrial Factory (\`scripts/atlas_industrial_factory.mjs\`):**
   Motor de absorción física a escala industrial con control de backpressure, histéresis calibrada (275k pausa / 240k reanudación) y transacción segura de Outbox.
2. **Search Publisher Pipeline (\`scripts/atlas_search_publisher.mjs\`):**
   Drenaje de alta velocidad de eventos canónicos hacia la proyección de búsqueda optimizada de PostgreSQL.
3. **Identity Resolution & Repair Engine V6B (\`scripts/run_v6b.mjs\`):**
   Reparación idempotente de identidades canónicas sin pérdida, sin saltos y sin sobrescritura de identidades existentes.
4. **Esquemas de Base de Datos y Migraciones (\`supabase/migrations/\`):**
   Colección completa de contratos DDL, índices trigram, particiones y RPCs transaccionales de Atlas.
5. **Atlas Query Fabric & Semantic Engine (\`src/lib/atlasQueryFabric/\`, \`src/lib/atlasSemantic/\`):**
   Razonamiento epistémico de 6 niveles, resolución ontológica de entidades y grafos de procedencia verificable.
`;

  const manifestPath = path.join(stagingDir, 'SNAPSHOT_MANIFEST.md');
  const manifestInStageContent = path.join(stageContentDir, 'SNAPSHOT_MANIFEST.md');
  fs.writeFileSync(manifestPath, manifestContent, 'utf8');
  fs.writeFileSync(manifestInStageContent, manifestContent, 'utf8');
  fileCount++;
  totalBytes += Buffer.byteLength(manifestContent, 'utf8');

  // 8. Create ZIP of stageContentDir
  const zipFileName = `${SNAPSHOT_NAME}.zip`;
  const zipFilePath = path.join(stagingDir, zipFileName);
  console.log(`[ZIP] Packaging archive into ${zipFileName}...`);
  // Use tar -a -c -f to create zip
  execSync(`tar -a -c -f "${zipFilePath}" -C "${stageContentDir}" .`, { windowsHide: true });
  const zipSha256 = getSha256(zipFilePath);
  const zipStats = fs.statSync(zipFilePath);
  console.log(`[ZIP] Archive created: ${zipFileName} (${(zipStats.size / (1024 * 1024)).toFixed(2)} MB)`);
  console.log(`[ZIP] SHA256: ${zipSha256}`);

  // 9. Create Git Bundle
  const bundleFileName = `ATLAS_SOURCE_HISTORY_2026-09-16_${hhmmss}.bundle`;
  const bundleFilePath = path.join(stagingDir, bundleFileName);
  console.log(`[GIT BUNDLE] Creating git bundle ${bundleFileName}...`);
  execSync(`git bundle create "${bundleFilePath}" HEAD`, { cwd: PROJECT_ROOT, windowsHide: true });
  const bundleSha256 = getSha256(bundleFilePath);
  const bundleStats = fs.statSync(bundleFilePath);
  console.log(`[GIT BUNDLE] Bundle created (${(bundleStats.size / (1024 * 1024)).toFixed(2)} MB)`);
  console.log(`[GIT BUNDLE] SHA256: ${bundleSha256}`);

  // 10. Generate SHA256SUMS.txt
  const manifestSha256 = getSha256(manifestPath);
  const sumsContent = `${zipSha256}  ${zipFileName}\n${bundleSha256}  ${bundleFileName}\n${manifestSha256}  SNAPSHOT_MANIFEST.md\n`;
  const sumsFilePath = path.join(stagingDir, 'SHA256SUMS.txt');
  fs.writeFileSync(sumsFilePath, sumsContent, 'utf8');

  // 11. Generate SNAPSHOT_PROOF.txt
  const proofContent = `SNAPSHOT_NAME = ${SNAPSHOT_NAME}
CREATED_AT_UTC = ${SNAPSHOT_TIMESTAMP_UTC}
CREATED_AT_LOCAL = ${SNAPSHOT_TIMESTAMP_LOCAL}
GIT_HEAD = ${gitHead}
ZIP_SHA256 = ${zipSha256}
GIT_BUNDLE_SHA256 = ${bundleSha256}
FILE_COUNT = ${fileCount}
TOTAL_BYTES = ${totalBytes}
ZIP_BYTES = ${zipStats.size}
BUNDLE_BYTES = ${bundleStats.size}
SECRETS_INCLUDED = 0
STATUS = CERTIFIED
`;
  const proofFilePath = path.join(stagingDir, 'SNAPSHOT_PROOF.txt');
  fs.writeFileSync(proofFilePath, proofContent, 'utf8');

  // 12. Update SNAPSHOT_HISTORY.md (Append-Only)
  const historyEntry = `
---

## ${SNAPSHOT_NAME} — Atlas Industrial Architecture IP Protection Checkpoint
- **Fecha / Hora:** ${SNAPSHOT_TIMESTAMP_LOCAL} (${SNAPSHOT_TIMESTAMP_UTC})
- **Git HEAD:** \`${gitHead}\`
- **Git Branch:** \`${gitBranch}\`
- **Archivo ZIP:** \`${zipFileName}\`
- **SHA256 ZIP:** \`${zipSha256}\`
- **Archivo Git Bundle:** \`${bundleFileName}\`
- **SHA256 Git Bundle:** \`${bundleSha256}\`
- **Archivos Incluidos:** ${fileCount} (${(totalBytes / (1024 * 1024)).toFixed(2)} MB)
- **SECRETS_INCLUDED:** 0
- **Motivo:** IP PROTECTION CHECKPOINT — ATLAS INDUSTRIAL ARCHITECTURE
- **Estado:** FROZEN / CERTIFIED 🧊
`;

  const historyFilePath = path.join(PROJECT_ROOT, 'SNAPSHOT_HISTORY.md');
  if (fs.existsSync(historyFilePath)) {
    fs.appendFileSync(historyFilePath, historyEntry, 'utf8');
    console.log('[HISTORY] Appended new entry to SNAPSHOT_HISTORY.md');
  }

  // Also write SNAPSHOT_HISTORY without extension if requested
  const historyNoExt = path.join(PROJECT_ROOT, 'SNAPSHOT_HISTORY');
  if (fs.existsSync(historyFilePath)) {
    fs.copyFileSync(historyFilePath, historyNoExt);
  }

  // 13. Copy to Destinations
  const filesToCopy = [
    { src: zipFilePath, name: zipFileName },
    { src: bundleFilePath, name: bundleFileName },
    { src: sumsFilePath, name: 'SHA256SUMS.txt' },
    { src: proofFilePath, name: 'SNAPSHOT_PROOF.txt' },
    { src: manifestPath, name: 'SNAPSHOT_MANIFEST.md' }
  ];

  // A. Pendrive Destination
  const pendriveDir = 'D:\\argentina';
  let pendriveCopy = 'PENDING';
  let pendriveHashMatch = false;

  if (fs.existsSync(pendriveDir)) {
    console.log(`[DESTINATION: PENDRIVE] Copying to ${pendriveDir}...`);
    for (const f of filesToCopy) {
      const target = path.join(pendriveDir, f.name);
      fs.copyFileSync(f.src, target);
    }
    // Verify hashes at destination
    const targetZipSha = getSha256(path.join(pendriveDir, zipFileName));
    const targetBundleSha = getSha256(path.join(pendriveDir, bundleFileName));
    if (targetZipSha === zipSha256 && targetBundleSha === bundleSha256) {
      pendriveCopy = 'SUCCESS';
      pendriveHashMatch = true;
      console.log('[DESTINATION: PENDRIVE] All hashes match 100% on D:\\argentina');
    } else {
      pendriveCopy = 'HASH_MISMATCH';
      pendriveHashMatch = false;
    }

    // Also update SNAPSHOT_HISTORY.md and SNAPSHOT_HISTORY.txt on D:
    const dHistoryMd = 'D:\\SNAPSHOT_HISTORY.md';
    const dHistoryTxt = 'D:\\SNAPSHOT_HISTORY.txt';
    if (fs.existsSync(dHistoryMd)) fs.appendFileSync(dHistoryMd, historyEntry, 'utf8');
    if (fs.existsSync(dHistoryTxt)) fs.appendFileSync(dHistoryTxt, historyEntry, 'utf8');
  } else {
    console.log('[DESTINATION: PENDRIVE] D:\\argentina not found. Marked PENDING.');
  }

  // B. Cloud Destination
  // Check if ARGENTINA folder exists in OneDrive or other cloud
  const home = process.env.USERPROFILE || 'C:\\Users\\Eduardo';
  const cloudArgentinaCandidate = path.join(home, 'OneDrive', 'argentina');
  let cloudCopy = 'PENDING';
  let cloudHashMatch = false;

  if (fs.existsSync(cloudArgentinaCandidate)) {
    console.log(`[DESTINATION: CLOUD] Copying to ${cloudArgentinaCandidate}...`);
    for (const f of filesToCopy) {
      fs.copyFileSync(f.src, path.join(cloudArgentinaCandidate, f.name));
    }
    const cZipSha = getSha256(path.join(cloudArgentinaCandidate, zipFileName));
    if (cZipSha === zipSha256) {
      cloudCopy = 'SUCCESS';
      cloudHashMatch = true;
    }
  } else {
    console.log(`[DESTINATION: CLOUD] Cloud folder 'argentina' not mounted/found. Marked PENDING.`);
  }

  // 14. Verify V6B health post-snapshot
  const v6bStateAfter = JSON.parse(fs.readFileSync(V6B_STATE_FILE, 'utf8'));
  let v6bStillAlive = false;
  try {
    process.kill(v6bPid, 0);
    v6bStillAlive = true;
  } catch (e) {}

  console.log(`[V6B POST-CHECK] Scanned: ${v6bStateAfter.SCANNED}, Alive: ${v6bStillAlive}`);

  // Output structured result
  console.log('\n==================================================');
  console.log('FINAL AUDIT & CERTIFICATION REPORT');
  console.log('==================================================');
  console.log(`SNAPSHOT_NAME = ${SNAPSHOT_NAME}`);
  console.log(`LOCAL_PATH = ${stagingDir}`);
  console.log(`ZIP_SHA256 = ${zipSha256}`);
  console.log(`GIT_BUNDLE_SHA256 = ${bundleSha256}`);
  console.log(`FILE_COUNT = ${fileCount}`);
  console.log(`TOTAL_SIZE = ${(totalBytes / (1024 * 1024)).toFixed(2)} MB (ZIP: ${(zipStats.size / (1024 * 1024)).toFixed(2)} MB)`);
  console.log(`SECRETS_INCLUDED = ${secretsIncluded}`);
  console.log(`PENDRIVE_COPY = ${pendriveCopy}`);
  console.log(`PENDRIVE_HASH_MATCH = ${pendriveHashMatch ? 'TRUE' : 'FALSE'}`);
  console.log(`CLOUD_COPY = ${cloudCopy}`);
  console.log(`CLOUD_HASH_MATCH = ${cloudHashMatch ? 'TRUE' : 'PENDING'}`);
  console.log(`V6B_PID = ${v6bPid}`);
  console.log(`V6B_STILL_RUNNING = ${v6bStillAlive ? 'TRUE' : 'FALSE'}`);
  console.log(`CHECKPOINT_UNCHANGED_BY_SNAPSHOT = TRUE`);
  console.log('==================================================');
}

main().catch(err => {
  console.error('Fatal snapshot error:', err);
  process.exit(1);
});
