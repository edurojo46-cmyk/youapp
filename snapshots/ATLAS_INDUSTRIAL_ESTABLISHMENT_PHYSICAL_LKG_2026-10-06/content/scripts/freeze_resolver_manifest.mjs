import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const engineDir = path.resolve('src/lib/atlasGeneralEngine');

function getFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getFiles(fullPath));
    } else {
      results.push(fullPath);
    }
  });
  return results;
}

const files = getFiles(engineDir).sort();
const manifest = {
  freezeTimestamp: new Date().toISOString(),
  freezeFileCount: files.length,
  freezeRootSha256: '',
  files: {}
};

const rootHasher = crypto.createHash('sha256');

files.forEach(f => {
  const content = fs.readFileSync(f);
  const relPath = path.relative(engineDir, f).replace(/\\/g, '/');
  const fileHash = crypto.createHash('sha256').update(content).digest('hex');
  manifest.files[relPath] = {
    sha256: fileHash,
    sizeBytes: content.length
  };
  rootHasher.update(relPath + ':' + fileHash + '\n');
});

manifest.freezeRootSha256 = rootHasher.digest('hex');

const outDir = path.resolve('reports/atlas/freeze');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}
const outPath = path.join(outDir, 'RESOLVER_FREEZE_MANIFEST.json');
fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2), 'utf-8');

console.log('FREEZE_TIMESTAMP =', manifest.freezeTimestamp);
console.log('FREEZE_FILE_COUNT =', manifest.freezeFileCount);
console.log('FREEZE_ROOT_SHA256 =', manifest.freezeRootSha256);
console.log('Manifest written to:', outPath);
