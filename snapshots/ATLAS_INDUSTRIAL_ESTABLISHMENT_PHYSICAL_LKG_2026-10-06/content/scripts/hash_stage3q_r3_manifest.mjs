import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const dir = path.join(process.cwd(), 'reports', 'atlas', 'discovery');

const artifactFiles = [
  'atlas_stage3q_r3_r2_errata_v1.json',
  'atlas_stage3q_r3_timing_reconciliation_v1.json',
  'atlas_stage3q_r3_pg_config_snapshot_v1.json',
  'atlas_stage3q_r3_relation_io_localization_v1.json',
  'atlas_stage3q_r3_fixed_size_matrix_v1.json',
  'atlas_stage3q_r3_checkpoint_write_pressure_v1.json',
  'atlas_stage3q_r3_root_cause_v1.json'
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
  stage: 'STAGE3Q-R3',
  title: 'ATLAS STAGE 3Q-R3 ARTIFACTS HASHES MANIFEST',
  artifacts_count: Object.keys(entries).length + 1,
  artifacts: entries
};

const manifestPath = path.join(dir, 'atlas_stage3q_r3_hashes_manifest_v1.json');
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

// Hash self
const selfContent = fs.readFileSync(manifestPath);
const selfHash = crypto.createHash('sha256').update(selfContent).digest('hex');
console.log(`Manifest created at ${manifestPath} (Self SHA256: ${selfHash})`);
