import fs from 'node:fs';
import path from 'node:path';

function getDirSize(dirPath) {
  let totalBytes = 0;
  let fileCount = 0;

  function walk(current) {
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      try {
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.isFile()) {
          const s = fs.statSync(full);
          totalBytes += s.size;
          fileCount++;
        }
      } catch {}
    }
  }

  if (fs.existsSync(dirPath)) {
    walk(dirPath);
  }
  return { totalBytes, totalMB: Number((totalBytes / (1024 * 1024)).toFixed(2)), totalGB: Number((totalBytes / (1024 ** 3)).toFixed(3)), fileCount };
}

function getFileSize(filePath) {
  if (!fs.existsSync(filePath)) return { bytes: 0, mb: 0 };
  const s = fs.statSync(filePath);
  return { bytes: s.size, mb: Number((s.size / (1024 * 1024)).toFixed(2)), gb: Number((s.size / (1024 ** 3)).toFixed(3)) };
}

// 1. C: Drive Stats
const statfs = fs.statfsSync('C:/');
const driveFreeGB = (statfs.bfree * statfs.bsize) / (1024 ** 3);
const driveTotalGB = (statfs.blocks * statfs.bsize) / (1024 ** 3);
const driveUsedGB = driveTotalGB - driveFreeGB;
const driveFreePct = (driveFreeGB / driveTotalGB) * 100;

const rootDir = 'C:/Users/Eduardo/YOUAPP';

// 2. Identify all data_*.ms and key directories
const entries = fs.readdirSync(rootDir, { withFileTypes: true });
const meiliDbDirs = [];
const namedDirs = ['scratch', 'reports', 'dumps', 'snapshots', 'logs', 'bin', 'node_modules', '.git'];

for (const e of entries) {
  if (e.isDirectory() && e.name.startsWith('data_') && e.name.endsWith('.ms')) {
    meiliDbDirs.push(e.name);
  }
}

// Size details for all data_*.ms
const meiliDbDetails = {};
for (const dbName of meiliDbDirs) {
  const fullPath = path.join(rootDir, dbName);
  const total = getDirSize(fullPath);
  
  // Inspect internal LMDB components
  const dataMdb = getFileSize(path.join(fullPath, 'data.mdb'));
  const lockMdb = getFileSize(path.join(fullPath, 'lock.mdb'));
  const tasksDir = getDirSize(path.join(fullPath, 'tasks'));
  const indexesDir = getDirSize(path.join(fullPath, 'indexes'));
  
  // List sub-indexes
  const subIndexes = [];
  const idxPath = path.join(fullPath, 'indexes');
  if (fs.existsSync(idxPath)) {
    const subEntries = fs.readdirSync(idxPath, { withFileTypes: true });
    for (const sub of subEntries) {
      if (sub.isDirectory()) {
        const sSize = getDirSize(path.join(idxPath, sub.name));
        subIndexes.push({ name: sub.name, sizeMB: sSize.totalMB, sizeGB: sSize.totalGB });
      }
    }
  }

  meiliDbDetails[dbName] = {
    totalMB: total.totalMB,
    totalGB: total.totalGB,
    dataMdbMB: dataMdb.mb,
    lockMdbMB: lockMdb.mb,
    tasksDirMB: tasksDir.totalMB,
    indexesDirMB: indexesDir.totalMB,
    subIndexes
  };
}

// Key project directories
const keyDirsSizes = {};
for (const nd of namedDirs) {
  const full = path.join(rootDir, nd);
  if (fs.existsSync(full)) {
    keyDirsSizes[nd] = getDirSize(full);
  }
}

// Find top 25 largest items under C:\Users\Eduardo\YOUAPP
const allItems = [];
for (const e of entries) {
  const full = path.join(rootDir, e.name);
  if (e.isDirectory()) {
    const sz = getDirSize(full);
    allItems.push({ name: e.name, type: 'directory', sizeBytes: sz.totalBytes, sizeMB: sz.totalMB, sizeGB: sz.totalGB });
  } else {
    const fsz = getFileSize(full);
    allItems.push({ name: e.name, type: 'file', sizeBytes: fsz.bytes, sizeMB: fsz.mb, sizeGB: fsz.gb });
  }
}
allItems.sort((a, b) => b.sizeBytes - a.sizeBytes);
const top20Largest = allItems.slice(0, 20);

// Also inspect App Data Directory for IDE logs
const appDataLogsDir = 'C:/Users/Eduardo/.gemini/antigravity-ide/brain/e3e09913-ec3e-4f02-bd71-536fda8d536b';
const appDataLogsSize = fs.existsSync(appDataLogsDir) ? getDirSize(appDataLogsDir) : { totalMB: 0, totalGB: 0 };

const auditReport = {
  TIMESTAMP: new Date().toISOString(),
  DISK_METRICS: {
    DRIVE: 'C:',
    TOTAL_GB: Number(driveTotalGB.toFixed(2)),
    FREE_GB: Number(driveFreeGB.toFixed(2)),
    USED_GB: Number(driveUsedGB.toFixed(2)),
    FREE_PERCENT: Number(driveFreePct.toFixed(2)),
    HEADROOM_ALERT: driveFreeGB < 10 ? 'LOW_DISK_HEADROOM' : 'NORMAL'
  },
  MEILISEARCH_DATABASES: meiliDbDetails,
  KEY_DIRECTORIES: keyDirsSizes,
  APP_DATA_LOGS_SIZE: appDataLogsSize,
  TOP_20_LARGEST_ITEMS: top20Largest
};

fs.writeFileSync('scratch/disk_space_audit_report.json', JSON.stringify(auditReport, null, 2));
console.log(JSON.stringify(auditReport, null, 2));
