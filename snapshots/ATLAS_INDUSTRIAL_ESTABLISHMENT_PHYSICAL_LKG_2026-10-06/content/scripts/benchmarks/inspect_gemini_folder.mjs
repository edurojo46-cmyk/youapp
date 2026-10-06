import fs from 'node:fs';
import path from 'node:path';

function getDirSize(dir, maxDepth = 6) {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  function walk(d, depth = 0) {
    if (depth > maxDepth) return;
    try {
      for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, ent.name);
        if (ent.isDirectory()) {
          walk(full, depth + 1);
        } else {
          try {
            total += fs.statSync(full).size;
          } catch {}
        }
      }
    } catch {}
  }
  walk(dir);
  return total;
}

const geminiRoot = 'C:\\Users\\Eduardo\\.gemini';
console.log('SUBDIRECTORIES IN C:\\Users\\Eduardo\\.gemini:');
if (fs.existsSync(geminiRoot)) {
  for (const ent of fs.readdirSync(geminiRoot, { withFileTypes: true })) {
    const full = path.join(geminiRoot, ent.name);
    if (ent.isDirectory()) {
      const sz = getDirSize(full);
      console.log(`  ${ent.name}: ${(sz / (1024 * 1024)).toFixed(2)} MB (${(sz / (1024 * 1024 * 1024)).toFixed(3)} GB)`);
      if (ent.name === 'antigravity-ide') {
        // inspect inside antigravity-ide
        console.log('    Inside antigravity-ide:');
        for (const sub of fs.readdirSync(full, { withFileTypes: true })) {
          const subFull = path.join(full, sub.name);
          if (sub.isDirectory()) {
            const subSz = getDirSize(subFull);
            console.log(`      ${sub.name}: ${(subSz / (1024 * 1024)).toFixed(2)} MB (${(subSz / (1024 * 1024 * 1024)).toFixed(3)} GB)`);
          }
        }
      }
    } else {
      console.log(`  ${ent.name} (file): ${(fs.statSync(full).size / (1024 * 1024)).toFixed(2)} MB`);
    }
  }
}
