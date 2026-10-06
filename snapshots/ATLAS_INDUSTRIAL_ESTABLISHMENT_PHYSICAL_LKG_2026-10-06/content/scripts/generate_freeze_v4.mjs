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
const rootHasher = crypto.createHash('sha256');
const manifestFiles = {};

files.forEach(f => {
  const content = fs.readFileSync(f);
  const relPath = path.relative(engineDir, f).replace(/\\/g, '/');
  const fileHash = crypto.createHash('sha256').update(content).digest('hex');
  manifestFiles[relPath] = {
    sha256: fileHash,
    sizeBytes: content.length
  };
  rootHasher.update(relPath + ':' + fileHash + '\n');
});

const rootSha256 = rootHasher.digest('hex');

const manifest = {
  freezeVersion: 'V4',
  freezeTimestamp: new Date().toISOString(),
  freezeFileCount: files.length,
  freezeRootSha256: rootSha256,
  files: manifestFiles
};

const v4Path = path.resolve('reports/atlas/freeze/RESOLVER_FREEZE_MANIFEST_V4.json');
fs.writeFileSync(v4Path, JSON.stringify(manifest, null, 2));

const generalPath = path.resolve('reports/atlas/freeze/RESOLVER_FREEZE_MANIFEST.json');
fs.writeFileSync(generalPath, JSON.stringify(manifest, null, 2));

console.log('SEMANTIC_RESOLVER_V4_ROOT_SHA256 =', rootSha256);
console.log('FREEZE V4 generated successfully.');
