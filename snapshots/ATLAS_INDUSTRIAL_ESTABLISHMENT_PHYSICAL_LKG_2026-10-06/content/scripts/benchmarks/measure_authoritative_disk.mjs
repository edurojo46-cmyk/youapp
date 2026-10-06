import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const GIB = 1024 * 1024 * 1024;

function getDiskStats() {
  const stat = fs.statfsSync('C:\\');
  const totalBytes = Number(stat.blocks) * Number(stat.bsize);
  const freeBytes = Number(stat.bfree) * Number(stat.bsize);
  const freeGiB = freeBytes / GIB;
  const totalGiB = totalBytes / GIB;
  const freePercent = (freeBytes / totalBytes) * 100;
  return {
    totalBytes,
    freeBytes,
    totalGiB: parseFloat(totalGiB.toFixed(4)),
    freeGiB: parseFloat(freeGiB.toFixed(4)),
    freePercent: parseFloat(freePercent.toFixed(2))
  };
}

function getDirSizeBytes(dir) {
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

function getPageFileSize() {
  try {
    const ps = `(Get-CimInstance Win32_PageFileUsage).AllocatedBaseSize`;
    const out = execSync(`powershell -NoProfile -Command "${ps}"`, { encoding: 'utf-8' }).trim();
    const mb = parseFloat(out);
    return {
      bytes: mb * 1024 * 1024,
      mib: mb,
      gib: parseFloat((mb / 1024).toFixed(4))
    };
  } catch (e) {
    return { error: e.message, bytes: 0, gib: 0 };
  }
}

const disk = getDiskStats();
const szShadow = getDirSizeBytes('data_v2_shadow.ms');
const szDelta = getDirSizeBytes('data_discovery_delta.ms');
const szBuild = getDirSizeBytes('data_build.ms');
const szPagefile = getPageFileSize();

const report = {
  TIMESTAMP: new Date().toISOString(),
  CONVENTION: 'Binary IEC: 1 GiB = 1024^3 bytes (1,073,741,824 bytes)',
  DISK_TOTAL_BYTES: disk.totalBytes,
  DISK_FREE_BYTES: disk.freeBytes,
  DISK_TOTAL_GIB: disk.totalGiB,
  DISK_FREE_GIB: disk.freeGiB,
  DISK_FREE_PERCENT: disk.freePercent,
  DATABASES: {
    'data_v2_shadow.ms': {
      bytes: szShadow,
      gib: parseFloat((szShadow / GIB).toFixed(4))
    },
    'data_discovery_delta.ms': {
      bytes: szDelta,
      gib: parseFloat((szDelta / GIB).toFixed(4))
    },
    'data_build.ms': {
      bytes: szBuild,
      gib: parseFloat((szBuild / GIB).toFixed(4))
    }
  },
  PAGEFILE: {
    path: 'C:\\pagefile.sys',
    allocatedBytes: szPagefile.bytes,
    allocatedGiB: szPagefile.gib
  },
  GATE_15_GIB_DECISION: disk.freeGiB >= 15 ? 'PASS_PROCEED_TO_RUN3' : 'FAIL_HOLD_RUN3'
};

console.log(JSON.stringify(report, null, 2));
fs.writeFileSync('scratch/authoritative_disk_measurement.json', JSON.stringify(report, null, 2));
