import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ARTIFACT_FILES = [
  'reports/atlas/discovery/atlas_stage3p_identity_field_design_v1.json',
  'reports/atlas/discovery/atlas_stage3p_identity_semantics_audit_v1.json',
  'reports/atlas/discovery/atlas_stage3p_field_memory_profile_v1.json',
  'reports/atlas/discovery/atlas_stage3p_field_parity_v1.json',
  'reports/atlas/discovery/atlas_stage3p_db_avoidance_v1.json',
  'reports/atlas/discovery/atlas_stage3p_wait_event_comparison_v1.json',
  'reports/atlas/discovery/atlas_stage3p_performance_matrix_v1.json',
  'reports/atlas/discovery/atlas_stage3p_verdict_v1.json'
];

console.log('================================================================');
console.log('⚡ STAGE 3P ARTIFACT HASH REGISTRATION');
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

fs.writeFileSync('reports/atlas/discovery/atlas_stage3p_hashes_manifest_v1.json', JSON.stringify(hashes, null, 2));
console.log('✔ All 8 Stage 3P artifacts hashed and verified.');
