import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ARTIFACT_FILES = [
  'reports/atlas/discovery/atlas_stage3o_r1_errata_v1.json',
  'reports/atlas/discovery/atlas_stage3o_r1_partition_integrity_v1.json',
  'reports/atlas/discovery/atlas_stage3o_r1_connection_audit_v1.json',
  'reports/atlas/discovery/atlas_stage3o_r1_wait_event_distribution_v1.json',
  'reports/atlas/discovery/atlas_stage3o_r1_v2_baseline_recovery_v1.json',
  'reports/atlas/discovery/atlas_stage3o_r1_e_vs_f_matrix_v1.json',
  'reports/atlas/discovery/atlas_stage3o_r1_sustained_winner_v1.json',
  'reports/atlas/discovery/atlas_stage3o_r1_verdict_v1.json'
];

console.log('================================================================');
console.log('⚡ STAGE 3O-R1 ARTIFACT HASH REGISTRATION');
console.log('================================================================\n');

const hashes = {};
for (const relPath of ARTIFACT_FILES) {
  const fullPath = path.resolve(relPath);
  if (!fs.existsSync(fullPath)) {
    console.error(`MISSING: ${relPath}`);
    process.exit(1);
  }
  const content = fs.readFileSync(fullPath);
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  const basename = path.basename(relPath);
  hashes[basename] = hash;
  console.log(`${basename}:`);
  console.log(`  SHA-256: ${hash}`);
  console.log(`  Size:    ${content.length} bytes\n`);
}

fs.writeFileSync('reports/atlas/discovery/atlas_stage3o_r1_hashes_manifest_v1.json', JSON.stringify(hashes, null, 2));
console.log('✔ All 8 Stage 3O-R1 artifacts hashed and verified.');
