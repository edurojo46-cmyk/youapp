import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function scanDir(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  list.sort();
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(scanDir(fullPath));
    } else {
      results.push({ path: fullPath.replace(/\\/g, '/'), size: stat.size });
    }
  }
  return results;
}

const entries = scanDir('data_v2_shadow.ms');
const manifestStr = entries.map(e => `${e.path}:${e.size}`).join('\n');
const hash = crypto.createHash('sha256').update(manifestStr).digest('hex');

console.log('Search V1 Manifest Hash:', hash);
console.log('Matches Expected:', hash === 'f4347cfbc1d554c2f015cf56b1e854fc09fa226e30611fe5aa55c62941c10128');
