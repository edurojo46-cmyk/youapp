import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const dir = path.join(process.cwd(), 'reports', 'atlas', 'discovery');

const artifactFiles = [
  'atlas_stage3q_r5_shadow_fidelity_v1.json',
  'atlas_stage3q_r5_wal_profile_v1.json',
  'atlas_stage3q_r5_16k_gate_v1.json',
  'atlas_stage3q_r5_96k_capacity_v1.json',
  'atlas_stage3q_r5_verdict_v1.json'
];

const entries = {};
for (const file of artifactFiles) {
  const fullPath = path.join(dir, file);
  if (!fs.existsSync(fullPath)) {
    console.error(`FATAL: missing required artifact: ${file}`);
    process.exit(1);
  }
  const content = fs.readFileSync(fullPath);
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  entries[file] = {
    bytes: content.length,
    sha256: hash
  };
  console.log(`Hashed ${file}: ${hash} (${content.length} bytes)`);
}

const manifest = {
  timestamp: new Date().toISOString(),
  stage: 'STAGE3Q-R5',
  title: 'ATLAS STAGE 3Q-R5 ARTIFACTS HASHES MANIFEST',
  artifacts_count: Object.keys(entries).length + 1,
  artifacts: entries
};

const manifestPath = path.join(dir, 'atlas_stage3q_r5_hashes_manifest_v1.json');
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

const selfContent = fs.readFileSync(manifestPath);
const selfHash = crypto.createHash('sha256').update(selfContent).digest('hex');
console.log(`Manifest created at ${manifestPath} (Self SHA256: ${selfHash})`);
