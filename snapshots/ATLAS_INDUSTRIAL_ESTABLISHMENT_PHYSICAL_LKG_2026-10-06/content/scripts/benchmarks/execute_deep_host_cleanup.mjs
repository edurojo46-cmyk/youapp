import fs from 'node:fs';
import path from 'node:path';

function getDiskStats() {
  const stat = fs.statfsSync('C:\\');
  const freeGB = (stat.bfree * stat.bsize) / (1024 * 1024 * 1024);
  const totalGB = (stat.blocks * stat.bsize) / (1024 * 1024 * 1024);
  return {
    freeGB: parseFloat(freeGB.toFixed(2)),
    totalGB: parseFloat(totalGB.toFixed(2)),
    freePercent: parseFloat(((freeGB / totalGB) * 100).toFixed(2))
  };
}

function getDirSize(dir) {
  if (!fs.existsSync(dir)) return 0;
  let bytes = 0;
  function walk(d) {
    try {
      for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, ent.name);
        if (ent.isDirectory()) walk(p);
        else {
          try { bytes += fs.statSync(p).size; } catch {}
        }
      }
    } catch {}
  }
  walk(dir);
  return bytes;
}

async function runDeepCleanup() {
  const report = [];
  function log(msg) {
    console.log(msg);
    report.push(msg);
  }

  const diskBefore = getDiskStats();
  log(`=== INICIO DE LIMPIEZA PROFUNDA SEGURA ===`);
  log(`DISK_FREE_GB_BEFORE: ${diskBefore.freeGB} GB (${diskBefore.freePercent}%) | Total: ${diskBefore.totalGB} GB\n`);

  let totalReclaimedBytes = 0;

  // -------------------------------------------------------------
  // 1. Antigravity Stale Backup (May 2026 - 2.9 GB)
  // -------------------------------------------------------------
  const backupDir = 'C:\\Users\\Eduardo\\.gemini\\antigravity-backup';
  if (fs.existsSync(backupDir)) {
    const sz = getDirSize(backupDir);
    log(`[1] Eliminando backup obsoleto: ${backupDir} (${(sz / (1024 * 1024)).toFixed(2)} MB)...`);
    fs.rmSync(backupDir, { recursive: true, force: true });
    totalReclaimedBytes += sz;
    log(`    ✅ Reclamados ${(sz / (1024 * 1024)).toFixed(2)} MB.`);
  } else {
    log(`[1] ${backupDir} ya no existe.`);
  }

  // -------------------------------------------------------------
  // 2. Inactive Conversation Brains in .gemini\antigravity-ide\brain
  // -------------------------------------------------------------
  const brainDir = 'C:\\Users\\Eduardo\\.gemini\\antigravity-ide\\brain';
  const currentConv = 'e3e09913-ec3e-4f02-bd71-536fda8d536b';
  const prevConv = '541d43b3-ad55-4641-9284-1b04bc24e1c6';

  if (fs.existsSync(brainDir)) {
    log(`\n[2] Purgando brains de conversaciones inactivas en ${brainDir}...`);
    let brainReclaimed = 0;
    let count = 0;
    for (const ent of fs.readdirSync(brainDir, { withFileTypes: true })) {
      if (ent.isDirectory() && ent.name !== currentConv && ent.name !== prevConv) {
        const full = path.join(brainDir, ent.name);
        const sz = getDirSize(full);
        try {
          fs.rmSync(full, { recursive: true, force: true });
          brainReclaimed += sz;
          count++;
        } catch (e) {
          log(`    Error al eliminar ${ent.name}: ${e.message}`);
        }
      }
    }
    totalReclaimedBytes += brainReclaimed;
    log(`    ✅ Eliminadas ${count} carpetas de brain inactivas. Reclamados: ${(brainReclaimed / (1024 * 1024)).toFixed(2)} MB (${(brainReclaimed / (1024 * 1024 * 1024)).toFixed(2)} GB).`);
  }

  // -------------------------------------------------------------
  // 3. Inactive Conversation SQLite DBs in .gemini\antigravity-ide\conversations
  // -------------------------------------------------------------
  const convDir = 'C:\\Users\\Eduardo\\.gemini\\antigravity-ide\\conversations';
  if (fs.existsSync(convDir)) {
    log(`\n[3] Purgando bases SQLite de conversaciones inactivas en ${convDir}...`);
    let convReclaimed = 0;
    let count = 0;
    for (const ent of fs.readdirSync(convDir, { withFileTypes: true })) {
      if (ent.isFile() && ent.name.endsWith('.db')) {
        const baseName = ent.name.replace('.db', '');
        if (baseName !== currentConv && baseName !== prevConv) {
          const full = path.join(convDir, ent.name);
          try {
            const sz = fs.statSync(full).size;
            fs.unlinkSync(full);
            convReclaimed += sz;
            count++;
          } catch (e) {}
        }
      }
    }
    totalReclaimedBytes += convReclaimed;
    log(`    ✅ Eliminadas ${count} bases SQLite inactivas. Reclamados: ${(convReclaimed / (1024 * 1024)).toFixed(2)} MB (${(convReclaimed / (1024 * 1024 * 1024)).toFixed(2)} GB).`);
  }

  // -------------------------------------------------------------
  // 4. Obsolete Installers in Downloads
  // -------------------------------------------------------------
  const dlFiles = [
    'C:\\Users\\Eduardo\\Downloads\\Antigravity IDE.exe',
    'C:\\Users\\Eduardo\\Downloads\\Antigravity.exe'
  ];
  log(`\n[4] Eliminando instaladores antiguos en Downloads...`);
  let dlReclaimed = 0;
  for (const f of dlFiles) {
    if (fs.existsSync(f)) {
      try {
        const sz = fs.statSync(f).size;
        fs.unlinkSync(f);
        dlReclaimed += sz;
        log(`    ✅ Eliminado: ${path.basename(f)} (${(sz / (1024 * 1024)).toFixed(2)} MB)`);
      } catch (e) {
        log(`    Error al eliminar ${f}: ${e.message}`);
      }
    }
  }
  totalReclaimedBytes += dlReclaimed;

  // -------------------------------------------------------------
  // 5. Application Updaters Cache
  // -------------------------------------------------------------
  const updaterDirs = [
    'C:\\Users\\Eduardo\\AppData\\Local\\antigravity-updater',
    'C:\\Users\\Eduardo\\AppData\\Local\\televzr_light-updater'
  ];
  log(`\n[5] Purgando caches de actualizadores en AppData\\Local...`);
  let updReclaimed = 0;
  for (const d of updaterDirs) {
    if (fs.existsSync(d)) {
      const sz = getDirSize(d);
      try {
        fs.rmSync(d, { recursive: true, force: true });
        updReclaimed += sz;
        log(`    ✅ Eliminado cache: ${path.basename(d)} (${(sz / (1024 * 1024)).toFixed(2)} MB)`);
      } catch (e) {}
    }
  }
  totalReclaimedBytes += updReclaimed;

  // -------------------------------------------------------------
  // 6. Browser Caches (Chrome & Edge cache)
  // -------------------------------------------------------------
  const browserCaches = [
    'C:\\Users\\Eduardo\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Cache',
    'C:\\Users\\Eduardo\\AppData\\Local\\Microsoft\\Edge\\User Data\\Default\\Cache'
  ];
  log(`\n[6] Purgando caches de navegadores (Chrome / Edge)...`);
  let bcReclaimed = 0;
  for (const d of browserCaches) {
    if (fs.existsSync(d)) {
      const sz = getDirSize(d);
      try {
        fs.rmSync(d, { recursive: true, force: true });
        bcReclaimed += sz;
        log(`    ✅ Purgado cache: ${d} (${(sz / (1024 * 1024)).toFixed(2)} MB)`);
      } catch (e) {}
    }
  }
  totalReclaimedBytes += bcReclaimed;

  // -------------------------------------------------------------
  // 7. CrashDumps and Temp files
  // -------------------------------------------------------------
  log(`\n[7] Purgando CrashDumps y archivos en Temp...`);
  const crashDir = 'C:\\Users\\Eduardo\\AppData\\Local\\CrashDumps';
  let crashReclaimed = 0;
  if (fs.existsSync(crashDir)) {
    const sz = getDirSize(crashDir);
    try {
      fs.rmSync(crashDir, { recursive: true, force: true });
      crashReclaimed += sz;
      log(`    ✅ Eliminado CrashDumps (${(sz / (1024 * 1024)).toFixed(2)} MB)`);
    } catch (e) {}
  }
  totalReclaimedBytes += crashReclaimed;

  const tempDir = 'C:\\Users\\Eduardo\\AppData\\Local\\Temp';
  let tempReclaimed = 0;
  if (fs.existsSync(tempDir)) {
    for (const item of fs.readdirSync(tempDir, { withFileTypes: true })) {
      const full = path.join(tempDir, item.name);
      try {
        const sz = fs.statSync(full).size;
        if (item.isDirectory()) {
          fs.rmSync(full, { recursive: true, force: true });
        } else {
          fs.unlinkSync(full);
        }
        tempReclaimed += sz;
      } catch (e) {} // skip locked files
    }
    log(`    ✅ Purgados archivos no bloqueados en Temp: ${(tempReclaimed / (1024 * 1024)).toFixed(2)} MB`);
  }
  totalReclaimedBytes += tempReclaimed;

  // -------------------------------------------------------------
  // 8. Obsolete Benchmark txt logs in YOUAPP root
  // -------------------------------------------------------------
  const txtFiles = [
    'benchmark_results_final7.txt',
    'benchmark_results_final5.txt'
  ];
  let txtReclaimed = 0;
  for (const f of txtFiles) {
    if (fs.existsSync(f)) {
      try {
        const sz = fs.statSync(f).size;
        fs.unlinkSync(f);
        txtReclaimed += sz;
        log(`    ✅ Eliminado archivo benchmark obsoleto: ${f} (${(sz / (1024 * 1024)).toFixed(2)} MB)`);
      } catch (e) {}
    }
  }
  totalReclaimedBytes += txtReclaimed;

  // -------------------------------------------------------------
  // Final verification
  // -------------------------------------------------------------
  const diskAfter = getDiskStats();
  log(`\n=============================================================`);
  log(`📊 RESULTADO FINAL DE LA LIMPIEZA PROFUNDA:`);
  log(`=============================================================`);
  log(`DISK_FREE_GB_BEFORE: ${diskBefore.freeGB} GB (${diskBefore.freePercent}%)`);
  log(`DISK_FREE_GB_AFTER: ${diskAfter.freeGB} GB (${diskAfter.freePercent}%)`);
  log(`DISK_FREE_PERCENT_AFTER: ${diskAfter.freePercent}%`);
  log(`NET_DISK_GAINED_GB: ${(diskAfter.freeGB - diskBefore.freeGB).toFixed(2)} GB`);
  log(`TOTAL_BYTES_RECLAIMED: ${(totalReclaimedBytes / (1024 * 1024 * 1024)).toFixed(3)} GB`);
  log(`OBJETIVO >= 15 GB ALCANZADO: ${diskAfter.freeGB >= 15 ? 'SI (PASS)' : 'NO'}`);
  log(`OBJETIVO PREFERIDO >= 20 GB ALCANZADO: ${diskAfter.freeGB >= 20 ? 'SI (PASS)' : 'EN CURSO'}`);

  const summary = {
    TIMESTAMP: new Date().toISOString(),
    DISK_FREE_GB_BEFORE: diskBefore.freeGB,
    DISK_FREE_PERCENT_BEFORE: diskBefore.freePercent,
    DISK_FREE_GB_AFTER: diskAfter.freeGB,
    DISK_FREE_PERCENT_AFTER: diskAfter.freePercent,
    NET_DISK_GAINED_GB: parseFloat((diskAfter.freeGB - diskBefore.freeGB).toFixed(2)),
    TOTAL_BYTES_RECLAIMED_GB: parseFloat((totalReclaimedBytes / (1024 * 1024 * 1024)).toFixed(3)),
    TARGET_15GB_REACHED: diskAfter.freeGB >= 15,
    TARGET_20GB_REACHED: diskAfter.freeGB >= 20,
    DETAILS: report
  };
  fs.writeFileSync('scratch/deep_disk_cleanup_summary.json', JSON.stringify(summary, null, 2));
}

runDeepCleanup().catch(err => console.error('Deep Cleanup Error:', err));
