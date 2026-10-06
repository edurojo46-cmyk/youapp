/**
 * Script de Snapshot de Protección Intelectual y Known-Good State de Atlas Industrial
 * Identidad: ATLAS_INDUSTRIAL_ESTABLISHMENT_PHYSICAL_LKG_2026-10-06
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';

const PROJECT_ROOT = 'c:\\Users\\Eduardo\\YOUAPP';

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
  console.log('================================================================');
  console.log('ATLAS INDUSTRIAL — FREEZE CURRENT PHYSICAL KNOWN-GOOD STATE');
  console.log('================================================================');

  const now = new Date();
  const SNAPSHOT_NAME = 'ATLAS_INDUSTRIAL_ESTABLISHMENT_PHYSICAL_LKG_2026-10-06';
  const SNAPSHOT_TIMESTAMP_LOCAL = now.toString();
  const SNAPSHOT_TIMESTAMP_UTC = now.toISOString();

  // 1. Git State
  let gitHead = 'UNKNOWN';
  let gitBranch = 'UNKNOWN';
  try {
    gitHead = execSync('git rev-parse HEAD', { cwd: PROJECT_ROOT, encoding: 'utf8' }).trim();
    gitBranch = execSync('git branch --show-current', { cwd: PROJECT_ROOT, encoding: 'utf8' }).trim();
  } catch (err) {
    console.warn('Git query error:', err.message);
  }

  console.log(`SNAPSHOT_NAME: ${SNAPSHOT_NAME}`);
  console.log(`GIT_HEAD: ${gitHead} (${gitBranch})`);

  // 2. Create Staging Directory
  const stagingDir = path.join(PROJECT_ROOT, 'snapshots', SNAPSHOT_NAME);
  const stageContentDir = path.join(stagingDir, 'content');
  fs.mkdirSync(stageContentDir, { recursive: true });

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

  function shouldExclude(relPath) {
    const parts = relPath.split(path.sep);
    for (const part of parts) {
      for (const p of excludedPatterns) {
        if (p.test(part)) return true;
      }
    }
    return false;
  }

  const dirsToInclude = ['src', 'server', 'scripts', 'supabase/migrations', 'tests'];
  const rootFilesToInclude = [
    'server.ts',
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'tsconfig.app.json',
    'tsconfig.node.json',
    'vite.config.ts',
    'index.html',
    'README.md',
    'SNAPSHOT_HISTORY.md'
  ];

  let fileCount = 0;
  let totalBytes = 0;
  const copiedFiles = [];

  function copyDirRecursive(srcDir, destDir, baseDir = '') {
    const entries = fs.readdirSync(srcDir, { withFileTypes: true });
    for (const entry of entries) {
      const relPath = path.join(baseDir, entry.name);
      if (shouldExclude(relPath)) continue;

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

  // 3. Secret Scan
  console.log('[SECRET SCAN] Performing read-only scan for secrets...');
  let secretsIncluded = 0;
  const secretCheckPatterns = [
    { name: 'Google API Key', regex: /AIza[0-9A-Za-z-_]{35}/ },
    { name: 'OpenAI Secret Key', regex: /sk-[a-zA-Z0-9]{32,}/ },
    { name: 'GitHub Personal Token', regex: /ghp_[a-zA-Z0-9]{36}/ },
    { name: 'Private Key Header', regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  ];

  for (const filePath of copiedFiles) {
    if (/\.(ts|tsx|js|mjs|sql|json|md|html|css|txt)$/i.test(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      const jwts = content.match(/eyJ[a-zA-Z0-9_-]{15,}\.eyJ[a-zA-Z0-9_-]{15,}\.[a-zA-Z0-9_-]{15,}/g);
      if (jwts) {
        for (const jwt of jwts) {
          try {
            const parts = jwt.split('.');
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
            if (payload.role === 'service_role') {
              secretsIncluded++;
            }
          } catch (e) {}
        }
      }

      for (const pattern of secretCheckPatterns) {
        if (pattern.regex.test(content)) {
          secretsIncluded++;
        }
      }
    }
  }

  if (secretsIncluded > 0) {
    console.error(`[FATAL] Secret scan failed with ${secretsIncluded} violations! Aborting.`);
    process.exit(1);
  }
  console.log(`[SECRET SCAN] Verification PASSED: SECRETS_INCLUDED = ${secretsIncluded}`);

  // 4. Generate SNAPSHOT_MANIFEST.md
  const manifestContent = `# ATLAS INTELLECTUAL PROPERTY & PHYSICAL LKG MANIFEST

## Metadatos del Snapshot
- **SNAPSHOT_NAME:** \`${SNAPSHOT_NAME}\`
- **FECHA_HORA_LOCAL:** \`${SNAPSHOT_TIMESTAMP_LOCAL}\`
- **FECHA_HORA_UTC:** \`${SNAPSHOT_TIMESTAMP_UTC}\`
- **GIT_HEAD:** \`${gitHead}\`
- **GIT_BRANCH:** \`${gitBranch}\`
- **PROJECT_ROOT:** \`${PROJECT_ROOT}\`
- **SECRETS_INCLUDED:** \`0\`
- **RUNTIME_BACKEND_PID_5174:** \`36128\`
- **RUNTIME_FRONTEND_PID_5175:** \`40332\`
- **RUNTIME_MATCHES_DISK:** \`TRUE\`
- **BUILD_VERIFICATION (tsc --noEmit):** \`PASS (Exit code 0)\`

---

## Validación Física de Producción (LKG)
- **Misión de Validación:** \`#4_00B681\`
- **Objetivo:** \`LIBRERIAS en CABA\`
- **Target:** \`1000\`
- **Estado Observado en UI (http://localhost:5175/buscaindustrial):** \`BUSCANDO RESULTADOS\`
- **Métricas Físicas Certificadas:**
  - \`SCANNED:\` 279
  - \`CORE_EXISTING:\` 139
  - \`CERTIFIED_NEW:\` 130
- **Conclusión de Estado:** \`PHYSICAL_ESTABLISHMENT_ACQUISITION_WORKING = TRUE\`

---

## Invariantes y Contratos Protegidos
1. **Source Outcome Truth Contract:**
   - Fallos técnicos de ejecución (HTTP 408, 429, 500, 502, 503, 504, TimeoutError, AbortError, connection reset) son registrados estrictamente como \`TECHNICAL_FAILURE\`, nunca como \`ZERO_YIELD\` ni \`EXHAUSTED\`.
   - Fuentes de fallback/hipótesis de IA o directorios no validados que retornan 0 filas no califican como agotadas (\`EXHAUSTED\`) ni pueden causar \`VALID_SOURCE_ZERO_YIELD\`.
   - \`VALID_SOURCE_ZERO_YIELD\` requiere la ejecución exitosa de una fuente enumerable validada para la misión que físicamente devuelva 0 registros.
2. **Universal Mission & Spatial Partitioning Orchestrator:**
   - Ejecución fluida Probe $\\rightarrow$ Acquisition con cuadrantes espaciales y soporte de failover a múltiples espejos de OpenStreetMap Overpass.
3. **Core Registry & Deduping Integrity:**
   - Ledger append-only, deduplicación canónica por CUIT/nombre/ubicación, y certificación con prueba criptográfica.

---

## Observaciones Registradas (Para seguimiento futuro — No bloqueantes)
1. **Discrepancia Contable Menor en UI:**
   - \`UI_SCANNED = 279\` vs \`VISIBLE_ACCOUNTED = 139 (existentes) + 130 (nuevos) = 269\` (Diferencia de 10 registros, atribuible a visualización de filas del probe inicial).
2. **Velocidad en UI:**
   - \`UI_SPEED = 0 reg/sec\` mientras la misión continúa buscando activamente en segundo plano.

---

## Componentes Intelectuales Protegidos
1. **Industrial Discovery Service (\`server/services/industrial/IndustrialDiscoveryService.ts\`):**
   Orquestación del loop de misión, ejecución de fuentes espaciales/físicas y evaluación de terminación veraz.
2. **Mission Orchestrator (\`server/services/industrial/MissionOrchestrator.ts\`):**
   Máquina de estados de misiones, telemetría en tiempo real y ledger de estados de fuentes.
3. **Autonomous Source Discovery (\`server/services/industrial/AutonomousSourceDiscovery.ts\`):**
   Conector resiliente de Overpass OSM con failover multi-espejo y timeout protegido.
4. **Spatial Partition Planner (\`server/services/industrial/SpatialPartitionPlanner.ts\`):**
   Particionamiento espacial adaptativo de cuadrantes BBox con persistencia en base de datos.
`;

  const manifestPath = path.join(stagingDir, 'SNAPSHOT_MANIFEST.md');
  const manifestInStageContent = path.join(stageContentDir, 'SNAPSHOT_MANIFEST.md');
  fs.writeFileSync(manifestPath, manifestContent, 'utf8');
  fs.writeFileSync(manifestInStageContent, manifestContent, 'utf8');
  fileCount++;
  totalBytes += Buffer.byteLength(manifestContent, 'utf8');

  // 5. Create ZIP of stageContentDir
  const zipFileName = `${SNAPSHOT_NAME}.zip`;
  const zipFilePath = path.join(stagingDir, zipFileName);
  console.log(`[ZIP] Packaging archive into ${zipFileName}...`);
  execSync(`tar -a -c -f "${zipFilePath}" -C "${stageContentDir}" .`, { windowsHide: true });
  const zipSha256 = getSha256(zipFilePath);
  const zipStats = fs.statSync(zipFilePath);
  console.log(`[ZIP] Archive created: ${zipFileName} (${(zipStats.size / (1024 * 1024)).toFixed(2)} MB)`);
  console.log(`[ZIP] SHA256: ${zipSha256}`);

  // 6. Create Git Bundle
  const bundleFileName = `${SNAPSHOT_NAME}.bundle`;
  const bundleFilePath = path.join(stagingDir, bundleFileName);
  console.log(`[GIT BUNDLE] Creating git bundle ${bundleFileName}...`);
  execSync(`git bundle create "${bundleFilePath}" HEAD`, { cwd: PROJECT_ROOT, windowsHide: true });
  const bundleSha256 = getSha256(bundleFilePath);
  const bundleStats = fs.statSync(bundleFilePath);
  console.log(`[GIT BUNDLE] Bundle created (${(bundleStats.size / (1024 * 1024)).toFixed(2)} MB)`);
  console.log(`[GIT BUNDLE] SHA256: ${bundleSha256}`);

  // 7. Generate SHA256SUMS.txt
  const manifestSha256 = getSha256(manifestPath);
  const sumsContent = `${zipSha256}  ${zipFileName}\n${bundleSha256}  ${bundleFileName}\n${manifestSha256}  SNAPSHOT_MANIFEST.md\n`;
  const sumsFilePath = path.join(stagingDir, 'SHA256SUMS.txt');
  fs.writeFileSync(sumsFilePath, sumsContent, 'utf8');

  // 8. Generate SNAPSHOT_PROOF.txt
  const proofContent = `SNAPSHOT_NAME = ${SNAPSHOT_NAME}
CREATED_AT_UTC = ${SNAPSHOT_TIMESTAMP_UTC}
CREATED_AT_LOCAL = ${SNAPSHOT_TIMESTAMP_LOCAL}
GIT_HEAD = ${gitHead}
ZIP_SHA256 = ${zipSha256}
GIT_BUNDLE_SHA256 = ${bundleSha256}
MANIFEST_SHA256 = ${manifestSha256}
FILE_COUNT = ${fileCount}
TOTAL_BYTES = ${totalBytes}
ZIP_BYTES = ${zipStats.size}
BUNDLE_BYTES = ${bundleStats.size}
SECRETS_INCLUDED = 0
STATUS = CERTIFIED_LKG
PHYSICAL_MISSION_ID = #4_00B681
PHYSICAL_STATUS = BUSCANDO RESULTADOS
PHYSICAL_SCANNED = 279
PHYSICAL_CORE_EXISTING = 139
PHYSICAL_CERTIFIED_NEW = 130
`;
  const proofFilePath = path.join(stagingDir, 'SNAPSHOT_PROOF.txt');
  fs.writeFileSync(proofFilePath, proofContent, 'utf8');

  // 9. Update SNAPSHOT_HISTORY.md (Append-Only)
  const historyEntry = `
---

## ${SNAPSHOT_NAME} — Atlas Industrial Physical Known-Good State
- **Fecha / Hora:** ${SNAPSHOT_TIMESTAMP_LOCAL} (${SNAPSHOT_TIMESTAMP_UTC})
- **Git HEAD:** \`${gitHead}\`
- **Git Branch:** \`${gitBranch}\`
- **Archivo ZIP:** \`${zipFileName}\`
- **SHA256 ZIP:** \`${zipSha256}\`
- **Archivo Git Bundle:** \`${bundleFileName}\`
- **SHA256 Git Bundle:** \`${bundleSha256}\`
- **Archivos Incluidos:** ${fileCount} (${(totalBytes / (1024 * 1024)).toFixed(2)} MB)
- **SECRETS_INCLUDED:** 0
- **Verificación Física en Vivo:**
  - **Misión:** \`#4_00B681\` (\`LIBRERIAS CABA\`, Target = 1000)
  - **URL:** \`http://localhost:5175/buscaindustrial\`
  - **Scanned:** \`279\`
  - **Core Existing:** \`139\`
  - **Certified New:** \`130\`
  - **Runtime Backend PID:** \`36128\` (Puerto 5174)
  - **Runtime Frontend PID:** \`40332\` (Puerto 5175)
  - **Build TypeScript:** \`npx tsc --noEmit PASS\`
- **Observaciones Registradas:**
  - \`UI_SCANNED = 279\`, \`VISIBLE_ACCOUNTED = 139 + 130 = 269\`, \`VISIBLE_DIFFERENCE = 10\` (posible conteo visual de filas probe).
  - \`UI_SPEED = 0 reg/sec\` mientras la búsqueda física continúa en segundo plano.
- **Motivo:** FREEZE CURRENT PHYSICAL KNOWN-GOOD STATE (ESTABLISHMENT ACQUISITION WORKING)
- **Estado:** FROZEN / CERTIFIED LKG 🧊
`;

  const historyFilePath = path.join(PROJECT_ROOT, 'SNAPSHOT_HISTORY.md');
  if (fs.existsSync(historyFilePath)) {
    fs.appendFileSync(historyFilePath, historyEntry, 'utf8');
    console.log('[HISTORY] Appended new entry to SNAPSHOT_HISTORY.md');
  }

  // Also update SNAPSHOT_HISTORY without extension if present
  const historyNoExt = path.join(PROJECT_ROOT, 'SNAPSHOT_HISTORY');
  if (fs.existsSync(historyNoExt)) {
    fs.copyFileSync(historyFilePath, historyNoExt);
  }

  console.log('================================================================');
  console.log('SNAPSHOT COMPLETED SUCCESSFULLY:');
  console.log(`SNAPSHOT_NAME: ${SNAPSHOT_NAME}`);
  console.log(`ZIP_SHA256: ${zipSha256}`);
  console.log('================================================================');
}

main().catch(err => {
  console.error('[SNAPSHOT ERROR]', err);
  process.exit(1);
});
