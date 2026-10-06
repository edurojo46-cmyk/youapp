import fs from 'node:fs';
import path from 'node:path';

function getDirSize(dir) {
  if (!fs.existsSync(dir)) return { exists: false, bytes: 0, mb: 0, gb: 0 };
  let bytes = 0;
  let files = 0;
  let errors = 0;
  function walk(d, depth = 0) {
    if (depth > 8) return;
    try {
      const entries = fs.readdirSync(d, { withFileTypes: true });
      for (const ent of entries) {
        const full = path.join(d, ent.name);
        try {
          if (ent.isDirectory()) {
            walk(full, depth + 1);
          } else {
            bytes += fs.statSync(full).size;
            files++;
          }
        } catch {
          errors++;
        }
      }
    } catch {
      errors++;
    }
  }
  walk(dir);
  return {
    exists: true,
    bytes,
    mb: parseFloat((bytes / (1024 * 1024)).toFixed(2)),
    gb: parseFloat((bytes / (1024 * 1024 * 1024)).toFixed(3)),
    files,
    errors
  };
}

const targets = [
  'C:\\Users\\Eduardo\\Downloads',
  'C:\\$Recycle.Bin',
  'C:\\Users\\Eduardo\\AppData\\Local\\Temp',
  'C:\\Windows\\Temp',
  'C:\\Users\\Eduardo\\AppData\\Local\\CrashDumps',
  'C:\\Users\\Eduardo\\AppData\\Local\\npm-cache',
  'C:\\Users\\Eduardo\\.cargo',
  'C:\\Users\\Eduardo\\.rustup',
  'C:\\Users\\Eduardo\\.gradle',
  'C:\\Users\\Eduardo\\.m2',
  'C:\\Users\\Eduardo\\.cache',
  'C:\\Users\\Eduardo\\AppData\\Local\\Microsoft\\Windows\\INetCache',
  'C:\\Users\\Eduardo\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Cache',
  'C:\\Users\\Eduardo\\AppData\\Local\\Microsoft\\Edge\\User Data\\Default\\Cache',
  'C:\\Users\\Eduardo\\AppData\\Local\\pip\\cache',
  'C:\\ProgramData\\Package Cache',
  'C:\\Windows\\SoftwareDistribution\\Download'
];

console.log('AUDITING HOST DIRECTORIES FOR RECLAIMABLE SPACE:');
const results = {};
for (const t of targets) {
  const sz = getDirSize(t);
  results[t] = sz;
  if (sz.exists) {
    console.log(`${t} -> ${sz.gb} GB (${sz.mb} MB) [${sz.files} files]`);
  } else {
    console.log(`${t} -> DOES NOT EXIST`);
  }
}

// Also check top-level folders under C:\Users\Eduardo
console.log('\nTOP LEVEL FOLDERS UNDER C:\\Users\\Eduardo:');
try {
  const userRoot = 'C:\\Users\\Eduardo';
  const entries = fs.readdirSync(userRoot, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(userRoot, ent.name);
    try {
      if (ent.isDirectory() && ent.name !== 'YOUAPP') {
        const sz = getDirSize(full);
        if (sz.mb > 50) {
          console.log(`  ${full}: ${sz.gb} GB (${sz.mb} MB)`);
        }
      }
    } catch {}
  }
} catch (e) {
  console.error('Error scanning user root:', e.message);
}
